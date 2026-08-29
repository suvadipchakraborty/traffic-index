/* =========================================================
   The Great Indian Traffic Index — app.js
   Swap DATA_SOURCE.API_URL for your deployed Apps Script
   /exec URL once the backend (see /backend/Code.gs) is live.
   Until then the app runs on the bundled sample dataset.
   ========================================================= */

const DATA_SOURCE = {
  // Paste your Apps Script Web App URL here, e.g.
  // "https://script.google.com/macros/s/AKfycb.../exec"
  API_URL: "https://script.google.com/macros/s/AKfycbyBE59FeMJE7JQyHMhD0113_G-r24XbkULodLX7DCaiup9yYP4CfKhaTpr_KdBj2MUe/exec",
  FALLBACK_URL: "data/sample-cities.json",
  REFRESH_MS: 60 * 60 * 1000 // 1 hour
};

const state = {
  raw: null,
  tier: "all",
  query: "",
  sort: "index-desc"
};

/* ---------- Congestion bands ---------- */

const LEVEL_COLORS = {
  free: "#3fc06a",
  moderate: "#f5a54e",
  heavy: "#f2555b",
  severe: "#c81e27"
};

function levelFor(index) {
  if (index < 2.5) return { key: "free", label: "Free flow" };
  if (index < 4)   return { key: "moderate", label: "Moderate" };
  if (index < 6)   return { key: "heavy", label: "Heavy" };
  return { key: "severe", label: "Severe" };
}

/* ---------- Data loading ---------- */

async function loadData() {
  const url = DATA_SOURCE.API_URL || DATA_SOURCE.FALLBACK_URL;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Bad response");
    state.raw = await res.json();
  } catch (err) {
    console.warn("Live source unavailable, falling back to sample data.", err);
    if (url !== DATA_SOURCE.FALLBACK_URL) {
      const res2 = await fetch(DATA_SOURCE.FALLBACK_URL);
      state.raw = await res2.json();
    }
  }
  renderAll();
}

function renderAll() {
  if (!state.raw) return;
  try { renderTicker(); } catch (err) { console.error("renderTicker failed:", err); }
  try { renderRankingChart(); } catch (err) { console.error("renderRankingChart failed:", err); }
  try { renderGrid(); } catch (err) { console.error("renderGrid failed:", err); }
}

/* ---------- Ticker ---------- */

function renderTicker() {
  const { generated_at, national_average_index } = state.raw;
  const d = new Date(generated_at);
  const timeStr = isNaN(d) ? "—" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  document.getElementById("lastUpdated").textContent = timeStr;
  document.getElementById("nationalIndex").textContent =
    (national_average_index != null ? national_average_index.toFixed(2) : "—") + " min/km";
}

/* ---------- Ranking chart (all cities, most to least congested) ---------- */

