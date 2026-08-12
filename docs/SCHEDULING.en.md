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

### 1.2 Create a job on cron-job.org

1. Sign up at [https://cron-job.org](https://cron-job.org)  
2. Create a cronjob:

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

## 2. Local / server trigger

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

## 3. GitHub backup schedule

| UTC | Taiwan | Role |
| --- | --- | --- |
| `30 2 * * 1-5` | 10:30 | backup |
| `30 7 * * 1-5` | 15:30 | backup |
| `30 10 * * 1-5` | 18:30 | backup |

Treat the external cron as primary.  
`concurrency.group: update-bot-rates` prevents overlapping runs from fighting each other.

---

## 4. Troubleshooting

| Symptom | Action |
| --- | --- |
| 401/403 from cron | Token missing Actions: write, or expired |
| 404 | Wrong workflow file name / repo path |
| 204 but no Actions run | Workflow disabled, or wrong `ref` |
| Run OK but no commit | Rates unchanged (`changed=false`) — normal |

---

## 5. Related files

- `.github/workflows/update-rates.yml`  
- `scripts/trigger_update.sh`  
- [TECHNICAL.en.md](./TECHNICAL.en.md)  
