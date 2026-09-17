/* =========================================================
   Indian Traffic Premier League (ITPL) — city.js
   Powers the lightweight static city pages under /city/<slug>/.
   Intentionally separate from app.js (the main SPA) so this page
   never depends on DOM elements (nav tabs, search, grid) that don't
   exist here.

   IMPORTANT: if you change DATA_SOURCE.API_URL in js/app.js, update
   the same value below — the two are kept separate on purpose so a
   mistake on the city pages can never break the main app.
   ========================================================= */

const CITY_DATA_SOURCE = {
  API_URL: "https://script.google.com/macros/s/AKfycbyBE59FeMJE7JQyHMhD0113_G-r24XbkULodLX7DCaiup9yYP4CfKhaTpr_KdBj2MUe/exec",
  FALLBACK_URL: "../../data/sample-cities.json"
};

const CITY_LEVEL_COLORS = { free: "#3fc06a", moderate: "#f5a54e", heavy: "#f2555b", severe: "#c81e27" };

function cityLevelFor(index) {
  if (index < 2.5) return { key: "free", label: "Free flow" };
  if (index < 4)   return { key: "moderate", label: "Moderate" };
  if (index < 6)   return { key: "heavy", label: "Heavy" };
  return { key: "severe", label: "Severe" };
}

async function loadCityData() {
  const box = document.getElementById("liveIndexBox");
  const slug = window.CITY_SLUG;
  const url = CITY_DATA_SOURCE.API_URL || CITY_DATA_SOURCE.FALLBACK_URL;

  let raw = null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("bad response");
    raw = await res.json();
  } catch (err) {
    console.warn("Live source unavailable, falling back to sample data.", err);
    try {
      const res2 = await fetch(CITY_DATA_SOURCE.FALLBACK_URL);
      raw = await res2.json();
    } catch (err2) {
      box.innerHTML = `<div class="chart-loading">Couldn't load live data right now — try the full dashboard instead.</div>`;
      return;
    }
  }

  const city = raw.cities.find(c => c.id === slug);
  if (!city || city.index == null) {
    box.innerHTML = `<div class="chart-loading">This city isn't reporting live data right now — check back soon, or explore the full dashboard.</div>`;
    return;
  }

  const lvl = cityLevelFor(city.index);
  const color = CITY_LEVEL_COLORS[lvl.key];
  const d = new Date(raw.generated_at);
  const timeStr = isNaN(d) ? "" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  box.innerHTML = `
    <div class="card-index-row">
      <span class="card-index-value">${city.index.toFixed(2)}</span>
      <span class="card-index-unit">min/km</span>
    </div>
    <span class="level-tag" style="display:inline-block;background:${color}22;color:${color};">${lvl.label}</span>
    <div class="ranking-sub" style="margin-top:10px;">${timeStr ? "Last updated " + timeStr : "Recently updated"} · refreshes hourly</div>
  `;
}

document.addEventListener("DOMContentLoaded", loadCityData);
