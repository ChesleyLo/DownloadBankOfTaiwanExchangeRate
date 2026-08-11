/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 *
 * Downloads Bank of Taiwan FX rates JSON from jsDelivr CDN and uses it directly
 * (no CSV parsing required).
 *
 * CDN URL:
 *   https://cdn.jsdelivr.net/gh/ChesleyLo/DownloadBankOfTaiwanExchangeRate@main/data/bot-xrt-latest.json
 *
 * JSON shape (excerpt):
 *   {
 *     base: "TWD",
 *     byCurrency: {
 *       USD: { cash: {buy, sell}, spot: {buy, sell}, forward: {buy:{10..180}, sell:{...}} }
 *     },
 *     rates: [ ...same objects in array... ]
 *   }
 *
 * Example usage after parse:
 *   const usdSpotSell = payload.byCurrency.USD.spot.sell;
 */
define(["N/https", "N/file", "N/log", "N/runtime"], (
  https,
  file,
  log,
  runtime
) => {
  const CDN_JSON_URL =
    "https://cdn.jsdelivr.net/gh/ChesleyLo/DownloadBankOfTaiwanExchangeRate@main/data/bot-xrt-latest.json";

  // File Cabinet folder internal ID
  const FOLDER_ID = -15;
  const FILE_NAME = "bot-xrt-latest.json";

  // Prefer spot.sell for NetSuite exchange rate import; override via script param if needed
  const DEFAULT_RATE_FIELD = "spot.sell"; // cash.buy | cash.sell | spot.buy | spot.sell

  function getConfiguredUrl() {
    const script = runtime.getCurrentScript();
    return script.getParameter({ name: "custscript_bot_cdn_json_url" }) || CDN_JSON_URL;
  }

  function getRateFieldPath() {
    const script = runtime.getCurrentScript();
    return (
      script.getParameter({ name: "custscript_bot_rate_field" }) || DEFAULT_RATE_FIELD
    );
  }

  function parsePayload(body) {
    if (!body || typeof body !== "string") {
      throw new Error("Empty response from CDN");
    }
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      throw new Error("CDN response is not valid JSON: " + e.message);
    }
    if (!payload.byCurrency || !payload.rates || !payload.rates.length) {
      throw new Error("JSON missing byCurrency/rates");
    }
    return payload;
  }

  function readRate(currencyEntry, fieldPath) {
    // fieldPath examples: "spot.sell", "cash.buy"
    const parts = String(fieldPath).split(".");
    let cur = currencyEntry;
    for (let i = 0; i < parts.length; i++) {
      if (cur == null) return null;
      cur = cur[parts[i]];
    }
    return typeof cur === "number" ? cur : null;
  }

  function saveJson(contents) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const datedName = `bot-xrt-${y}-${m}-${d}.json`;

    const latestId = file
      .create({
        name: FILE_NAME,
        fileType: file.Type.JSON,
        contents: contents,
        folder: FOLDER_ID,
        isOnline: false,
      })
      .save();

    const datedId = file
      .create({
        name: datedName,
        fileType: file.Type.JSON,
        contents: contents,
        folder: FOLDER_ID,
        isOnline: false,
      })
      .save();

    return { latestId, datedId, datedName };
  }

  /**
   * Optional: create/update currency exchange rate records.
   * Disabled by default — set script param custscript_bot_apply_rates = T to enable.
   * Adjust field mapping to match your account's Currency Rate record usage.
   */
  function maybeApplyRates(payload) {
    const script = runtime.getCurrentScript();
    const apply = script.getParameter({ name: "custscript_bot_apply_rates" });
    if (apply !== true && apply !== "T") {
      return { applied: false, count: 0 };
    }

    const fieldPath = getRateFieldPath();
    let count = 0;
    const currencies = Object.keys(payload.byCurrency);

    currencies.forEach((code) => {
      const rate = readRate(payload.byCurrency[code], fieldPath);
      if (rate == null) {
        return;
      }
      // Example only: log the rate NetSuite would use.
      // Replace with record.create({ type: record.Type.CURRENCY_RATE ... }) as needed.
      log.debug({
        title: "BOT rate ready",
        details: `${code}/${payload.base} ${fieldPath}=${rate}`,
      });
      count += 1;
    });

    return { applied: true, count, fieldPath };
  }

  function execute(context) {
    const url = getConfiguredUrl();
    log.audit({ title: "BOT CDN JSON download start", details: url });

    const response = https.get({
      url: url,
      headers: {
        Accept: "application/json,text/plain,*/*",
      },
    });

    if (response.code < 200 || response.code >= 300) {
      throw new Error(`CDN HTTP ${response.code}: ${String(response.body).slice(0, 200)}`);
    }

    const body = response.body;
    const payload = parsePayload(body);
    const saved = saveJson(body);
    const applied = maybeApplyRates(payload);

    // Direct use example (no CSV parse):
    const usd = payload.byCurrency.USD;
    log.audit({
      title: "BOT CDN JSON download success",
      details:
        `rates=${payload.rateCount}, usdSpotSell=${usd && usd.spot ? usd.spot.sell : null}, ` +
        `latestFileId=${saved.latestId}, dated=${saved.datedName}, applied=${applied.applied}`,
    });
  }

  return { execute };
});