function renderRankingChart() {
  const container = document.getElementById("rankingChart");
  const note = document.getElementById("rankingNote");
  const cities = state.raw.cities.filter(c => c.index != null).slice().sort((a, b) => b.index - a.index);

  if (!cities.length) {
    container.innerHTML = `<div class="chart-loading">No data yet.</div>`;
    return;
  }

  const d = new Date(state.raw.generated_at);
  note.textContent = isNaN(d) ? "" : "as of " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const W = 320;
  const rowH = 26;
  const padTop = 6;
  const labelW = 92;
  const valueW = 34;
  const barAreaW = W - labelW - valueW;
  const maxVal = Math.max(...cities.map(c => c.index)) * 1.05;
  const H = padTop * 2 + cities.length * rowH;

  const rows = cities.map((c, i) => {
    const y = padTop + i * rowH;
    const barW = Math.max(3, (c.index / maxVal) * barAreaW);
    const color = LEVEL_COLORS[levelFor(c.index).key];
    const label = c.name.length > 13 ? c.name.slice(0, 12) + "…" : c.name;
    return `
      <text class="rank-label" x="0" y="${y + rowH / 2 + 3}">${i + 1}. ${label}</text>
      <rect class="rank-track" x="${labelW}" y="${y + 5}" width="${barAreaW}" height="${rowH - 10}" rx="4"></rect>
      <rect x="${labelW}" y="${y + 5}" width="${barW}" height="${rowH - 10}" rx="4" fill="${color}">
        <title>${c.name}: ${c.index.toFixed(2)} min/km</title>
      </rect>
      <text class="rank-value" x="${labelW + barAreaW + valueW - 2}" y="${y + rowH / 2 + 3}" text-anchor="end">${c.index.toFixed(2)}</text>
    `;
  }).join("");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="City congestion ranking">
      ${rows}
    </svg>
  `;
}

/* ---------- Grid ---------- */

function getFilteredSorted() {
  let cities = state.raw.cities.slice();

  if (state.tier !== "all") {
    cities = cities.filter(c => String(c.tier) === state.tier);
  }
  if (state.query.trim()) {
    const q = state.query.trim().toLowerCase();
    cities = cities.filter(c => c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q));
  }

  cities.sort((a, b) => {
    if (state.sort === "index-desc") return b.index - a.index;
    if (state.sort === "index-asc") return a.index - b.index;
    if (state.sort === "name-asc") return a.name.localeCompare(b.name);
    return 0;
  });

  return cities;
}

function trendArrow(trend) {
  if (trend === "up") return "▲";
  if (trend === "down") return "▼";
  return "•";
}

function renderGrid() {
  const grid = document.getElementById("cityGrid");
  const empty = document.getElementById("emptyState");
  const cities = getFilteredSorted();

  document.getElementById("cityCount").textContent = `${cities.length} ${cities.length === 1 ? "city" : "cities"}`;

  if (!cities.length) {
    grid.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  grid.innerHTML = cities.map(c => {
    const lvl = levelFor(c.index);
    return `
      <button class="milestone-card level-${lvl.key}" data-id="${c.id}">
        <div class="card-top">
          <div>
            <div class="card-city">${c.name}</div>
            <div class="card-state">${c.state}</div>
          </div>
          <span class="tier-badge">TIER ${c.tier}</span>
        </div>
        <div class="card-index-row">
          <span class="card-index-value">${c.index.toFixed(2)}</span>
          <span class="card-index-unit">min/km <span class="trend">${trendArrow(c.trend)}</span></span>
        </div>
        <div class="card-index-label">Traffic index</div>
        <span class="level-tag">${lvl.label}</span>
      </button>
    `;
  }).join("");

  grid.querySelectorAll(".milestone-card").forEach(btn => {
    btn.addEventListener("click", () => openSheet(btn.dataset.id));
  });
}

/* ---------- City detail sheet ---------- */

const compassPositions = {
  N:  { top: "4%",  left: "50%" },
  NE: { top: "18%", left: "82%" },
  E:  { top: "50%", left: "96%" },
  SE: { top: "82%", left: "82%" },
  S:  { top: "96%", left: "50%" },
  SW: { top: "82%", left: "18%" },
  W:  { top: "50%", left: "4%"  },
  NW: { top: "18%", left: "18%" }
};

async function openSheet(cityId) {
  const city = state.raw.cities.find(c => c.id === cityId);
  if (!city) return;
  const lvl = levelFor(city.index);

  document.getElementById("sheetState").textContent = city.state + ` · Tier ${city.tier}`;
  document.getElementById("sheetTitle").textContent = city.name;
  document.getElementById("sheetIndexVal").textContent = city.index.toFixed(2);
  document.getElementById("sheetLevel").textContent = lvl.label;

  const tag = document.getElementById("sheetLevelTag");
  tag.textContent = lvl.label;
  tag.className = "level-tag";
  tag.style.background = {
    free: "rgba(63,192,106,0.18)", moderate: "rgba(245,165,78,0.18)",
    heavy: "rgba(242,85,91,0.18)", severe: "rgba(200,30,39,0.28)"
  }[lvl.key];
  tag.style.color = {
    free: "#3fc06a", moderate: "#f5a54e", heavy: "#f2555b", severe: "#ffb0b3"
  }[lvl.key];

  const compass = document.getElementById("compass");
  compass.querySelectorAll(".pt").forEach(el => el.remove());
  Object.entries(city.borders).forEach(([dir, name]) => {
    const pos = compassPositions[dir];
    const el = document.createElement("div");
    el.className = "pt";
    el.style.top = pos.top;
    el.style.left = pos.left;
    el.textContent = dir;
    el.title = name;
    compass.appendChild(el);
  });

  document.getElementById("legList").innerHTML = city.legs.map(leg => {
    const speedKmh = (leg.distance_km / (leg.duration_min / 60)).toFixed(0);
    return `
      <div class="leg-row">
        <div>
          <div class="leg-pair">${leg.pair}</div>
          <div class="leg-route">${leg.from} → ${leg.to}</div>
        </div>
        <div class="leg-nums">
          ${leg.distance_km.toFixed(1)} km · ${leg.duration_min} min
          <div class="kmh">≈ ${speedKmh} km/h avg</div>
        </div>
      </div>
    `;
  }).join("");

  document.getElementById("sheetBackdrop").classList.add("open");

  loadTrend(city, "24h", "chart24h", "trend24Note");
  loadTrend(city, "7d", "chart7d", "trend7dNote");
}

function closeSheet() {
  document.getElementById("sheetBackdrop").classList.remove("open");
}

/* ---------- Trend charts (24h / 7d) ---------- */

async function loadTrend(city, range, containerId, noteId) {
  const container = document.getElementById(containerId);
  const note = document.getElementById(noteId);
  container.innerHTML = `<div class="chart-loading">Loading trend…</div>`;

  let points = null;
  let isLive = false;

  if (DATA_SOURCE.API_URL) {
    try {
      const url = `${DATA_SOURCE.API_URL}?history=${encodeURIComponent(city.id)}&range=${range}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json && json.points && json.points.length) {
          points = json.points;
          isLive = true;
        }
      }
    } catch (err) {
      console.warn("History fetch failed, using demo trend.", err);
    }
  }

  if (!points) {
    points = range === "24h" ? syntheticHistory24h(city) : syntheticHistory7d(city);
  }

  note.textContent = isLive ? "Live from sheet" : "Demo pattern — connect backend for real history";

  const labelFmt = range === "24h"
    ? p => new Date(p.t).toLocaleTimeString("en-IN", { hour: "2-digit", hour12: true }).replace(":00", "")
    : p => new Date(p.t).toLocaleDateString("en-IN", { weekday: "short" });

  container.innerHTML = renderLineChart(points, labelFmt);
}

