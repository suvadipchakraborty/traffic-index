/**
 * THE GREAT INDIAN TRAFFIC INDEX — Backend (Google Apps Script, free tier)
 * -------------------------------------------------------------------
 * WHAT THIS DOES
 * 1. Reads a list of cities + their 8 border points from the "Cities" sheet.
 * 2. For each city, requests live/traffic-aware driving time+distance for
 *    4 corridors: E-W, N-S, NE-SW, NW-SE (Maps.newDirectionFinder, free).
 * 3. Computes index (min/km) = total time / total distance.
 * 4. Writes a timestamped row to "History" and the latest snapshot to
 *    "Latest" (as JSON in one cell) so doGet() can serve it instantly.
 * 5. doGet() publishes that snapshot as JSON, in the exact shape the
 *    frontend (js/app.js) expects — point DATA_SOURCE.API_URL at this
 *    script's /exec URL once deployed.
 *
 * SETUP
 * 1. Extensions > Apps Script in a new Google Sheet, paste this file in
 *    as Code.gs.
 * 2. In the Sheet, create a tab named "Cities" with header row:
 *    City | State | Tier | N | S | E | W | NE | NW | SE | SW
 *    Put a place name/landmark string in each border-direction column
 *    (e.g. "Kundli Border, NH44, Delhi"). Add one row per city.
 * 3. Run setup() once from the Apps Script editor (authorise when asked).
 *    This creates the "Latest"/"History" tabs and the hourly trigger.
 * 4. Deploy > New deployment > Web app.
 *      Execute as: Me
 *      Who has access: Anyone
 *    Copy the /exec URL into DATA_SOURCE.API_URL in js/app.js.
 *
 * FREE-TIER NOTES
 * - Maps.newDirectionFinder() is part of Apps Script's built-in Maps
 *   service, tied to your Google account, no Cloud billing needed.
 *   It is rate-limited (undocumented, roughly low thousands of calls/day
 *   for consumer accounts). 15 cities x 4 corridors x 24 refreshes/day
 *   = 1,440 calls/day, comfortably inside typical limits — but if you
 *   add many more cities, either reduce refresh frequency or move to
 *   the paid Directions/Routes API (Google Cloud, has a monthly free
 *   credit) for guaranteed quota.
 * - If a single corridor lookup fails, the LAST KNOWN GOOD value is kept
 *   for that leg instead of zeroing the city out.
 */

const SHEET_CITIES        = "Cities";
const SHEET_LATEST        = "Latest";
const SHEET_HISTORY       = "History";        // per-corridor leg log (diagnostic)
const SHEET_INDEX_HISTORY = "IndexHistory";   // per-city index log (powers the trend charts)
const INDEX_HISTORY_RETENTION_DAYS = 8;       // keep just over a week, then prune

/**
 * If true, every corridor lookup also excludes limited-access highways/
 * expressways from the route (in addition to the mandatory city-centre
 * waypoint below). This makes it even harder for Google to sneak the
 * route onto a ring road, but can occasionally produce a slightly odd
 * route on local roads. Try it both ways and see which matches what you
 * actually experience driving through your cities.
 */
const AVOID_HIGHWAYS = true;

const CORRIDORS = [
  { pair: "E-W",   from: "E",  to: "W"  },
  { pair: "N-S",   from: "N",  to: "S"  },
  { pair: "NE-SW", from: "NE", to: "SW" },
  { pair: "NW-SE", from: "NW", to: "SE" }
];

/* ---------------- One-time setup ---------------- */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss.getSheetByName(SHEET_CITIES)) {
    const sh = ss.insertSheet(SHEET_CITIES);
    sh.appendRow(["City", "State", "Tier", "N", "S", "E", "W", "NE", "NW", "SE", "SW", "Center"]);
    sh.appendRow(["Delhi", "Delhi NCR", 1,
      "Kundli Border, NH44", "Badarpur Border, NH19",
      "Ghazipur Border, NH9", "Dwarka Expressway Toll, NH48",
      "Loni Border, NH9", "Bawana-Narela Border",
      "Kalindi Kunj Border", "Rajokri Border, NH48",
      "Connaught Place, New Delhi"]);
  }
  if (!ss.getSheetByName(SHEET_LATEST)) {
    const sh = ss.insertSheet(SHEET_LATEST);
    sh.appendRow(["json"]);
  }
  if (!ss.getSheetByName(SHEET_HISTORY)) {
    const sh = ss.insertSheet(SHEET_HISTORY);
    sh.appendRow(["Timestamp", "City", "Pair", "Distance_km", "Duration_min"]);
  }
  if (!ss.getSheetByName(SHEET_INDEX_HISTORY)) {
    const sh = ss.insertSheet(SHEET_INDEX_HISTORY);
    sh.appendRow(["Timestamp", "CityId", "CityName", "Index"]);
  }

  // Remove any existing triggers for runAllCities to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "runAllCities") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("runAllCities").timeBased().everyHours(1).create();

  runAllCities(); // run once immediately so Latest is populated right away
}

