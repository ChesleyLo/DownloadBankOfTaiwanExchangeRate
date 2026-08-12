# 排程設定（穩定觸發）

**對象：** 維運／技術人員  
**英文版：** [SCHEDULING.en.md](./SCHEDULING.en.md)

GitHub 內建 `schedule`（cron）常會延遲或整段漏跑。本專案改為：

1. **主要：** 外部排程服務（cron-job.org）定時呼叫 GitHub API（`workflow_dispatch`）  
2. **備援：** GitHub 內建 cron 每天 3 次（台灣 10:30 / 15:30 / 18:30，週一至週五）  
3. **本機（可選）：** Mac LaunchAgent（Mac 開著時才會跑）  
4. **手動：** Actions 頁面或本機 `scripts/trigger_update.sh`

---

## 0. 目前排程總覽（台灣時間，週一至週五）

| 層級 | 來源 | 執行時間 | 說明 |
| --- | --- | --- | --- |
| **主要** | [cron-job.org](https://console.cron-job.org/jobs) | **09:10、10:10、11:10、12:10、13:10、14:10、15:10、16:10、18:30** | 已建立 Job **8253638**（營業時段）、**8253639**（晚間） |
| **備援** | GitHub 內建 `schedule` | **10:30、15:30、18:30** | 僅防 cron-job.org 中斷；不可靠，勿當主要 |
| **本機** | Mac LaunchAgent | 同上 09:10–16:10 + 18:30 | 執行 `./scripts/install_launchd.sh` 後生效；**Mac 需開機** |
| **手動** | 本機／Actions | 隨時 | `./scripts/trigger_update.sh` 或 Actions → Run workflow |

監控連結：

- Actions：https://github.com/ChesleyLo/DownloadBankOfTaiwanExchangeRate/actions  
- cron-job.org：https://console.cron-job.org/jobs  

---

## 0.1 每次執行會做什麼？

1. 下載台銀 CSV → 轉成 JSON  
2. 寫入 `data/bot-xrt-latest.*`，歷史檔寫入 `data/history/`（保留 90 天）  
3. **匯率有變** → commit / push，並 purge jsDelivr CDN  
4. **匯率沒變** → Actions 仍會跑完，但**不會**產生新 commit（正常行為）

判斷是否「有更新」：看 workflow log 的 `changed=true/false`，或 JSON 的 `fetchedAtUtc` 是否刷新。

---

## 0.2 排程沒啟動時怎麼查？（逐步）

### Step 1：看 GitHub Actions

開啟 [Actions 頁面](https://github.com/ChesleyLo/DownloadBankOfTaiwanExchangeRate/actions)。

| 狀況 | 意義 |
| --- | --- |
| 有 `workflow_dispatch` 且 **success** | 排程有觸發，流程正常 |
| 完全沒有新的 run | 繼續 Step 2 |
| 有 run 但 **failure** | 點進 log 看下載／commit 錯誤 |

### Step 2：看 cron-job.org

開啟 [Jobs 列表](https://console.cron-job.org/jobs) → 點 `BOT FX Rates` → **History**。

| HTTP 結果 | 意義 |
| --- | --- |
| **204** | 觸發成功（GitHub dispatch 常回 No Content） |
| **401 / 403** | GitHub Token 失效或權限不足 → 重新執行 `setup_cron_job.py` |
| **404** | workflow 路徑錯誤 |
| 沒有 History 紀錄 | Job 被停用或排程時間未到 |

重新建立 cron job（會刪除舊的 `BOT FX Rates` 再建）：

```bash
export CRONJOB_API_KEY="你的_api_key"
python3 scripts/setup_cron_job.py
```

### Step 3：手動立即觸發（最快驗證）

```bash
./scripts/trigger_update.sh
```

或 GitHub → Actions → **Update BOT FX Rates** → **Run workflow**。

若手動成功、自動失敗 → 問題在 cron-job.org 或 Token，不是下載腳本。

### Step 4：本機 Mac 備援（可選）

cron-job.org 暫時異常、且 Mac 常開時：

```bash
./scripts/install_launchd.sh
```

日誌：`/tmp/bot-fx-trigger.log`、`/tmp/bot-fx-trigger.stderr.log`

---

## 0.3 常見誤解

| 現象 | 其實是… |
| --- | --- |
| Actions 有跑，repo 沒新 commit | 匯率未變，`changed=false`，正常 |
| CDN JSON 內容看起來一樣 | 同上；或 jsDelivr 快取，可 purge |
| 週末沒跑 | 設計如此（僅週一至週五） |
| GitHub `schedule` 沒跑 | 已知不穩，靠 cron-job.org 為主 |
| 台灣假日沒跑 | 目前 cron 僅排除週末，國定假日仍會觸發（可接受） |

---

## 0.4 建議日常監控

每週快速檢查一次即可：

1. cron-job.org History 近期有 **204**  
2. GitHub Actions 平日有 `workflow_dispatch` 成功紀錄  
3. CDN JSON 的 `fetchedAtUtc` 為近期時間：  
   https://cdn.jsdelivr.net/gh/ChesleyLo/DownloadBankOfTaiwanExchangeRate@main/data/bot-xrt-latest.json  

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

### 1.2 一鍵建立（有 API Key 時）

1. 到 [cron-job.org](https://cron-job.org) 免費註冊 → **Settings** 複製 **API Key**  
2. 在本機執行（GitHub token 會自動用 `gh auth token`）：

```bash
export CRONJOB_API_KEY="你的_cron-job_api_key"
python3 scripts/setup_cron_job.py
```

會建立兩筆工作（平日）：

- **09:10–16:10** 每小時  
- **18:30** 晚間補抓  

也可先預覽設定：

```bash
python3 scripts/setup_cron_job.py --dry-run
```

### 1.3 手動在 cron-job.org 建立（選用）

若不想用 API，也可在網站手動建立：

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

### 1.4 建議執行時間（台灣）

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

### 1.5 成功怎麼看？

- cron-job.org 執行紀錄為 HTTP **204**（GitHub dispatch 成功常回 204 No Content）  
- GitHub → Actions → **Update BOT FX Rates** 出現 `workflow_dispatch` 執行  

---

## 2. 本機 Mac 備援（已可自動安裝）

若 Mac 常開機，可安裝 LaunchAgent（使用 `gh auth`，不需額外 token）：

```bash
./scripts/install_launchd.sh
```

會在平日 09:10–16:10 與 18:30 觸發。日誌：`/tmp/bot-fx-trigger.log`

---

## 3. 本機／伺服器 crontab

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

## 4. GitHub 內建備援排程

目前 workflow 內備援（UTC）：

| UTC | 台灣時間 | 用途 |
| --- | --- | --- |
| `30 2 * * 1-5` | 10:30 | 備援 |
| `30 7 * * 1-5` | 15:30 | 備援 |
| `30 10 * * 1-5` | 18:30 | 備援 |

**請以外部 cron 為主**；備援只是防止外部服務中斷時完全沒更新。

`concurrency.group: update-bot-rates` 可避免外部與備援同時撞車造成並行衝突（後到的會排隊，不取消進行中的）。

---

## 5. 故障排除（速查表）

| 現象 | 處理 |
| --- | --- |
| cron-job 回 401/403 | GitHub Token 過期或缺 Actions: write；重跑 `setup_cron_job.py` |
| 回 404 | workflow 檔名／repo 路徑錯誤 |
| 回 204 但 Actions 沒跑 | Workflow 是否 disabled；確認 body 的 `ref` 為 `main` |
| 有跑但沒 commit | 匯率未變（正常）；看 log 的 `changed=false` |
| 完全沒 run | 依 **§0.2** 逐步排查 |
| CDN 資料偏舊 | 確認最近 commit；必要時 purge jsDelivr |

詳細排查流程見 **§0.2 排程沒啟動時怎麼查？**

---

## 6. 相關檔案

- `.github/workflows/update-rates.yml`  
- `scripts/trigger_update.sh`  
- `scripts/setup_cron_job.py`（cron-job.org 一鍵建立）  
- `scripts/install_launchd.sh`（Mac 本機備援）  
- [TECHNICAL.zh-TW.md](./TECHNICAL.zh-TW.md)  
