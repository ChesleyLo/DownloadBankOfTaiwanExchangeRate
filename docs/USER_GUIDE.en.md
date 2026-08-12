# User Guide (English)

**Project:** Download Bank of Taiwan Exchange Rate  
**Audience:** Business / operations / NetSuite administrators (no coding required for basic setup)  
**Chinese version:** [USER_GUIDE.zh-TW.md](./USER_GUIDE.zh-TW.md)  
**Technical guide:** [TECHNICAL.en.md](./TECHNICAL.en.md)

---

## 1. What does this system do?

Bank of Taiwan (BOT) publishes daily foreign-exchange rates as a CSV file. The official site uses bot protection, so **NetSuite usually cannot download it directly**.

This project:

1. Downloads the BOT daily FX CSV automatically  
2. Converts it to JSON  
3. Publishes it on a free CDN (jsDelivr)  
4. Lets NetSuite fetch a stable HTTPS URL and use rate fields immediately

```text
BOT official CSV → GitHub auto-update → CDN → NetSuite downloads JSON
```

---

## 2. URLs you need

### Production (recommended)

```text
https://cdn.jsdelivr.net/gh/ChesleyLo/DownloadBankOfTaiwanExchangeRate@main/data/bot-xrt-latest.json
```

### Fallback (if CDN is stale or unavailable)

```text
https://raw.githubusercontent.com/ChesleyLo/DownloadBankOfTaiwanExchangeRate/main/data/bot-xrt-latest.json
```

### Raw CSV (optional)

```text
https://cdn.jsdelivr.net/gh/ChesleyLo/DownloadBankOfTaiwanExchangeRate@main/data/bot-xrt-latest.csv
```

Open the JSON URL in a browser. You should see something like:

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

## 3. How to read rate fields

| Field path | Meaning |
| --- | --- |
| `byCurrency.USD.cash.buy` | USD cash bid (bank buy) |
| `byCurrency.USD.cash.sell` | USD cash ask (bank sell) |
| `byCurrency.USD.spot.buy` | USD spot bid |
| `byCurrency.USD.spot.sell` | USD spot ask |
| `byCurrency.USD.forward.buy.30` | USD 30-day forward bid |
| `byCurrency.USD.forward.sell.30` | USD 30-day forward ask |

- Base currency: `base` = `TWD`  
- Currency codes: `USD`, `EUR`, `JPY`, `CNY`, …  
- Missing quotes are `null` (not `0`)  
- For NetSuite exchange-rate import, teams often use **spot ask**: `spot.sell`

The authoritative currency list is whatever appears in the day’s `rates` / `byCurrency`.

---

## 4. How often is data refreshed?

Three layers (details: [SCHEDULING.en.md](./SCHEDULING.en.md)):

| Layer | Times (Taiwan, weekdays) |
| --- | --- |
| **Primary** cron-job.org | hourly 09:10–16:10 + 18:30 |
| **Backup** GitHub cron | 10:30, 15:30, 18:30 |
| **Local** Mac (optional) | same; Mac must be on |

Notes:

