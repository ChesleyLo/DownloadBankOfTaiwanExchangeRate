# Scheduling (reliable triggers)

**Audience:** operators / engineers  
**Chinese version:** [SCHEDULING.zh-TW.md](./SCHEDULING.zh-TW.md)

GitHub’s native `schedule` cron is often delayed or skipped. This project uses:

1. **Primary:** external cron (cron-job.org) calling the GitHub API (`workflow_dispatch`)  
2. **Backup:** sparse GitHub cron (Taiwan 10:30 / 15:30 / 18:30, weekdays)  
3. **Local (optional):** Mac LaunchAgent (only when the Mac is on)  
4. **Manual:** Actions UI or local `scripts/trigger_update.sh`

---

## 0. Current schedule overview (Taiwan time, Mon–Fri)

| Layer | Source | Times | Notes |
| --- | --- | --- | --- |
| **Primary** | [cron-job.org](https://console.cron-job.org/jobs) | **09:10–16:10 hourly, 18:30** | Jobs **8253638** (business hours), **8253639** (evening) |
| **Backup** | GitHub `schedule` | **10:30, 15:30, 18:30** | Fallback only; do not rely on it |
| **Local** | Mac LaunchAgent | same as primary | after `./scripts/install_launchd.sh`; **Mac must be on** |
| **Manual** | local / Actions | anytime | `./scripts/trigger_update.sh` or Run workflow |

Monitor:

- Actions: https://github.com/ChesleyLo/DownloadBankOfTaiwanExchangeRate/actions  
- cron-job.org: https://console.cron-job.org/jobs  

---

## 0.1 What each run does

1. Download BOT CSV → convert to JSON  
2. Write `data/bot-xrt-latest.*`; archives under `data/history/` (90-day retention)  
3. **Rates changed** → commit / push and purge jsDelivr CDN  
4. **Rates unchanged** → workflow still succeeds but **no new commit** (expected)

Check `changed=true/false` in logs, or whether `fetchedAtUtc` refreshed in JSON.

---

## 0.2 Schedule not running? (step-by-step)

### Step 1: GitHub Actions

Open [Actions](https://github.com/ChesleyLo/DownloadBankOfTaiwanExchangeRate/actions).

| Observation | Meaning |
| --- | --- |
| `workflow_dispatch` + **success** | Trigger works |
| No new runs | continue to Step 2 |
| Runs but **failure** | inspect download/commit logs |

### Step 2: cron-job.org

Open [Jobs](https://console.cron-job.org/jobs) → `BOT FX Rates` → **History**.

| HTTP | Meaning |
| --- | --- |
| **204** | dispatch OK |
| **401 / 403** | GitHub token expired or missing Actions: write → rerun `setup_cron_job.py` |
| **404** | wrong workflow URL |
| No history | job disabled or not yet due |

Recreate jobs:

```bash
export CRONJOB_API_KEY="your_api_key"
python3 scripts/setup_cron_job.py
```

### Step 3: Manual trigger (fastest test)

```bash
./scripts/trigger_update.sh
```

Or Actions → **Update BOT FX Rates** → **Run workflow**.

Manual OK + auto fails → cron-job.org or token issue, not the download script.

### Step 4: Local Mac fallback (optional)

```bash
./scripts/install_launchd.sh
```

Logs: `/tmp/bot-fx-trigger.log`, `/tmp/bot-fx-trigger.stderr.log`

---

## 0.3 Common misconceptions

| Symptom | Reality |
| --- | --- |
| Actions ran, no new commit | rates unchanged (`changed=false`) — normal |
| CDN JSON looks the same | same reason; or jsDelivr cache — purge if needed |
| Nothing on weekends | by design (weekdays only) |
| GitHub `schedule` skipped | known issue; rely on cron-job.org |
| Public holidays still run | cron excludes weekends only, not TW holidays |

---

## 0.4 Recommended weekly checks

1. cron-job.org History shows recent **204** responses  
2. GitHub Actions has successful weekday `workflow_dispatch` runs  
3. CDN JSON `fetchedAtUtc` is recent:  
   https://cdn.jsdelivr.net/gh/ChesleyLo/DownloadBankOfTaiwanExchangeRate@main/data/bot-xrt-latest.json  

---

## 1. Recommended external cron (cron-job.org, free)

### 1.1 Create a GitHub token

1. GitHub → **Settings → Developer settings → Personal access tokens**  
2. Prefer a **fine-grained token**:  
   - Repository access: only `DownloadBankOfTaiwanExchangeRate`  
   - Permissions: **Actions: Read and write**  
3. Copy the token (shown once)

> Never commit the token. Store it only in the external cron service’s secret fields.

### 1.2 One-command setup (when you have an API key)

1. Sign up at [cron-job.org](https://cron-job.org) → copy **API Key** from **Settings**  
2. Run locally (GitHub token uses `gh auth token` automatically):

```bash
export CRONJOB_API_KEY="your_cron_job_api_key"
python3 scripts/setup_cron_job.py
```

Creates two weekday jobs:

- **09:10–16:10** hourly  
- **18:30** evening catch-up  

Preview without creating:

```bash
python3 scripts/setup_cron_job.py --dry-run
```

### 1.3 Manual setup on cron-job.org (optional)

If you prefer the web UI:

| Field | Value |
| --- | --- |
| Title | `BOT FX Rates - Update` |
| URL | `https://api.github.com/repos/ChesleyLo/DownloadBankOfTaiwanExchangeRate/actions/workflows/update-rates.yml/dispatches` |
| Schedule | see below |
| Request method | **POST** |
| Timezone | **Asia/Taipei** |

**Headers:**

```text
Accept: application/vnd.github+json
Authorization: Bearer <YOUR_GITHUB_TOKEN>
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json
```

**Body:**

```json
{"ref":"main"}
```

### 1.4 Suggested times (Taiwan)

```text
09:10, 10:10, 11:10, 12:10, 13:10, 14:10, 15:10, 16:10, 18:30
```

Custom cron (if supported), timezone Asia/Taipei:

```text
10 9-16 * * 1-5
30 18 * * 1-5
```

### 1.5 Success signals

- cron-job.org shows HTTP **204**  
- GitHub Actions shows a `workflow_dispatch` run for **Update BOT FX Rates**

---

## 2. Local Mac fallback (installable)

If your Mac is usually on, install a LaunchAgent (uses `gh auth`, no extra token):

```bash
./scripts/install_launchd.sh
```

Runs on weekdays at 09:10–16:10 and 18:30. Log: `/tmp/bot-fx-trigger.log`

---

## 3. Local / server crontab

```bash
# A) gh already logged in
./scripts/trigger_update.sh

# B) PAT
export GITHUB_TOKEN=ghp_xxx
./scripts/trigger_update.sh

# C) repository_dispatch
./scripts/trigger_update.sh --mode repository_dispatch
```

Example crontab:

```cron
10 9-16 * * 1-5  GITHUB_TOKEN=ghp_xxx /path/to/repo/scripts/trigger_update.sh >>/tmp/bot-fx.log 2>&1
30 18 * * 1-5    GITHUB_TOKEN=ghp_xxx /path/to/repo/scripts/trigger_update.sh >>/tmp/bot-fx.log 2>&1
```

---

## 4. GitHub backup schedule

| UTC | Taiwan | Role |
| --- | --- | --- |
| `30 2 * * 1-5` | 10:30 | backup |
| `30 7 * * 1-5` | 15:30 | backup |
| `30 10 * * 1-5` | 18:30 | backup |

Treat the external cron as primary.  
`concurrency.group: update-bot-rates` prevents overlapping runs from fighting each other.

---

## 5. Troubleshooting (quick reference)

| Symptom | Action |
| --- | --- |
| 401/403 from cron | GitHub token expired or missing Actions: write; rerun `setup_cron_job.py` |
| 404 | wrong workflow file / repo path |
| 204 but no Actions run | workflow disabled, or wrong `ref` in body |
| Run OK but no commit | rates unchanged (`changed=false`) — normal |
| No runs at all | follow **§0.2** step-by-step |
| Stale CDN data | check recent commits; purge jsDelivr if needed |

Full triage flow: **§0.2 Schedule not running?**

---

## 6. Related files

- `.github/workflows/update-rates.yml`  
- `scripts/trigger_update.sh`  
- `scripts/setup_cron_job.py` (one-click cron-job.org setup)  
- `scripts/install_launchd.sh` (Mac local fallback)  
- [TECHNICAL.en.md](./TECHNICAL.en.md)  
