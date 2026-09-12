const REPO = "ChesleyLo/DownloadBankOfTaiwanExchangeRate";
const WORKFLOW = "update-rates.yml";
const TZ = "Asia/Taipei";
const CDN_DATA = `https://cdn.jsdelivr.net/gh/${REPO}@main/data`;
const RAW_DATA = `https://raw.githubusercontent.com/${REPO}/main/data`;
const ACTIONS_BASE = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs`;
const ACTIONS_PAGE = `https://github.com/${REPO}/actions`;
const MAX_RUN_PAGES = 5;

const els = {
  from: document.getElementById("from-date"),
  to: document.getElementById("to-date"),
  view: document.getElementById("view-filter"),
  apply: document.getElementById("apply-filter"),
  reset: document.getElementById("reset-filter"),
  banner: document.getElementById("load-banner"),
  runCount: document.getElementById("stat-runs"),
  okCount: document.getElementById("stat-ok"),
  failCount: document.getElementById("stat-fail"),
  snapCount: document.getElementById("stat-snaps"),
  runLabel: document.getElementById("stat-runs-label"),
  okLabel: document.getElementById("stat-ok-label"),
  failLabel: document.getElementById("stat-fail-label"),
  runHeading: document.getElementById("run-heading"),
  runLede: document.getElementById("run-lede"),
  runHead: document.getElementById("run-head"),
  runBody: document.getElementById("run-body"),
  snapList: document.getElementById("snap-list"),
  rateMeta: document.getElementById("rate-meta"),
  rateBody: document.getElementById("rate-body"),
  emptyRuns: document.getElementById("empty-runs"),
  emptyRates: document.getElementById("empty-rates"),
};

const state = {
  runs: [],
  snaps: [],
  selectedDate: "",
  loading: false,
};

function taipeiDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function taipeiDateTime(value) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function todayTaipei() {
  return taipeiDate(new Date());
}

function shiftDays(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

function setBanner(message, tone = "info") {
  els.banner.hidden = !message;
  els.banner.textContent = message || "";
  els.banner.dataset.tone = tone;
}

function setBusy(isBusy) {
  state.loading = isBusy;
  els.apply.disabled = isBusy;
  els.reset.disabled = isBusy;
  els.apply.dataset.state = isBusy ? "loading" : "";
  els.apply.textContent = isBusy ? "載入中…" : "套用";
}

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const today = todayTaipei();
  const view = params.get("view") || params.get("status") || "daily";
  return {
    from: params.get("from") || shiftDays(today, -29),
    to: params.get("to") || today,
    view: ["daily", "missing", "runs"].includes(view) ? view : "daily",
    date: params.get("date") || "",
  };
}

function writeParams(next) {
  const params = new URLSearchParams();
  params.set("from", next.from);
  params.set("to", next.to);
  if (next.view && next.view !== "daily") params.set("view", next.view);
  if (next.date) params.set("date", next.date);
  const query = params.toString();
  history.replaceState(null, "", query ? `?${query}` : location.pathname);
}

function applyPreset(range) {
  const today = todayTaipei();
  if (range === "today") {
    els.from.value = today;
    els.to.value = today;
  } else if (range === "7") {
    els.from.value = shiftDays(today, -6);
    els.to.value = today;
  } else if (range === "30") {
    els.from.value = shiftDays(today, -29);
    els.to.value = today;
  } else if (range === "all") {
    const oldest = state.snaps.at(-1)?.date || shiftDays(today, -89);
    els.from.value = oldest;
    els.to.value = today;
  }
}

function eventLabel(eventName) {
  if (eventName === "workflow_dispatch") return "外部 cron／手動";
  if (eventName === "schedule") return "GitHub 備援";
  if (eventName === "repository_dispatch") return "repository_dispatch";
  return eventName || "—";
}

function runStatus(run) {
  if (run.status !== "completed") return { key: "running", label: "執行中" };
  if (run.conclusion === "success") return { key: "success", label: "成功" };
  if (run.conclusion === "failure") return { key: "failure", label: "失敗" };
  if (run.conclusion === "cancelled") return { key: "cancelled", label: "已取消" };
  return { key: "other", label: run.conclusion || run.status };
}

function inRange(isoDate, from, to) {
  return isoDate >= from && isoDate <= to;
}

function eachDate(from, to) {
  const days = [];
  for (let cursor = from; cursor <= to; cursor = shiftDays(cursor, 1)) {
    days.push(cursor);
  }
  return days;
}

function weekdayOf(isoDate) {
  return new Date(`${isoDate}T12:00:00+08:00`).getDay();
}

function isWeekend(isoDate) {
  const day = weekdayOf(isoDate);
  return day === 0 || day === 6;
}

