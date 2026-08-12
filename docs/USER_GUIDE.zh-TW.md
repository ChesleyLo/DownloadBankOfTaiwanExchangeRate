# 使用說明（繁體中文）

**專案：** Download Bank of Taiwan Exchange Rate  
**對象：** 業務／營運／NetSuite 管理員（不需修改程式也能完成設定）  
**英文版：** [USER_GUIDE.en.md](./USER_GUIDE.en.md)  
**技術文件：** [TECHNICAL.zh-TW.md](./TECHNICAL.zh-TW.md)

---

## 1. 這套系統在做什麼？

台灣銀行（BOT）每日牌告匯率有官方 CSV，但網站有防爬機制，**NetSuite 通常無法直接下載**。

本專案會：

1. 自動從台銀下載每日匯率 CSV  
2. 轉成 JSON  
3. 放到免費 CDN（jsDelivr）  
4. 讓 NetSuite 用固定網址下載 JSON，直接使用匯率欄位

```text
台銀官方 CSV → GitHub 自動更新 → CDN → NetSuite 下載 JSON
```

---

## 2. 你需要的網址

### 正式使用（建議）

```text
https://cdn.jsdelivr.net/gh/ChesleyLo/DownloadBankOfTaiwanExchangeRate@main/data/bot-xrt-latest.json
```

### 備援（CDN 異常時）

```text
https://raw.githubusercontent.com/ChesleyLo/DownloadBankOfTaiwanExchangeRate/main/data/bot-xrt-latest.json
```

### 原始 CSV（通常不需要）

```text
https://cdn.jsdelivr.net/gh/ChesleyLo/DownloadBankOfTaiwanExchangeRate@main/data/bot-xrt-latest.csv
```

在瀏覽器開啟 JSON 網址，應可看到類似：

```json
{
  "source": "Bank of Taiwan",
  "base": "TWD",
  "byCurrency": {
    "USD": {
      "cash": { "buy": 31.87, "sell": 32.54 },
      "spot": { "buy": 32.195, "sell": 32.345 }
    }
  }
}
```

---

## 3. 匯率欄位怎麼看？

| 欄位路徑 | 意義 |
| --- | --- |
| `byCurrency.USD.cash.buy` | 美金現金買入 |
| `byCurrency.USD.cash.sell` | 美金現金賣出 |
| `byCurrency.USD.spot.buy` | 美金即期買入 |
| `byCurrency.USD.spot.sell` | 美金即期賣出 |
| `byCurrency.USD.forward.buy.30` | 美金遠期 30 天買入 |
| `byCurrency.USD.forward.sell.30` | 美金遠期 30 天賣出 |

- 基準幣：`base` = `TWD`（新台幣）  
- 幣別代碼：`USD`、`EUR`、`JPY`、`CNY`…  
- 若該幣別當日無報價，數值為 `null`（不是 0）  
- NetSuite 匯入匯率時，實務上常使用 **即期賣出** `spot.sell`

完整幣別清單以當日 JSON 的 `rates` / `byCurrency` 為準。

---

## 4. 資料多久更新一次？

目前為**三層排程**（詳見 [SCHEDULING.zh-TW.md](./SCHEDULING.zh-TW.md)）：

| 層級 | 時間（台灣，平日） |
| --- | --- |
| **主要** cron-job.org | 09:10–16:10 每小時 + 18:30 |
| **備援** GitHub cron | 10:30、15:30、18:30 |
| **本機** Mac（可選） | 同上；Mac 需開機 |

說明：

