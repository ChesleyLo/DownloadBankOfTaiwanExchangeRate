#!/usr/bin/env bash
# Trigger Update BOT FX Rates via GitHub API (for external cron or local use).
#
# Auth (one of):
#   export GITHUB_TOKEN=ghp_xxx          # classic / fine-grained PAT
#   # or already logged in: gh auth status
#
# Usage:
#   ./scripts/trigger_update.sh
#   ./scripts/trigger_update.sh --repo ChesleyLo/DownloadBankOfTaiwanExchangeRate
#   ./scripts/trigger_update.sh --mode repository_dispatch

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-ChesleyLo/DownloadBankOfTaiwanExchangeRate}"
REF="${GITHUB_REF:-main}"
MODE="workflow_dispatch"
EVENT_TYPE="update-bot-rates"
WORKFLOW_FILE="update-rates.yml"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="$2"
      shift 2
      ;;
    --ref)
      REF="$2"
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    --event-type)
      EVENT_TYPE="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

auth_header=()
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  auth_header=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
elif command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  # Prefer gh when available (uses its stored credentials)
  if [[ "$MODE" == "workflow_dispatch" ]]; then
    echo "Triggering workflow_dispatch via gh: $REPO ($WORKFLOW_FILE) ref=$REF"
    gh workflow run "$WORKFLOW_FILE" --repo "$REPO" --ref "$REF"
    echo "OK"
    exit 0
  fi
  TOKEN="$(gh auth token)"
  auth_header=(-H "Authorization: Bearer ${TOKEN}")
else
  echo "ERROR: set GITHUB_TOKEN or login with: gh auth login" >&2
  exit 1
fi

API="https://api.github.com"
COMMON=(-fsS -X POST -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "${auth_header[@]}")

if [[ "$MODE" == "workflow_dispatch" ]]; then
  URL="$API/repos/$REPO/actions/workflows/$WORKFLOW_FILE/dispatches"
  BODY=$(printf '{"ref":"%s"}' "$REF")
  echo "POST $URL"
  curl "${COMMON[@]}" "$URL" -d "$BODY"
  echo "OK: workflow_dispatch queued for $REPO@$REF"
elif [[ "$MODE" == "repository_dispatch" ]]; then
  URL="$API/repos/$REPO/dispatches"
  BODY=$(printf '{"event_type":"%s","client_payload":{"source":"trigger_update.sh"}}' "$EVENT_TYPE")
  echo "POST $URL"
  curl "${COMMON[@]}" "$URL" -d "$BODY"
  echo "OK: repository_dispatch '$EVENT_TYPE' sent to $REPO"
else
  echo "ERROR: --mode must be workflow_dispatch or repository_dispatch" >&2
  exit 1
fi
