# 排程設定（穩定觸發）

**對象：** 維運／技術人員  
**英文版：** [SCHEDULING.en.md](./SCHEDULING.en.md)

GitHub 內建 `schedule`（cron）常會延遲或整段漏跑。本專案改為：

1. **主要：** 外部排程服務定時呼叫 GitHub API（`workflow_dispatch`）  
2. **備援：** GitHub 內建 cron 每天僅 3 次（台灣 10:30 / 15:30 / 18:30，週一至週五）  
3. **手動：** Actions 頁面或本機 `scripts/trigger_update.sh`

---

## 1. 建議的外部排程（cron-job.org，免費）

### 1.1 建立 GitHub Token

1. GitHub → **Settings → Developer settings → Personal access tokens**  
2. 建議用 **Fine-grained token**：  
   - Resource owner：你的帳號  
   - Repository access：只選 `DownloadBankOfTaiwanExchangeRate`  
   - Permissions：  
     - **Actions: Read and write**（用來觸發 workflow）  
3. 產生後複製 token（只顯示一次）

> Token 不要 commit 進 repo。只貼到外部排程服務的密鑰欄位。

### 1.2 在 cron-job.org 建立工作

1. 註冊 [https://cron-job.org](https://cron-job.org)  
2. Create cronjob，設定：

| 欄位 | 建議值 |
| --- | --- |
| Title | `BOT FX Rates - Update` |
| URL | `https://api.github.com/repos/ChesleyLo/DownloadBankOfTaiwanExchangeRate/actions/workflows/update-rates.yml/dispatches` |
| Schedule | 見下方 |
| Request method | **POST** |
| Timezone | **Asia/Taipei** |

**Headers：**

```text
Accept: application/vnd.github+json
Authorization: Bearer <YOUR_GITHUB_TOKEN>
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json
```

**Request body：**

```json
{"ref":"main"}
```

### 1.3 建議執行時間（台灣）

營業日每小時整點後 10 分（與舊設計接近，但改由外部觸發）：

```text
09:10, 10:10, 11:10, 12:10, 13:10, 14:10, 15:10, 16:10, 18:30
```

cron-job.org 可建多筆，或用自訂 cron（若介面支援）：

```text
10 9-16 * * 1-5
30 18 * * 1-5
```

（時區選 Asia/Taipei）

### 1.4 成功怎麼看？

- cron-job.org 執行紀錄為 HTTP **204**（GitHub dispatch 成功常回 204 No Content）  
- GitHub → Actions → **Update BOT FX Rates** 出現 `workflow_dispatch` 執行  

---

## 2. 本機／伺服器手動或 crontab

```bash
# 方式 A：已 gh login
./scripts/trigger_update.sh

# 方式 B：使用 PAT
export GITHUB_TOKEN=ghp_xxx
./scripts/trigger_update.sh

# 方式 C：repository_dispatch
./scripts/trigger_update.sh --mode repository_dispatch
```

Linux crontab 範例（需先 `chmod +x scripts/trigger_update.sh`）：

```cron
10 9-16 * * 1-5  GITHUB_TOKEN=ghp_xxx /path/to/repo/scripts/trigger_update.sh >>/tmp/bot-fx.log 2>&1
30 18 * * 1-5    GITHUB_TOKEN=ghp_xxx /path/to/repo/scripts/trigger_update.sh >>/tmp/bot-fx.log 2>&1
```

---

## 3. GitHub 內建備援排程

目前 workflow 內備援（UTC）：

| UTC | 台灣時間 | 用途 |
| --- | --- | --- |
| `30 2 * * 1-5` | 10:30 | 備援 |
| `30 7 * * 1-5` | 15:30 | 備援 |
| `30 10 * * 1-5` | 18:30 | 備援 |

**請以外部 cron 為主**；備援只是防止外部服務中斷時完全沒更新。

`concurrency.group: update-bot-rates` 可避免外部與備援同時撞車造成並行衝突（後到的會排隊，不取消進行中的）。

---

## 4. 故障排除

| 現象 | 處理 |
| --- | --- |
| cron-job 回 401/403 | Token 權限不足或過期；需 Actions: write |
| 回 404 | workflow 檔名／repo 路徑錯誤 |
| 回 204 但 Actions 沒跑 | 看 Workflow 是否 disabled；確認 ref=`main` |
| 有跑但沒 commit | 匯率未變（正常）；看 log 的 `changed=false` |

---

## 5. 相關檔案

- `.github/workflows/update-rates.yml`  
- `scripts/trigger_update.sh`  
- [TECHNICAL.zh-TW.md](./TECHNICAL.zh-TW.md)  