/* ---------------- Main hourly job ---------------- */

function runAllCities() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const citiesSheet = ss.getSheetByName(SHEET_CITIES);
  const rows = citiesSheet.getDataRange().getValues();
  const header = rows.shift();
  const idx = name => header.indexOf(name);

  const cache = CacheService.getScriptCache();
  const results = [];
  const historyRows = [];
  const indexHistoryRows = [];
  const now = new Date();

  rows.forEach(row => {
    if (!row[idx("City")]) return;
    const city = {
      id: slugify(row[idx("City")]),
      name: row[idx("City")],
      state: row[idx("State")],
      tier: Number(row[idx("Tier")]) || 1,
      borders: {
        N: row[idx("N")], S: row[idx("S")], E: row[idx("E")], W: row[idx("W")],
        NE: row[idx("NE")], NW: row[idx("NW")], SE: row[idx("SE")], SW: row[idx("SW")]
      },
      center: row[idx("Center")],
      legs: []
    };

    let totalDist = 0, totalTime = 0;

    CORRIDORS.forEach(c => {
      const origin = city.borders[c.from];
      const destination = city.borders[c.to];
      const cacheKey = "leg_" + city.id + "_" + c.pair;
      let leg = fetchCorridor(origin, destination, city.center, c.pair, city.name);

      if (!leg) {
        // Fall back to last known good value so one bad lookup
        // doesn't wipe out the whole city.
        const cached = cache.get(cacheKey);
        leg = cached ? JSON.parse(cached) : null;
      } else {
        cache.put(cacheKey, JSON.stringify(leg), 6 * 60 * 60); // 6h cache
      }

      if (leg) {
        city.legs.push({ pair: c.pair, from: origin, to: destination,
          distance_km: leg.distance_km, duration_min: leg.duration_min });
        totalDist += leg.distance_km;
        totalTime += leg.duration_min;
        historyRows.push([now, city.name, c.pair, leg.distance_km, leg.duration_min]);
      }

      Utilities.sleep(300); // be polite to the Maps service between calls
    });

    city.index = totalDist > 0 ? round2(totalTime / totalDist) : null;
    city.trend = computeTrend(cache, city.id, city.index);
    results.push(city);

    if (city.index != null) {
      indexHistoryRows.push([now, city.id, city.name, city.index]);
    }
  });

  if (historyRows.length) {
    ss.getSheetByName(SHEET_HISTORY).getRange(
      ss.getSheetByName(SHEET_HISTORY).getLastRow() + 1, 1, historyRows.length, 5
    ).setValues(historyRows);
  }

  if (indexHistoryRows.length) {
    const ihSheet = ss.getSheetByName(SHEET_INDEX_HISTORY);
    ihSheet.getRange(ihSheet.getLastRow() + 1, 1, indexHistoryRows.length, 4).setValues(indexHistoryRows);
  }

  pruneIndexHistory(); // keep the sheet from growing forever

  const validIndexes = results.filter(c => c.index != null).map(c => c.index);
  const nationalAvg = validIndexes.length
    ? round2(validIndexes.reduce((a, b) => a + b, 0) / validIndexes.length)
    : null;

  const payload = {
    generated_at: Utilities.formatDate(now, "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX"),
    next_refresh_at: Utilities.formatDate(new Date(now.getTime() + 3600000), "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX"),
    national_average_index: nationalAvg,
    cities: results
  };

  const latestSheet = ss.getSheetByName(SHEET_LATEST);
  latestSheet.getRange(2, 1).setValue(JSON.stringify(payload));
}

/* ---------------- Helpers ---------------- */

