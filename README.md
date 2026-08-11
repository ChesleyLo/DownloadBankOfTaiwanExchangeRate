# 台灣銀行每日匯率 → 免費 CDN → NetSuite

自動下載[台灣銀行牌告匯率 CSV](https://rate.bot.com.tw/xrt/flcsv/0/day)，轉成 **JSON** 後存到 GitHub，再透過 **jsDelivr 免費 CDN** 提供穩定 HTTPS 網址，供 NetSuite SuiteScript 直接 `JSON.parse` 使用（不必再解析 CSV）。

## 文件（Documentation）

| 語言 Language | 使用文件 Markdown | 技術文件 Markdown | 使用文件 Word | 技術文件 Word |
| --- | --- | --- | --- | --- |
| 繁體中文 | [docs/USER_GUIDE.zh-TW.md](docs/USER_GUIDE.zh-TW.md) | [docs/TECHNICAL.zh-TW.md](docs/TECHNICAL.zh-TW.md) | [docs/word/USER_GUIDE.zh-TW.docx](docs/word/USER_GUIDE.zh-TW.docx) | [docs/word/TECHNICAL.zh-TW.docx](docs/word/TECHNICAL.zh-TW.docx) |
| English | [docs/USER_GUIDE.en.md](docs/USER_GUIDE.en.md) | [docs/TECHNICAL.en.md](docs/TECHNICAL.en.md) | [docs/word/USER_GUIDE.en.docx](docs/word/USER_GUIDE.en.docx) | [docs/word/TECHNICAL.en.docx](docs/word/TECHNICAL.en.docx) |

完整索引： [docs/README.md](docs/README.md)

- **使用文件**：給業務／管理員——如何取得 CDN 網址、NetSuite 設定、FAQ  
- **技術文件**：給工程師——架構、CSV/JSON 契約、排程、如何修改下載／轉換／NetSuite 邏輯  
- **Word 檔**：位於 `docs/word/`；更新 Markdown 後可執行 `python3 scripts/md_to_docx.py` 重新產生

## CDN URLs

**JSON（建議 / recommended）：**

```text
https://cdn.jsdelivr.net/gh/ChesleyLo/DownloadBankOfTaiwanExchangeRate@main/data/bot-xrt-latest.json
```

**CSV（可選 / optional）：**

```text
https://cdn.jsdelivr.net/gh/ChesleyLo/DownloadBankOfTaiwanExchangeRate@main/data/bot-xrt-latest.csv
```

**備援 / fallback (GitHub Raw):**

```text
https://raw.githubusercontent.com/ChesleyLo/DownloadBankOfTaiwanExchangeRate/main/data/bot-xrt-latest.json
```

## 架構 Architecture

```text
台銀 CSV URL
    │  (scripts/download_bot_rates.py + curl_cffi → JSON)
    ▼
GitHub repo
  /data/bot-xrt-latest.csv
  /data/bot-xrt-latest.json
    │  (GitHub Actions + jsDelivr purge)
    ▼
jsDelivr CDN
    │
    ▼
NetSuite Scheduled Script (N/https.get + JSON.parse)
```

### JSON 節錄 / excerpt

```json
{
  "source": "Bank of Taiwan",
  "base": "TWD",
  "fetchedAtUtc": "2026-08-11T13:50:00+00:00",
  "rateCount": 19,
  "byCurrency": {
    "USD": {
      "currency": "USD",
      "cash": { "buy": 31.87, "sell": 32.54 },
      "spot": { "buy": 32.195, "sell": 32.345 },
      "forward": {
        "buy": { "10": 32.214, "30": 32.164 },
        "sell": { "10": 32.318, "30": 32.272 }
      }
    }
  },
  "rates": ["…same objects in array…"]
}
```

無報價為 `null`（不是 `0`）。 Missing quotes are `null`, not `0`.

## 快速開始 Quick start

```bash
python3 -m pip install -r requirements.txt
python3 scripts/download_bot_rates.py
```

產出 / outputs：

- `data/bot-xrt-latest.json` — NetSuite / CDN 主檔  
- `data/bot-xrt-latest.csv` — 台銀原始 CSV  
- `data/bot-xrt-YYYY-MM-DD.{csv,json}` — 當日歸檔  
- `data/bot-xrt-latest.meta.txt` — checksum  

排程：平日台灣 09:10–16:10 每小時 + 18:30（詳見使用文件）。  
NetSuite 腳本：`netsuite/DownloadBotRates_SS2.js`（設定步驟見使用文件）。

## 注意事項 Notes

- 請勿讓 NetSuite 直連台銀官方下載網址（有 bot 防護）。  
- Repository 必須為 **public**，jsDelivr 才能提供 CDN。  
- 匯率來源為台灣銀行；CDN 為排程鏡像，可能有延遲。  

## 授權與免責 Disclaimer

本專案為技術串接範例。數值以台灣銀行官方為準；商業使用請自行確認合規與正確性。