- **No commit when rates are unchanged** (workflow may still run)  
- No weekend runs by default  
- If scheduling seems stuck, see [SCHEDULING.en.md §0.2](./SCHEDULING.en.md#02-schedule-not-running-step-by-step)  
- **How to confirm runs** see [SCHEDULING.en.md §0.5](./SCHEDULING.en.md#05-how-to-confirm-the-schedule-ran-day-to-day)  
- Manual trigger: `./scripts/trigger_update.sh` or Actions → Run workflow

---

## 5. NetSuite setup (administrator)

### 5.1 Prerequisites

- Permission to create Scripts / Deployments  
- Permission to write to the File Cabinet  
- Outbound HTTPS allowed to `cdn.jsdelivr.net`

### 5.2 Upload the script

1. Open `netsuite/DownloadBotRates_SS2.js`  
2. In NetSuite: **Customization → Scripting → Scripts → New**  
3. Upload the JS file as a **Scheduled** script  
4. Save

### 5.3 Optional script parameters

| Parameter ID | Type | Purpose |
| --- | --- | --- |
| `custscript_bot_cdn_json_url` | Free-Form Text | Override CDN URL |
| `custscript_bot_rate_field` | Free-Form Text | e.g. `spot.sell` |
| `custscript_bot_apply_rates` | Checkbox | Enable rate-write logic (off by default; logs only) |

If parameters are not created, the script uses the hardcoded default CDN URL.

### 5.4 Folder ID

`FOLDER_ID` defaults to `-15` (File Cabinet root).  
Change it to your target folder’s internal ID.

### 5.5 Deployment

1. Create a **Scheduled Script Deployment**  
2. Status: Released  
3. Schedule: once daily after Taiwan market close (e.g. 17:00 or 19:00 local)  
4. Run **Execute Now** once to validate

### 5.6 What success looks like

1. Downloads JSON from CDN  
2. Parses with `JSON.parse`  
3. Saves to File Cabinet:  
   - `bot-xrt-latest.json`  
   - `bot-xrt-YYYY-MM-DD.json`  
4. Writes an audit log entry (including a USD spot-sell summary)

> On GitHub, historical files live under `data/history/` and only the last 90 days are kept. NetSuite File Cabinet naming is independent.

> By default the script **does not** create NetSuite Currency Rate records. Enabling that requires a code change described in the technical guide.

---

## 6. Using rates in reports / processes

Typical pattern:

1. Scheduled Script stores the latest JSON in the File Cabinet daily  
2. Another script/workflow reads the file and takes `byCurrency.<CCY>.spot.sell`  
3. Writes to your rate table, custom record, or transaction conversion logic

Conceptual example:

```javascript
const payload = JSON.parse(cdnResponseBody);
const rate = payload.byCurrency.USD.spot.sell; // e.g. 32.345
```

---

## 7. FAQ

### Q1. CDN says the file was not found?

The GitHub repository is probably **private**. jsDelivr only serves **public** repos. Confirm:

https://github.com/ChesleyLo/DownloadBankOfTaiwanExchangeRate

### Q2. Rates look stale?

Possible causes:

1. Rates have not changed today (no commit)  
2. jsDelivr cache not refreshed  
3. **Schedule did not trigger** → [SCHEDULING.en.md §0.2](./SCHEDULING.en.md#02-schedule-not-running-step-by-step)

### Q3. Schedule not running? / How to confirm it ran?

**Day-to-day checks (fastest first):**

1. [GitHub Actions](https://github.com/ChesleyLo/DownloadBankOfTaiwanExchangeRate/actions) — look for successful `workflow_dispatch`  
2. [cron-job.org History](https://console.cron-job.org/jobs) — HTTP **204**  
3. [CDN JSON](https://cdn.jsdelivr.net/gh/ChesleyLo/DownloadBankOfTaiwanExchangeRate@main/data/bot-xrt-latest.json) — `fetchedAtUtc` (may stay old if rates unchanged)  
4. Run `./scripts/trigger_update.sh` if you suspect a failure  

Full guide and weekly checklist: [SCHEDULING.en.md §0.5](./SCHEDULING.en.md#05-how-to-confirm-the-schedule-ran-day-to-day)

### Q4. NetSuite download fails (non-200)?

Check:

1. CDN URL spelling  
2. Outbound access to `cdn.jsdelivr.net`  
3. Deployment is Released  
4. Execution Log details

### Q5. Can NetSuite call the BOT site directly?

**Not recommended.** BOT bot-protection often blocks `N/https`. Always use this project’s CDN JSON.

### Q6. Can we use this commercially?

Rates originate from Bank of Taiwan public data. The CDN copy is a scheduled mirror and may lag. Confirm compliance internally and cite the source.

---

## 8. Document index

| Document | Description |
| --- | --- |
| [USER_GUIDE.zh-TW.md](./USER_GUIDE.zh-TW.md) | User guide (Chinese) |
| [USER_GUIDE.en.md](./USER_GUIDE.en.md) | This user guide (English) |
| [TECHNICAL.zh-TW.md](./TECHNICAL.zh-TW.md) | Technical guide (Chinese) |
| [TECHNICAL.en.md](./TECHNICAL.en.md) | Technical guide (English) |
| [../README.md](../README.md) | Project overview |

To change schedules, JSON shape, or NetSuite write-back logic, see the technical guide.