function fetchCorridor(origin, destination, centerWaypoint, pairLabel, cityName) {
  if (!origin || !destination) return null;
  try {
    let finder = Maps.newDirectionFinder()
      .setOrigin(origin)
      .setDestination(destination)
      .setMode(Maps.DirectionFinder.Mode.DRIVING)
      .setDepart(new Date()); // forces traffic-aware duration

    // Force the route through the city centre so Google can't quietly
    // reroute via an outer ring road / bypass to dodge core congestion.
    if (centerWaypoint) {
      finder = finder.addWaypoint(centerWaypoint);
    }
    if (AVOID_HIGHWAYS) {
      finder = finder.setAvoid(Maps.DirectionFinder.Avoid.HIGHWAYS);
    }

    const directions = finder.getDirections();
    if (!directions.routes || !directions.routes.length) return null;

    // IMPORTANT: once a waypoint is added, the route splits into multiple
    // legs (origin->center, center->destination) instead of one. Sum all
    // of them so distance/time cover the FULL corridor, not just half.
    const legs = directions.routes[0].legs;
    let distanceMeters = 0;
    let durationSeconds = 0;
    legs.forEach(leg => {
      distanceMeters += leg.distance.value;
      durationSeconds += (leg.duration_in_traffic && leg.duration_in_traffic.value)
        ? leg.duration_in_traffic.value
        : leg.duration.value;
    });

    return {
      distance_km: round2(distanceMeters / 1000),
      duration_min: Math.round(durationSeconds / 60)
    };
  } catch (e) {
    Logger.log("Corridor failed [" + cityName + " " + pairLabel + "]: " + e);
    return null;
  }
}

function computeTrend(cache, cityId, currentIndex) {
  if (currentIndex == null) return "flat";
  const key = "trend_" + cityId;
  const prev = cache.get(key);
  cache.put(key, String(currentIndex), 6 * 60 * 60);
  if (prev == null) return "flat";
  const diff = currentIndex - parseFloat(prev);
  if (diff > 0.15) return "up";
  if (diff < -0.15) return "down";
  return "flat";
}

function slugify(name) {
  return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Drops IndexHistory rows older than the retention window so the sheet
 * (and every doGet(?history=...) read) stays fast indefinitely.
 */
function pruneIndexHistory() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_INDEX_HISTORY);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  const values = sh.getRange(2, 1, lastRow - 1, 4).getValues();
  const cutoff = new Date(Date.now() - INDEX_HISTORY_RETENTION_DAYS * 86400000);
  const keep = values.filter(r => new Date(r[0]) >= cutoff);

  if (keep.length === values.length) return; // nothing to prune

  sh.getRange(2, 1, lastRow - 1, 4).clearContent();
  if (keep.length) {
    sh.getRange(2, 1, keep.length, 4).setValues(keep);
  }
}

/* ---------------- Web app endpoint ---------------- */

function doGet(e) {
  const params = (e && e.parameter) || {};

  if (params.history) {
    return handleHistoryRequest(params.history, params.range || "24h");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const json = ss.getSheetByName(SHEET_LATEST).getRange(2, 1).getValue() || "{}";
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Serves per-city trend data for the frontend's charts.
 * ?history=<cityId>&range=24h  -> hourly points for the last 24 hours
 * ?history=<cityId>&range=7d   -> one point per day (latest hour recorded
 *                                  that day) for the last 7 days
 */
function handleHistoryRequest(cityId, range) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_INDEX_HISTORY);
  const lastRow = sh.getLastRow();
  let rows = lastRow < 2 ? [] : sh.getRange(2, 1, lastRow - 1, 4).getValues();

  rows = rows
    .filter(r => r[1] === cityId)
    .map(r => ({ t: new Date(r[0]), index: Number(r[3]) }))
    .sort((a, b) => a.t - b.t);

  let points;

  if (range === "7d") {
    // Bucket by calendar day (Asia/Kolkata), keep the LAST (latest-hour)
    // reading recorded for each of the past 7 days.
    const byDay = {};
    rows.forEach(r => {
      const dayKey = Utilities.formatDate(r.t, "Asia/Kolkata", "yyyy-MM-dd");
      byDay[dayKey] = r; // overwritten each time -> ends up as the latest one that day
    });
    const days = Object.keys(byDay).sort().slice(-7);
    points = days.map(d => ({ t: byDay[d].t.toISOString(), index: round2(byDay[d].index) }));
  } else {
    const cutoff = new Date(Date.now() - 24 * 3600000);
    points = rows
      .filter(r => r.t >= cutoff)
      .map(r => ({ t: r.t.toISOString(), index: round2(r.index) }));
  }

  const payload = { city: cityId, range: range, points: points };
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