function weekdayLabel(isoDate) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TZ,
    weekday: "short",
  }).format(new Date(`${isoDate}T12:00:00+08:00`));
}

function runFinishedAt(run) {
  return run.updated_at || run.created_at;
}

function lastSuccessByDay(runs) {
  const latest = new Map();
  const counts = new Map();
  for (const run of runs) {
    const day = taipeiDate(run.created_at);
    const rec = counts.get(day) || { success: 0, failure: 0 };
    const status = runStatus(run).key;
    if (status === "success") rec.success += 1;
    if (status === "failure") rec.failure += 1;
    counts.set(day, rec);
    if (status !== "success") continue;
    const prev = latest.get(day);
    if (!prev || new Date(runFinishedAt(run)) > new Date(runFinishedAt(prev))) {
      latest.set(day, run);
    }
  }
  return { latest, counts };
}

function dailyRows() {
  const { from, to, view } = currentFilter();
  const { latest, counts } = lastSuccessByDay(state.runs);
  return eachDate(from, to)
    .map((date) => {
      const run = latest.get(date) || null;
      const count = counts.get(date) || { success: 0, failure: 0 };
      const weekend = isWeekend(date);
      return {
        date,
        weekday: weekdayLabel(date),
        weekend,
        run,
        successCount: count.success,
        failureCount: count.failure,
        missing: !weekend && !run,
      };
    })
    .filter((row) => (view === "missing" ? row.missing : true));
}

async function fetchFirstOk(urls) {
  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        lastError = new Error(`${url} → HTTP ${response.status}`);
        continue;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("無法載入資料");
}

async function loadSnapshots() {
  const payload = await fetchFirstOk([
    "../data/history/index.json",
    `${CDN_DATA}/history/index.json`,
    `${RAW_DATA}/history/index.json`,
  ]);
  state.snaps = Array.isArray(payload.dates) ? payload.dates.filter((item) => item.json) : [];
}

async function loadRuns(from, to) {
  const createdFrom = shiftDays(from, -1);
  const createdTo = shiftDays(to, 1);
  const collected = [];
  for (let page = 1; page <= MAX_RUN_PAGES; page += 1) {
    const url = `${ACTIONS_BASE}?per_page=100&page=${page}&created=${createdFrom}..${createdTo}`;
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) {
      throw new Error(`GitHub Actions API HTTP ${response.status}`);
    }
    const payload = await response.json();
    const batch = payload.workflow_runs || [];
    collected.push(...batch);
    if (batch.length < 100) break;
  }
  state.runs = collected;
}

function currentFilter() {
  return {
    from: els.from.value,
    to: els.to.value,
    view: els.view.value,
    date: state.selectedDate,
  };
}

function filteredRuns() {
  const { from, to } = currentFilter();
  return state.runs.filter((run) => inRange(taipeiDate(run.created_at), from, to));
}

function filteredSnaps() {
  const { from, to } = currentFilter();
  return state.snaps.filter((item) => inRange(item.date, from, to));
}

function renderStats(snaps) {
  const view = els.view.value;
  if (view === "runs") {
    const runs = filteredRuns();
    els.runLabel.textContent = "排程執行";
    els.okLabel.textContent = "成功";
    els.failLabel.textContent = "失敗";
    els.runCount.textContent = String(runs.length);
    els.okCount.textContent = String(runs.filter((run) => runStatus(run).key === "success").length);
    els.failCount.textContent = String(runs.filter((run) => runStatus(run).key === "failure").length);
  } else {
    const rows = dailyRows();
    const allDays = lastSuccessByDay(state.runs);
    const calendar = eachDate(els.from.value, els.to.value);
    const withSuccess = calendar.filter((date) => allDays.latest.has(date)).length;
    const missingWeekdays = calendar.filter((date) => !isWeekend(date) && !allDays.latest.has(date)).length;
    els.runLabel.textContent = view === "missing" ? "缺成功平日" : "列出天數";
    els.okLabel.textContent = "有最後成功";
    els.failLabel.textContent = "平日缺成功";
    els.runCount.textContent = String(rows.length);
    els.okCount.textContent = String(withSuccess);
    els.failCount.textContent = String(missingWeekdays);
  }
  els.snapCount.textContent = String(snaps.length);
}

function setRunTableChrome(view) {
  if (view === "runs") {
    els.runHeading.textContent = "全部執行明細";
    els.runLede.textContent = "同一天可能有多次成功與失敗。點列可對到該日匯率。";
    els.runHead.innerHTML = `
      <tr>
        <th>台灣時間</th>
        <th>結果</th>
        <th>觸發來源</th>
        <th>Run</th>
        <th>詳細</th>
      </tr>
    `;
    return;
  }
  els.runHeading.textContent = view === "missing" ? "缺成功的平日" : "每日最後成功";
  els.runLede.textContent =
    view === "missing"
      ? "這些平日沒有任何成功的下載。週末預設不跑，不會列在這裡。"
      : "每一列是該日最後一筆成功下載的完成時間（台灣）。點列可對到右側匯率。";
  els.runHead.innerHTML = `
    <tr>
      <th>日期</th>
      <th>星期</th>
      <th>最後成功（台灣）</th>
      <th>觸發來源</th>
      <th>當日成功</th>
      <th>詳細</th>
    </tr>
  `;
}

