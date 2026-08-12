#!/usr/bin/env bash
# Install macOS LaunchAgent as a local fallback scheduler (Mac must be on).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.chesleylo.bot-fx-update"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
WRAPPER="$REPO_ROOT/scripts/launchd_trigger.sh"
LOG="/tmp/bot-fx-trigger.log"

cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:\$PATH"
cd "$REPO_ROOT"
./scripts/trigger_update.sh >> "$LOG" 2>&1
EOF
chmod +x "$WRAPPER"
python3 - <<'PY' "$PLIST" "$WRAPPER" "$LABEL"
import plistlib
import sys
from pathlib import Path

plist_path, wrapper, label = sys.argv[1:4]
intervals = []
for weekday in range(1, 6):  # Mon-Fri
    for hour in range(9, 17):
        intervals.append({"Hour": hour, "Minute": 10, "Weekday": weekday})
    intervals.append({"Hour": 18, "Minute": 30, "Weekday": weekday})

data = {
    "Label": label,
    "ProgramArguments": [wrapper],
    "StartCalendarInterval": intervals,
    "StandardOutPath": "/tmp/bot-fx-trigger.stdout.log",
    "StandardErrorPath": "/tmp/bot-fx-trigger.stderr.log",
    "RunAtLoad": False,
}
Path(plist_path).parent.mkdir(parents=True, exist_ok=True)
with open(plist_path, "wb") as f:
    plistlib.dump(data, f)
print(f"wrote {plist_path} ({len(intervals)} schedules)")
PY

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"
launchctl kickstart -k "gui/$(id -u)/$LABEL" 2>/dev/null || true

echo "Installed LaunchAgent: $LABEL"
echo "Log: $LOG"
echo "Test now: $WRAPPER"