/**
 * Deterministic pseudo-random noise, seeded per city so demo trends
 * stay stable across reloads instead of jumping around randomly.
 */
function seededNoise(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = (h << 5) - h + seedStr.charCodeAt(i);
    h |= 0;
  }
  return () => {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    return (h % 1000) / 1000; // 0..1
  };
}

// Typical Indian urban traffic curve by hour of day (multiplier on average).
const HOUR_MULTIPLIER = [0.55,0.5,0.45,0.42,0.45,0.55,0.75,1.05,1.35,1.45,1.25,1.1,
                          1.05,1.1,1.05,1.1,1.2,1.4,1.5,1.45,1.2,0.95,0.75,0.6];
const WEEKDAY_MULTIPLIER = { 0: 0.82, 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0, 5: 1.02, 6: 0.9 }; // 0=Sun

function syntheticHistory24h(city) {
  const rand = seededNoise(city.id + "-24h");
  const now = new Date();
  const currentHour = now.getHours();
  const base = city.index / (HOUR_MULTIPLIER[currentHour] || 1);
  const points = [];
  for (let i = 23; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 3600000);
    const mult = HOUR_MULTIPLIER[t.getHours()];
    const noise = 0.92 + rand() * 0.16; // ±8%
    points.push({ t: t.toISOString(), index: round2(base * mult * noise) });
  }
  return points;
}

function syntheticHistory7d(city) {
  const rand = seededNoise(city.id + "-7d");
  const now = new Date();
  const base = city.index / (HOUR_MULTIPLIER[23] || 1); // anchor to a late-hour reading
  const points = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    d.setHours(23, 0, 0, 0);
    const mult = WEEKDAY_MULTIPLIER[d.getDay()];
    const noise = 0.9 + rand() * 0.2;
    points.push({ t: d.toISOString(), index: round2(base * mult * noise * HOUR_MULTIPLIER[23]) });
  }
  return points;
}