function renderDailyRows() {
  const rows = dailyRows();
  els.runBody.replaceChildren();
  els.emptyRuns.hidden = rows.length > 0;
  els.emptyRuns.textContent =
    els.view.value === "missing"
      ? "這個範圍的平日都有最後一筆成功紀錄。"
      : "這個日期範圍沒有可列出的日期。";
  for (const row of rows) {
    const tr = document.createElement("tr");
    if (row.missing) tr.classList.add("row-missing");
    if (row.weekend) tr.classList.add("row-weekend");
    const time = row.run
      ? `<time datetime="${runFinishedAt(row.run)}">${taipeiDateTime(runFinishedAt(row.run))}</time>`
      : row.weekend
        ? "—"
        : "無成功";
    const source = row.run ? eventLabel(row.run.event) : row.weekend ? "週末不排程" : "—";
    const link = row.run
      ? `<a class="row-link" href="${row.run.html_url}" target="_blank" rel="noreferrer">開啟 log</a>`
      : "—";
    const badge = row.run
      ? `<span class="pill pill-success">${row.successCount}</span>`
      : row.weekend
        ? "—"
        : `<span class="pill pill-failure">0</span>`;
    tr.innerHTML = `
      <td class="num">${row.date}</td>
      <td>${row.weekday}</td>
      <td>${time}</td>
      <td>${source}</td>
      <td>${badge}</td>
      <td>${link}</td>
    `;
    tr.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      selectDate(row.date);
    });
    els.runBody.appendChild(tr);
  }
}

function renderRuns(runs) {
  els.runBody.replaceChildren();
  els.emptyRuns.hidden = runs.length > 0;
  els.emptyRuns.textContent = "這個日期範圍沒有排程執行紀錄。";
  for (const run of runs) {
    const status = runStatus(run);
    const row = document.createElement("tr");
    const day = taipeiDate(run.created_at);
    row.innerHTML = `
      <td><time datetime="${run.created_at}">${taipeiDateTime(run.created_at)}</time></td>
      <td><span class="pill pill-${status.key}">${status.label}</span></td>
      <td>${eventLabel(run.event)}</td>
      <td class="num">#${run.run_number}</td>
      <td><a class="row-link" href="${run.html_url}" target="_blank" rel="noreferrer">開啟 log</a></td>
    `;
    row.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      selectDate(day);
    });
    els.runBody.appendChild(row);
  }
}

function renderSnapList(snaps) {
  els.snapList.replaceChildren();
  if (!snaps.length) {
    const empty = document.createElement("li");
    empty.className = "snap-empty";
    empty.textContent = "此日期範圍沒有匯率快照。匯率未變時可能不會新增歷史檔。";
    els.snapList.appendChild(empty);
    return;
  }
  for (const snap of snaps) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "snap-btn";
    button.dataset.date = snap.date;
    button.setAttribute("aria-pressed", snap.date === state.selectedDate ? "true" : "false");
    button.textContent = snap.date;
    button.addEventListener("click", () => selectDate(snap.date));
    item.appendChild(button);
    els.snapList.appendChild(item);
  }
}

function formatRate(value) {
  return typeof value === "number" ? value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") : "—";
}

function clearRates(message) {
  els.rateBody.replaceChildren();
  els.rateMeta.textContent = message;
  els.emptyRates.hidden = true;
}

