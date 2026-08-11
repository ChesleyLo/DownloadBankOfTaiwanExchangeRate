# 台灣銀行每日匯率 → 免費 CDN → NetSuite

自動下載[台灣銀行牌告匯率 CSV](https://rate.bot.com.tw/xrt/flcsv/0/day)，存到 GitHub，再透過 **jsDelivr 免費 CDN** 提供穩定 HTTPS 網址，供 NetSuite SuiteScript 下載。

## 為什麼需要 CDN？

| 直接打台銀 | 經由 CDN |
| --- | --- |
| 有 Akamai bot 防護，NetSuite `N/https` 常被擋 | CDN 為一般靜態檔，NetSuite 可穩定 GET |
| URL / 行為偶發變更 | 固定 URL：`.../data/bot-xrt-latest.csv` |
| 無邊緣快取 | 全球 CDN 節點 |

## 免費 CDN 評估（本專案採用 jsDelivr）

| 方案 | 費用 | 適合本情境 | 說明 |
| --- | --- | --- | --- |
| **GitHub + jsDelivr**（採用） | 免費 | ★★★★★ | Public repo 即可；`cdn.jsdelivr.net/gh/...`；可 purge |
| GitHub Raw | 免費 | ★★★☆☆ | 無 CDN 加速，有 rate limit，可當備援 |
| Cloudflare R2 / Pages | 免費額度 | ★★★★☆ | 需額外帳號與設定 |
| Lunaris / FilePost 等 | 免費額度 | ★★☆☆☆ | API 上傳方便，但長期維運與合規較難評估 |

**建議正式路徑（推上 GitHub 後）：**

```text
https://cdn.jsdelivr.net/gh/<OWNER>/<REPO>@main/data/bot-xrt-latest.csv
```

**備援：**

```text
https://raw.githubusercontent.com/<OWNER>/<REPO>/main/data/bot-xrt-latest.csv
```

## 架構

```text
台銀 CSV URL
    │  (scripts/download_bot_rates.py + curl_cffi)
    ▼
GitHub repo /data/bot-xrt-latest.csv
    │  (GitHub Actions 平日排程更新 + jsDelivr purge)
    ▼
jsDelivr CDN
    │
    ▼
NetSuite Scheduled Script (N/https.get) → File Cabinet
```

## 快速開始

### 1. 本機下載一次

```bash
python3 -m pip install -r requirements.txt
python3 scripts/download_bot_rates.py
```

成功後會產生：

- `data/bot-xrt-latest.csv`（給 CDN / NetSuite）
- `data/bot-xrt-YYYY-MM-DD.csv`（當日歸檔）
- `data/bot-xrt-latest.meta.txt`（抓取時間與 checksum）

### 2. 推到 GitHub（啟用免費 CDN）

```bash
git init
git add .
git commit -m "feat: publish BOT FX rates to CDN for NetSuite"
# 建立 public repo 後：
git remote add origin https://github.com/<OWNER>/<REPO>.git
git branch -M main
git push -u origin main
```

Actions 工作流：`.github/workflows/update-rates.yml`  
平日台灣約營業時段會自動抓檔；內容有變才 commit，並呼叫 jsDelivr purge。

也可在 GitHub → Actions → **Update BOT FX Rates CSV** → Run workflow 手動執行。

### 3. NetSuite 設定

1. 上傳 `netsuite/DownloadBotRates_SS2.js`
2. 將腳本內 `CDN_CSV_URL` 改成你的 jsDelivr 網址（或新增 Script Parameter `custscript_bot_cdn_csv_url`）
3. 將 `FOLDER_ID` 改成 File Cabinet 目標資料夾 internal id
4. 建立 **Scheduled Script** Deployment（建議台灣時間收盤後執行）
5. 在 NetSuite 後台允許對 `cdn.jsdelivr.net`（以及備援時的 `raw.githubusercontent.com`）的 outbound HTTPS

腳本會：

1. `N/https.get` 從 CDN 下載 CSV  
2. 驗證內容像台銀匯率表  
3. 存成 `bot-xrt-latest.csv` 與當日檔名到 File Cabinet  

之後可再自行寫 Map/Reduce 或另一支腳本，把 CSV 轉成 NetSuite Currency Exchange Rate。

## 注意事項

- 台銀網站有 bot 防護；本專案用 `curl_cffi`（模擬瀏覽器 TLS）在 GitHub Actions / 本機下載。請勿把台銀原始 URL 直接塞給 NetSuite。
- jsDelivr 對 GitHub 檔案可能有快取；工作流已在更新後 purge。若仍看到舊檔，可暫時改用 GitHub Raw 備援 URL，或在 URL 加上 `?t=<timestamp>`（部分客戶端有效）。
- 匯率為公開資訊，但仍請依貴公司合規要求標示資料來源為台灣銀行。
- Repository 需為 **public**，jsDelivr 才能免設定提供 CDN。

## 授權與免責

本專案僅提供技術串接範例。匯率數值以台灣銀行官方為準；CDN 上的檔案為排程鏡像，可能有數分鐘到數小時延遲。商業使用請自行確認合規與正確性。