- **匯率沒有變化時不會重新 commit**（Actions 仍會跑）  
- 週末預設不跑  
- 排程沒啟動時的排查步驟見 [SCHEDULING.zh-TW.md §0.2](./SCHEDULING.zh-TW.md#02-排程沒啟動時怎麼查逐步)  
- **如何確認排程有執行**見 [SCHEDULING.zh-TW.md §0.5](./SCHEDULING.zh-TW.md#05-如何確認排程有無執行日常操作)  
- 手動觸發：`./scripts/trigger_update.sh` 或 GitHub → Actions → Run workflow

---

## 5. NetSuite 設定步驟（管理員）

### 5.1 前置條件

- 有權限建立 Script / Script Deployment  
- 有權限寫入 File Cabinet  
- 帳號允許對外 HTTPS 連線至 `cdn.jsdelivr.net`

### 5.2 上傳腳本

1. 開啟檔案：`netsuite/DownloadBotRates_SS2.js`  
2. 在 NetSuite：**Customization → Scripting → Scripts → New**  
3. 上傳該 JS，Script Type 選 **Scheduled**  
4. 儲存

### 5.3 建議 Script Parameters（可選）

| Parameter ID | 類型 | 用途 |
| --- | --- | --- |
| `custscript_bot_cdn_json_url` | Free-Form Text | 覆寫 CDN URL |
| `custscript_bot_rate_field` | Free-Form Text | 例如 `spot.sell` |
| `custscript_bot_apply_rates` | Checkbox | 是否啟用寫入匯率邏輯（預設關閉，僅記錄 log） |

若未建立參數，腳本會使用程式內預設 CDN URL。

### 5.4 修改資料夾

腳本內 `FOLDER_ID` 預設為 `-15`（File Cabinet 根目錄）。  
請改成你們實際用來存放匯率檔的資料夾 Internal ID。

### 5.5 Deployment

1. 建立 **Scheduled Script Deployment**  
2. Status：Released  
3. Schedule：建議台灣收盤後每日一次（例如 17:00 或 19:00）  
4. 先 **Execute Now** 測試一次

### 5.6 成功時會做什麼？

1. 從 CDN 下載 JSON  
2. `JSON.parse` 直接使用  
3. 存到 File Cabinet：  
   - `bot-xrt-latest.json`  
   - `bot-xrt-YYYY-MM-DD.json`  
4. 在 Execution Log 留下 audit 訊息（含 USD 即期賣出等摘要）

> GitHub 端歷史檔放在 `data/history/`，預設只保留最近 90 天；NetSuite File Cabinet 的命名與此獨立。

> 預設**不會**自動寫入 NetSuite Currency Rate 記錄。若要寫入，請技術人員依技術文件開啟並調整 `maybeApplyRates`。

---

## 6. 如何在報表／流程中使用？

常見做法：

1. Scheduled Script 每天把最新 JSON 存進 File Cabinet  
2. 其他 Script / Workflow 讀取該檔，取 `byCurrency.<幣別>.spot.sell`  
3. 寫入你們的匯率表、自訂記錄或交易換算邏輯

範例概念：

```javascript
const payload = JSON.parse(cdnResponseBody);
const rate = payload.byCurrency.USD.spot.sell; // 例如 32.345
```

---

## 7. 常見問題（FAQ）

### Q1. CDN 顯示找不到檔案？

多半是 GitHub repository 被設成 **Private**。jsDelivr 只能讀 **Public** repo。請確認：

https://github.com/ChesleyLo/DownloadBankOfTaiwanExchangeRate

### Q2. 看到的匯率不是最新？

可能原因：

1. 今日匯率尚未變動（系統不會無謂 commit）  
2. jsDelivr 快取尚未刷新  
3. **排程沒有觸發** → 見 [SCHEDULING.zh-TW.md §0.2](./SCHEDULING.zh-TW.md#02-排程沒啟動時怎麼查逐步)

### Q3. 排程好像沒在跑？／如何確認排程有執行？

**日常確認（由快到慢）：**

1. [GitHub Actions](https://github.com/ChesleyLo/DownloadBankOfTaiwanExchangeRate/actions) 是否有 `workflow_dispatch` 且成功  
2. [cron-job.org History](https://console.cron-job.org/jobs) 是否 HTTP **204**  
3. [CDN JSON](https://cdn.jsdelivr.net/gh/ChesleyLo/DownloadBankOfTaiwanExchangeRate@main/data/bot-xrt-latest.json) 的 `fetchedAtUtc` 是否近期（匯率未變時可能不更新，屬正常）  
4. 懷疑故障時執行 `./scripts/trigger_update.sh` 手動測試  

完整說明與每週檢查清單：[SCHEDULING.zh-TW.md §0.5](./SCHEDULING.zh-TW.md#05-如何確認排程有無執行日常操作)

### Q4. NetSuite 下載失敗（HTTP 非 200）？

檢查：

1. CDN URL 是否正確  
2. NetSuite 是否允許連線 `cdn.jsdelivr.net`  
3. Script Deployment 是否 Released  
4. Execution Log 錯誤訊息

### Q5. 可以直接給 NetSuite 台銀官方網址嗎？

**不建議。** 台銀有 bot 防護，NetSuite `N/https` 常會失敗。請一律使用本專案 CDN JSON。

### Q6. 資料可不可以商用？

匯率來源為台灣銀行公開資訊；CDN 檔案為排程鏡像，可能有延遲。正式使用前請依貴公司合規要求確認，並標示資料來源。

---

## 8. 聯絡與文件索引

| 文件 | 說明 |
| --- | --- |
| [USER_GUIDE.zh-TW.md](./USER_GUIDE.zh-TW.md) | 本使用說明（中文） |
| [USER_GUIDE.en.md](./USER_GUIDE.en.md) | User Guide (English) |
| [TECHNICAL.zh-TW.md](./TECHNICAL.zh-TW.md) | 技術文件（中文） |
| [TECHNICAL.en.md](./TECHNICAL.en.md) | Technical Guide (English) |
| [../README.md](../README.md) | 專案總覽 |

如需修改下載排程、JSON 欄位或 NetSuite 寫入邏輯，請改看技術文件。