async function loadRates(date) {
  els.rateBody.replaceChildren();
  const snap = state.snaps.find((item) => item.date === date);
  if (!date || !snap?.json) {
    clearRates(date ? "沒有可顯示的匯率快照。" : "此日期範圍沒有匯率快照。");
    els.emptyRates.hidden = false;
    return;
  }
  els.rateMeta.textContent = "載入匯率中…";
  els.emptyRates.hidden = true;
  try {
    const payload = await fetchFirstOk([
      `../data/history/${snap.json}`,
      `${CDN_DATA}/history/${snap.json}`,
      `${RAW_DATA}/history/${snap.json}`,
    ]);
    const fetched = payload.fetchedAtUtc
      ? `抓取時間 ${taipeiDateTime(payload.fetchedAtUtc)}（台灣）`
      : "";
    els.rateMeta.textContent = `${payload.base || "TWD"} · ${payload.rateCount ?? payload.rates?.length ?? 0} 種幣別${fetched ? ` · ${fetched}` : ""}`;
    const rows = payload.rates || [];
    if (!rows.length) {
      els.emptyRates.hidden = false;
      return;
    }
    for (const entry of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <th scope="row">${entry.currency}</th>
        <td class="num">${formatRate(entry.cash?.buy)}</td>
        <td class="num">${formatRate(entry.cash?.sell)}</td>
        <td class="num">${formatRate(entry.spot?.buy)}</td>
        <td class="num">${formatRate(entry.spot?.sell)}</td>
      `;
      els.rateBody.appendChild(tr);
    }
  } catch (error) {
    els.rateMeta.textContent = "匯率快照載入失敗。";
    els.emptyRates.hidden = false;
    els.emptyRates.textContent = error.message || "無法讀取 JSON";
  }
}

function renderAll() {
  const view = els.view.value;
  const snaps = filteredSnaps();
  setRunTableChrome(view);
  renderStats(snaps);
  if (view === "runs") renderRuns(filteredRuns());
  else renderDailyRows();
  renderSnapList(snaps);
}

async function selectDate(date) {
  state.selectedDate = date;
  writeParams(currentFilter());
  renderSnapList(filteredSnaps());
  await loadRates(date);
}

function summarizeBanner() {
  const { latest } = lastSuccessByDay(state.runs);
  const calendar = eachDate(els.from.value, els.to.value);
  const missing = calendar.filter((date) => !isWeekend(date) && !latest.has(date)).length;
  const newest = calendar.filter((date) => latest.has(date)).at(-1);
  const newestTime = newest ? taipeiDateTime(runFinishedAt(latest.get(newest))) : "";
  if (els.view.value === "runs") {
    const runs = filteredRuns();
    const failCount = runs.filter((run) => runStatus(run).key === "failure").length;
    setBanner(
      failCount
        ? `這個範圍有 ${runs.length} 筆排程執行，其中 ${failCount} 筆失敗。時間皆為台灣時區。`
        : `這個範圍有 ${runs.length} 筆排程執行。時間皆為台灣時區。`,
      failCount ? "warn" : "success"
    );
    return;
  }
  if (missing) {
    setBanner(`有 ${missing} 個平日沒有成功紀錄。時間皆為台灣時區。`, "warn");
    return;
  }
  setBanner(
    newestTime
      ? `這個範圍的平日都有最後成功。最近一筆是 ${newestTime}。`
      : "這個範圍沒有平日成功紀錄。",
    newestTime ? "success" : "info"
  );
}

async function applyFilter() {
  if (els.from.value > els.to.value) {
    setBanner("起始日期不能晚於結束日期。", "danger");
    els.from.setAttribute("aria-invalid", "true");
    return;
  }
  els.from.removeAttribute("aria-invalid");
  setBusy(true);
  try {
    await loadRuns(els.from.value, els.to.value);
    const snaps = filteredSnaps();
    if (!state.selectedDate || !snaps.some((item) => item.date === state.selectedDate)) {
      state.selectedDate = snaps[0]?.date || "";
    }
    writeParams(currentFilter());
    renderAll();
    summarizeBanner();
    await loadRates(state.selectedDate);
  } catch (error) {
    setBanner(error.message || "載入失敗。請稍後再試。", "danger");
  } finally {
    setBusy(false);
  }
}

async function boot() {
  const initial = readParams();
  els.from.value = initial.from;
  els.to.value = initial.to;
  els.view.value = initial.view;
  state.selectedDate = initial.date;
  setBusy(true);
  setBanner("載入 GitHub Actions 與歷史匯率…", "info");
  try {
    await Promise.all([loadSnapshots(), loadRuns(initial.from, initial.to)]);
    if (!state.selectedDate) {
      const snaps = filteredSnaps();
      state.selectedDate = snaps[0]?.date || "";
    }
    writeParams(currentFilter());
    renderAll();
    summarizeBanner();
    await loadRates(state.selectedDate);
  } catch (error) {
    setBanner(error.message || "載入失敗。請稍後再試。", "danger");
    renderAll();
  } finally {
    setBusy(false);
  }
}

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", async () => {
    applyPreset(button.dataset.preset);
    await applyFilter();
  });
});

els.apply.addEventListener("click", applyFilter);
els.reset.addEventListener("click", async () => {
  const today = todayTaipei();
  els.from.value = shiftDays(today, -29);
  els.to.value = today;
  els.view.value = "daily";
  state.selectedDate = "";
  await applyFilter();
});

els.from.addEventListener("keydown", (event) => {
  if (event.key === "Enter") applyFilter();
});
els.to.addEventListener("keydown", (event) => {
  if (event.key === "Enter") applyFilter();
});
els.view.addEventListener("change", applyFilter);

boot();
