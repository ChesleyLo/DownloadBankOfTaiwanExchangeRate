#!/usr/bin/env python3
"""Download Bank of Taiwan daily FX rates CSV and save for CDN publishing."""

from __future__ import annotations

import argparse
import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path

from curl_cffi import requests

BOT_CSV_URL = "https://rate.bot.com.tw/xrt/flcsv/0/day"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "data" / "bot-xrt-latest.csv"


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


def write_outputs(content: bytes, latest_path: Path, archive: bool) -> dict:
    latest_path.parent.mkdir(parents=True, exist_ok=True)
    previous = latest_path.read_bytes() if latest_path.exists() else None
    changed = previous != content

    if changed:
        latest_path.write_bytes(content)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    archive_path = latest_path.parent / f"bot-xrt-{today}.csv"
    if archive and (changed or not archive_path.exists()):
        archive_path.write_bytes(content)

    meta_path = latest_path.parent / "bot-xrt-latest.meta.txt"
    meta_path.write_text(
        "\n".join(
            [
                f"source={BOT_CSV_URL}",
                f"fetched_at_utc={datetime.now(timezone.utc).isoformat()}",
                f"sha256={hashlib.sha256(content).hexdigest()}",
                f"bytes={len(content)}",
                f"changed={'yes' if changed else 'no'}",
                "",
            ]
        ),
        encoding="utf-8",
    )

    return {
        "changed": changed,
        "latest_path": latest_path,
        "archive_path": archive_path if archive else None,
        "bytes": len(content),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Path for bot-xrt-latest.csv",
    )
    parser.add_argument(
        "--no-archive",
        action="store_true",
        help="Do not write dated archive copy",
    )
    args = parser.parse_args()

    try:
        content = download_csv()
        result = write_outputs(content, args.output, archive=not args.no_archive)
    except Exception as exc:  # noqa: BLE001 - surface any download failure to CI
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"saved={result['latest_path']}")
    print(f"bytes={result['bytes']}")
    print(f"changed={str(result['changed']).lower()}")
    if result["archive_path"]:
        print(f"archive={result['archive_path']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
