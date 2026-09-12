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
  status: document.getElementById("status-filter"),
  apply: document.getElementById("apply-filter"),
  reset: document.getElementById("reset-filter"),
  banner: document.getElementById("load-banner"),
  runCount: document.getElementById("stat-runs"),
  okCount: document.getElementById("stat-ok"),
  failCount: document.getElementById("stat-fail"),
  snapCount: document.getElementById("stat-snaps"),
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
  return {
    from: params.get("from") || shiftDays(today, -29),
    to: params.get("to") || today,
    status: params.get("status") || "all",
    date: params.get("date") || "",
  };
}

function writeParams(next) {
  const params = new URLSearchParams();
  params.set("from", next.from);
  params.set("to", next.to);
  if (next.status && next.status !== "all") params.set("status", next.status);
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
    status: els.status.value,
    date: state.selectedDate,
  };
}

function filteredRuns() {
  const { from, to, status } = currentFilter();
  return state.runs.filter((run) => {
    const day = taipeiDate(run.created_at);
    if (!inRange(day, from, to)) return false;
    const { key } = runStatus(run);
    if (status === "all") return true;
    if (status === "success") return key === "success";
    if (status === "failure") return key === "failure";
    if (status === "other") return key !== "success" && key !== "failure";
    return true;
  });
}

function filteredSnaps() {
  const { from, to } = currentFilter();
  return state.snaps.filter((item) => inRange(item.date, from, to));
}

function renderStats(runs, snaps) {
  els.runCount.textContent = String(runs.length);
  els.okCount.textContent = String(runs.filter((run) => runStatus(run).key === "success").length);
  els.failCount.textContent = String(runs.filter((run) => runStatus(run).key === "failure").length);
  els.snapCount.textContent = String(snaps.length);
}

function renderRuns(runs) {
  els.runBody.replaceChildren();
  els.emptyRuns.hidden = runs.length > 0;
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
  const runs = filteredRuns();
  const snaps = filteredSnaps();
  renderStats(runs, snaps);
  renderRuns(runs);
  renderSnapList(snaps);
}

async function selectDate(date) {
  state.selectedDate = date;
  writeParams(currentFilter());
  renderSnapList(filteredSnaps());
  await loadRates(date);
}

function summarizeBanner(runs) {
  const failCount = runs.filter((run) => runStatus(run).key === "failure").length;
  const text = failCount
    ? `這個範圍有 ${runs.length} 筆排程執行，其中 ${failCount} 筆失敗。時間皆為台灣時區。`
    : `這個範圍有 ${runs.length} 筆排程執行。時間皆為台灣時區。`;
  setBanner(text, failCount ? "warn" : "success");
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
    const runs = filteredRuns();
    renderAll();
    summarizeBanner(runs);
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
  els.status.value = initial.status;
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
    const runs = filteredRuns();
    renderAll();
    summarizeBanner(runs);
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
  els.status.value = "all";
  state.selectedDate = "";
  await applyFilter();
});

els.from.addEventListener("keydown", (event) => {
  if (event.key === "Enter") applyFilter();
});
els.to.addEventListener("keydown", (event) => {
  if (event.key === "Enter") applyFilter();
});
els.status.addEventListener("change", applyFilter);

boot();
