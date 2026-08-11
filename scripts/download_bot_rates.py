#!/usr/bin/env python3
"""Download Bank of Taiwan daily FX rates CSV, convert to JSON, publish for CDN."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from curl_cffi import requests

BOT_CSV_URL = "https://rate.bot.com.tw/xrt/flcsv/0/day"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "data" / "bot-xrt-latest.csv"
DEFAULT_RETENTION_DAYS = 90
FORWARD_DAYS = (10, 30, 60, 90, 120, 150, 180)
HISTORY_NAME_RE = re.compile(r"^bot-xrt-(\d{4}-\d{2}-\d{2})\.(csv|json)$")

# CSV columns after currency code:
# buy_label, cash_buy, spot_buy, fwd10..180_buy,
# sell_label, cash_sell, spot_sell, fwd10..180_sell
BUY_CASH = 2
BUY_SPOT = 3
BUY_FWD_START = 4
SELL_CASH = 12
SELL_SPOT = 13
SELL_FWD_START = 14


def download_csv(url: str = BOT_CSV_URL, timeout: int = 45) -> bytes:
    response = requests.get(
        url,
        impersonate="chrome",
        timeout=timeout,
        headers={
            "Referer": "https://rate.bot.com.tw/xrt?Lang=zh-TW",
            "Accept": "text/csv,application/octet-stream,*/*",
            "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        },
        allow_redirects=True,
    )
    response.raise_for_status()

    content_type = (response.headers.get("content-type") or "").lower()
    body = response.content
    if "text/html" in content_type or body.lstrip().startswith(b"<!DOCTYPE"):
        raise RuntimeError(
            "BOT returned an HTML challenge page instead of CSV. "
            "Retry later or check WAF blocking."
        )
    if b"," not in body[:200]:
        raise RuntimeError("Downloaded content does not look like CSV.")
    return body


def _to_rate(raw: str | None) -> float | None:
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None
    try:
        value = float(text)
    except ValueError:
        return None
    if value == 0:
        return None
    return value


def _forward_block(cols: list[str], start: int) -> dict[str, float | None]:
    return {
        str(day): _to_rate(cols[start + idx] if start + idx < len(cols) else None)
        for idx, day in enumerate(FORWARD_DAYS)
    }


def csv_to_payload(csv_bytes: bytes, fetched_at_utc: str) -> dict:
    text = csv_bytes.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        raise RuntimeError("CSV has no rows.")

    rates: list[dict] = []
    by_currency: dict[str, dict] = {}

    for row in rows[1:]:
        if not row or not row[0].strip():
            continue
        # Pad trailing empty fields from CSV rows ending with comma
        cols = list(row) + [""] * max(0, 21 - len(row))
        currency = cols[0].strip().upper()
        if len(currency) != 3:
            continue

        entry = {
            "currency": currency,
            "cash": {
                "buy": _to_rate(cols[BUY_CASH]),
                "sell": _to_rate(cols[SELL_CASH]),
            },
            "spot": {
                "buy": _to_rate(cols[BUY_SPOT]),
                "sell": _to_rate(cols[SELL_SPOT]),
            },
            "forward": {
                "buy": _forward_block(cols, BUY_FWD_START),
                "sell": _forward_block(cols, SELL_FWD_START),
            },
        }
        rates.append(entry)
        by_currency[currency] = entry

    if not rates:
        raise RuntimeError("CSV parsed but no currency rows found.")

    return {
        "source": "Bank of Taiwan",
        "sourceUrl": BOT_CSV_URL,
        "base": "TWD",
        "fetchedAtUtc": fetched_at_utc,
        "rateCount": len(rates),
        "rates": rates,
        "byCurrency": by_currency,
    }


def _write_if_changed(path: Path, content: bytes) -> bool:
    previous = path.read_bytes() if path.exists() else None
    if previous == content:
        return False
    path.write_bytes(content)
    return True


def history_dir(data_dir: Path) -> Path:
    return data_dir / "history"


def migrate_legacy_archives(data_dir: Path) -> list[Path]:
    """Move data/bot-xrt-YYYY-MM-DD.* into data/history/."""
    moved: list[Path] = []
    dest_root = history_dir(data_dir)
    dest_root.mkdir(parents=True, exist_ok=True)
    for path in sorted(data_dir.glob("bot-xrt-*.*")):
        if path.name.startswith("bot-xrt-latest"):
            continue
        if not HISTORY_NAME_RE.match(path.name):
            continue
        dest = dest_root / path.name
        if dest.exists():
            path.unlink()
        else:
            path.replace(dest)
            moved.append(dest)
    return moved


def prune_history(data_dir: Path, retention_days: int, today: datetime | None = None) -> list[Path]:
    """Delete history files older than retention_days. Returns deleted paths."""
    if retention_days < 1:
        raise ValueError("retention_days must be >= 1")

    now = today or datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=retention_days)).date()
    deleted: list[Path] = []
    root = history_dir(data_dir)
    if not root.exists():
        return deleted

    for path in sorted(root.glob("bot-xrt-*.*")):
        match = HISTORY_NAME_RE.match(path.name)
        if not match:
            continue
        file_date = datetime.strptime(match.group(1), "%Y-%m-%d").date()
        if file_date < cutoff:
            path.unlink()
            deleted.append(path)
    return deleted


def write_outputs(
    content: bytes,
    latest_csv: Path,
    archive: bool,
    retention_days: int = DEFAULT_RETENTION_DAYS,
) -> dict:
    data_dir = latest_csv.parent
    data_dir.mkdir(parents=True, exist_ok=True)
    hist_dir = history_dir(data_dir)
    hist_dir.mkdir(parents=True, exist_ok=True)

    fetched_at = datetime.now(timezone.utc).isoformat()
    payload = csv_to_payload(content, fetched_at)
    json_text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    json_bytes = json_text.encode("utf-8")

    latest_json = latest_csv.with_name("bot-xrt-latest.json")
    csv_changed = _write_if_changed(latest_csv, content)
    json_changed = _write_if_changed(latest_json, json_bytes)
    changed = csv_changed or json_changed

    migrated = migrate_legacy_archives(data_dir)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    archive_csv = hist_dir / f"bot-xrt-{today}.csv"
    archive_json = hist_dir / f"bot-xrt-{today}.json"
    if archive:
        if changed or not archive_csv.exists():
            archive_csv.write_bytes(content)
        if changed or not archive_json.exists():
            archive_json.write_bytes(json_bytes)

    deleted = prune_history(data_dir, retention_days=retention_days)

    meta_path = latest_csv.parent / "bot-xrt-latest.meta.txt"
    meta_path.write_text(
        "\n".join(
            [
                f"source={BOT_CSV_URL}",
                f"fetched_at_utc={fetched_at}",
                f"csv_sha256={hashlib.sha256(content).hexdigest()}",
                f"json_sha256={hashlib.sha256(json_bytes).hexdigest()}",
                f"csv_bytes={len(content)}",
                f"json_bytes={len(json_bytes)}",
                f"rate_count={payload['rateCount']}",
                f"history_dir={hist_dir.as_posix()}",
                f"retention_days={retention_days}",
                f"history_migrated={len(migrated)}",
                f"history_pruned={len(deleted)}",
                f"changed={'yes' if changed else 'no'}",
                "",
            ]
        ),
        encoding="utf-8",
    )

    return {
        "changed": changed or bool(migrated) or bool(deleted),
        "latest_csv": latest_csv,
        "latest_json": latest_json,
        "archive_csv": archive_csv if archive else None,
        "archive_json": archive_json if archive else None,
        "csv_bytes": len(content),
        "json_bytes": len(json_bytes),
        "rate_count": payload["rateCount"],
        "history_migrated": len(migrated),
        "history_pruned": len(deleted),
        "retention_days": retention_days,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Path for bot-xrt-latest.csv (JSON is written beside it)",
    )
    parser.add_argument(
        "--no-archive",
        action="store_true",
        help="Do not write dated archive copies under data/history/",
    )
    parser.add_argument(
        "--retention-days",
        type=int,
        default=DEFAULT_RETENTION_DAYS,
        help=f"Keep only the latest N days in data/history/ (default: {DEFAULT_RETENTION_DAYS})",
    )
    args = parser.parse_args()

    try:
        content = download_csv()
        result = write_outputs(
            content,
            args.output,
            archive=not args.no_archive,
            retention_days=args.retention_days,
        )
    except Exception as exc:  # noqa: BLE001 - surface any download failure to CI
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"csv={result['latest_csv']}")
    print(f"json={result['latest_json']}")
    print(f"csv_bytes={result['csv_bytes']}")
    print(f"json_bytes={result['json_bytes']}")
    print(f"rate_count={result['rate_count']}")
    print(f"retention_days={result['retention_days']}")
    print(f"history_migrated={result['history_migrated']}")
    print(f"history_pruned={result['history_pruned']}")
    print(f"changed={str(result['changed']).lower()}")
    if result["archive_json"]:
        print(f"archive_json={result['archive_json']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
