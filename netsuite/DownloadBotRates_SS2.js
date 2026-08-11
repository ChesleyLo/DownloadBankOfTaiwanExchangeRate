/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 *
 * Downloads Bank of Taiwan FX rates CSV from a free CDN (jsDelivr / GitHub)
 * and stores the file in the File Cabinet.
 *
 * Setup:
 * 1. Push this repo to GitHub (public) so jsDelivr can serve data/bot-xrt-latest.csv
 * 2. Replace CDN_CSV_URL below with your repository path
 * 3. Deploy as a Scheduled Script (e.g. daily after Taiwan market close)
 * 4. Ensure the File Cabinet folder exists (or change FOLDER_ID)
 *
 * Example CDN URL after publishing:
 *   https://cdn.jsdelivr.net/gh/<OWNER>/<REPO>@main/data/bot-xrt-latest.csv
 *
 * Backup (no CDN cache, GitHub rate-limited):
 *   https://raw.githubusercontent.com/<OWNER>/<REPO>/main/data/bot-xrt-latest.csv
 */
define(["N/https", "N/file", "N/log", "N/runtime"], (https, file, log, runtime) => {
  // TODO: replace OWNER/REPO after you push this project to GitHub
  const CDN_CSV_URL =
    "https://cdn.jsdelivr.net/gh/OWNER/REPO@main/data/bot-xrt-latest.csv";

  // File Cabinet folder internal ID (create a folder first, e.g. "BOT FX Rates")
  const FOLDER_ID = -15; // Documents > Files root; change to your folder id
  const FILE_NAME = "bot-xrt-latest.csv";

  function getConfiguredUrl() {
    const script = runtime.getCurrentScript();
    const paramUrl = script.getParameter({ name: "custscript_bot_cdn_csv_url" });
    return paramUrl || CDN_CSV_URL;
  }

  function assertCsv(body) {
    if (!body || typeof body !== "string") {
      throw new Error("Empty response from CDN");
    }
    const sample = body.replace(/^\uFEFF/, "").slice(0, 80);
    if (sample.indexOf("幣別") === -1 && sample.toLowerCase().indexOf("usd") === -1) {
      throw new Error("CDN response does not look like BOT FX CSV: " + sample);
    }
  }

  function saveCsv(contents) {
    // Overwrite same logical name by deleting prior file if present is optional;
    // NetSuite allows duplicate names, so we keep a dated copy as well.
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const datedName = `bot-xrt-${y}-${m}-${d}.csv`;

    const latest = file.create({
      name: FILE_NAME,
      fileType: file.Type.CSV,
      contents: contents,
      folder: FOLDER_ID,
      isOnline: false,
    });
    const latestId = latest.save();

    const dated = file.create({
      name: datedName,
      fileType: file.Type.CSV,
      contents: contents,
      folder: FOLDER_ID,
      isOnline: false,
    });
    const datedId = dated.save();

    return { latestId, datedId, datedName };
  }

  function execute(context) {
    const url = getConfiguredUrl();
    log.audit({ title: "BOT CDN download start", details: url });

    const response = https.get({
      url: url,
      headers: {
        Accept: "text/csv,text/plain,*/*",
      },
    });

    if (response.code < 200 || response.code >= 300) {
      throw new Error(`CDN HTTP ${response.code}: ${String(response.body).slice(0, 200)}`);
    }

    const body = response.body;
    assertCsv(body);
    const saved = saveCsv(body);

    log.audit({
      title: "BOT CDN download success",
      details: `latestFileId=${saved.latestId}, dated=${saved.datedName} (${saved.datedId}), bytes=${body.length}`,
    });
  }

  return { execute };
});
