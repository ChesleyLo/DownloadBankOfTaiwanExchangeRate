#!/usr/bin/env python3
"""Create cron-job.org jobs that trigger Update BOT FX Rates via GitHub API."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

API = "https://api.cron-job.org"
REPO = "ChesleyLo/DownloadBankOfTaiwanExchangeRate"
WORKFLOW = "update-rates.yml"
DISPATCH_URL = (
    f"https://api.github.com/repos/{REPO}/actions/workflows/{WORKFLOW}/dispatches"
)
TITLE_PREFIX = "BOT FX Rates"


def resolve_github_token(explicit: str | None) -> str:
    if explicit:
        return explicit.strip()
    env = os.environ.get("GITHUB_TOKEN", "").strip()
    if env:
        return env
    try:
        out = subprocess.check_output(["gh", "auth", "token"], text=True).strip()
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        raise RuntimeError(
            "GitHub token required. Set GITHUB_TOKEN or run: gh auth login"
        ) from exc
    if not out:
        raise RuntimeError("gh auth token is empty")
    return out


def api_request(api_key: str, method: str, path: str, payload: dict | None = None) -> dict:
    data = None
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"cron-job.org {method} {path} -> HTTP {exc.code}: {detail}") from exc


def list_jobs(api_key: str) -> list[dict]:
    result = api_request(api_key, "GET", "/jobs")
    return result.get("jobs", [])


def delete_job(api_key: str, job_id: int) -> None:
    api_request(api_key, "DELETE", f"/jobs/{job_id}")


def build_job(title: str, github_token: str, hours: list[int], minutes: list[int]) -> dict:
    return {
        "job": {
            "title": title,
            "url": DISPATCH_URL,
            "enabled": True,
            "saveResponses": True,
            "requestMethod": 1,  # POST
            "requestTimeout": 60,
            "redirectSuccess": True,
            "schedule": {
                "timezone": "Asia/Taipei",
                "expiresAt": 0,
                "hours": hours,
                "minutes": minutes,
                "mdays": [-1],
                "months": [-1],
                "wdays": [1, 2, 3, 4, 5],  # Mon-Fri
            },
            "extendedData": {
                "headers": {
                    "Accept": "application/vnd.github+json",
                    "Authorization": f"Bearer {github_token}",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "Content-Type": "application/json",
                },
                "body": json.dumps({"ref": "main"}),
            },
        }
    }


def create_job(api_key: str, job_payload: dict) -> int:
    result = api_request(api_key, "PUT", "/jobs", job_payload)
    job_id = result.get("jobId")
    if not job_id:
        raise RuntimeError(f"Unexpected create response: {result}")
    return int(job_id)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cronjob-api-key",
        default=os.environ.get("CRONJOB_API_KEY", ""),
        help="cron-job.org API key (Settings page)",
    )
    parser.add_argument(
        "--github-token",
        default="",
        help="GitHub PAT with Actions:write (default: gh auth token)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print payloads without calling cron-job.org",
    )
    args = parser.parse_args()

    api_key = args.cronjob_api_key.strip()
    if not api_key and not args.dry_run:
        print(
            "ERROR: set CRONJOB_API_KEY or pass --cronjob-api-key\n"
            "Get it from https://console.cron-job.org/settings",
            file=sys.stderr,
        )
        return 1

    github_token = resolve_github_token(args.github_token or None)

    jobs_to_create = [
        (
            f"{TITLE_PREFIX} - Business hours",
            build_job(
                f"{TITLE_PREFIX} - Business hours",
                github_token,
                hours=[9, 10, 11, 12, 13, 14, 15, 16],
                minutes=[10],
            ),
        ),
        (
            f"{TITLE_PREFIX} - Evening",
            build_job(
                f"{TITLE_PREFIX} - Evening",
                github_token,
                hours=[18],
                minutes=[30],
            ),
        ),
    ]

    if args.dry_run:
        print(json.dumps(jobs_to_create, indent=2, ensure_ascii=False))
        return 0

    existing = list_jobs(api_key)
    removed = 0
    for job in existing:
        title = job.get("title", "")
        if title.startswith(TITLE_PREFIX):
            delete_job(api_key, int(job["jobId"]))
            removed += 1
            print(f"removed old job {job['jobId']}: {title}")

    created: list[tuple[int, str]] = []
    for title, payload in jobs_to_create:
        job_id = create_job(api_key, payload)
        created.append((job_id, title))
        print(f"created job {job_id}: {title}")

    print(f"done removed={removed} created={len(created)}")
    print("verify: https://console.cron-job.org/jobs")
    print("verify: https://github.com/ChesleyLo/DownloadBankOfTaiwanExchangeRate/actions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
