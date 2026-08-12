# Scheduling (reliable triggers)

**Audience:** operators / engineers  
**Chinese version:** [SCHEDULING.zh-TW.md](./SCHEDULING.zh-TW.md)

GitHub’s native `schedule` cron is often delayed or skipped. This project uses:

1. **Primary:** an external cron service calling the GitHub API (`workflow_dispatch`)  
2. **Backup:** sparse GitHub cron (Taiwan 10:30 / 15:30 / 18:30, weekdays)  
3. **Manual:** Actions UI or local `scripts/trigger_update.sh`

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

### 1.3 Suggested times (Taiwan)

```text
09:10, 10:10, 11:10, 12:10, 13:10, 14:10, 15:10, 16:10, 18:30
```

Custom cron (if supported), timezone Asia/Taipei:

```text
10 9-16 * * 1-5
30 18 * * 1-5
```

### 1.4 Success signals

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

## 5. Troubleshooting

| Symptom | Action |
| --- | --- |
| 401/403 from cron | Token missing Actions: write, or expired |
| 404 | Wrong workflow file name / repo path |
| 204 but no Actions run | Workflow disabled, or wrong `ref` |
| Run OK but no commit | Rates unchanged (`changed=false`) — normal |

---

## 6. Related files

- `.github/workflows/update-rates.yml`  
- `scripts/trigger_update.sh`  
- `scripts/setup_cron_job.py` (one-click cron-job.org setup)  
- `scripts/install_launchd.sh` (Mac local fallback)  
- [TECHNICAL.en.md](./TECHNICAL.en.md)  