function round2(n) { return Math.round(n * 100) / 100; }

function renderLineChart(points, labelFmt) {
  const W = 300, H = 120, padL = 26, padR = 8, padT = 12, padB = 18;
  const values = points.map(p => p.index);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = (max - min) || 1;
  const yFor = v => padT + (1 - (v - min) / range) * (H - padT - padB);
  const xFor = i => padL + (i / (points.length - 1)) * (W - padL - padR);

  const linePts = points.map((p, i) => `${xFor(i)},${yFor(p.index)}`).join(" ");
  const areaPts = `${padL},${H - padB} ${linePts} ${xFor(points.length - 1)},${H - padB}`;

  const dots = points.map((p, i) => {
    const x = xFor(i), y = yFor(p.index);
    return `<circle class="chart-dot" cx="${x}" cy="${y}" r="2.6"><title>${labelFmt(p)}: ${p.index.toFixed(2)} min/km</title></circle>`;
  }).join("");

  const gridLines = [0.25, 0.5, 0.75].map(f => {
    const y = padT + f * (H - padT - padB);
    return `<line class="chart-grid-line" x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" />`;
  }).join("");

  // x-axis labels: first, middle, last point only (keeps it readable on mobile)
  const labelIdxs = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const xLabels = labelIdxs.map(i => {
    const x = xFor(i);
    const anchor = i === 0 ? "start" : (i === points.length - 1 ? "end" : "middle");
    return `<text class="chart-axis-label" x="${x}" y="${H - 4}" text-anchor="${anchor}">${labelFmt(points[i])}</text>`;
  }).join("");

  return `
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Traffic index trend">
      ${gridLines}
      <text class="chart-value-label" x="${padL - 3}" y="${yFor(max) + 3}" text-anchor="end">${max.toFixed(1)}</text>
      <text class="chart-value-label" x="${padL - 3}" y="${yFor(min) + 3}" text-anchor="end">${min.toFixed(1)}</text>
      <polygon class="chart-area" points="${areaPts}" />
      <polyline class="chart-line" points="${linePts}" />
      ${dots}
      ${xLabels}
    </svg>
  `;
}

/* ---------- Controls wiring ---------- */

function wireControls() {
  document.getElementById("citySearch").addEventListener("input", e => {
    state.query = e.target.value;
    renderGrid();
  });

  document.querySelectorAll(".tier-toggle button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tier-toggle button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.tier = btn.dataset.tier;
      renderGrid();
    });
  });

  document.getElementById("sortSelect").addEventListener("change", e => {
    state.sort = e.target.value;
    renderGrid();
  });

  document.getElementById("sheetClose").addEventListener("click", closeSheet);
  document.getElementById("sheetBackdrop").addEventListener("click", e => {
    if (e.target.id === "sheetBackdrop") closeSheet();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeSheet();
  });
}

/* ---------- Tab navigation ---------- */

function wireNav() {
  document.querySelectorAll(".bottom-nav button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".bottom-nav button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

/* ---------- Feedback (mailto) ---------- */

function wireFeedback() {
  document.getElementById("sendFeedback").addEventListener("click", () => {
    const subject = document.getElementById("fbSubject").value || "Feedback: The Great Indian Traffic Index";
    const body = document.getElementById("fbMessage").value || "";
    const mailto = `mailto:suvadipchakraborty@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  });
}

/* ---------- Auto refresh ---------- */

function scheduleRefresh() {
  setInterval(loadData, DATA_SOURCE.REFRESH_MS);
}

/* ---------- Init ---------- */

document.addEventListener("DOMContentLoaded", () => {
  try { wireControls(); } catch (err) { console.error("wireControls failed:", err); }
  try { wireNav(); } catch (err) { console.error("wireNav failed:", err); }
  try { wireFeedback(); } catch (err) { console.error("wireFeedback failed:", err); }
  loadData();
  scheduleRefresh();
});
