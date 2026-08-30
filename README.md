# The Great Indian Traffic Index

A mobile-first web app that scores traffic congestion for India's Tier 1 and
Tier 2 cities as **minutes per kilometre**, using free, live-traffic-aware
driving times pulled via Google Apps Script.

```
traffic-index/
├── index.html          # single-page app: Index / Methodology / Contact
├── css/style.css        # "highway milestone" design system
├── js/app.js             # rendering, filters, sort, city detail, mailto
├── data/sample-cities.json  # bundled mock data (14 cities) — used until
│                             #   you connect the live backend
├── backend/Code.gs       # Google Apps Script backend (the free data engine)
└── README.md
```

## 1. How the index is calculated (and one fix vs. your original spec)

Your brief described two things that don't quite agree: "average time to
travel per kilometre" is **time ÷ distance** (minutes per km), but the step
"index score by calculating total distance by total time" reads as
**distance ÷ time** (a speed, km per minute). I went with the first
definition, since it matches the stated goal and is more intuitive for
readers — **higher number = worse traffic**:

```
Index (min/km) = Total travel time across the 4 corridors (min)
                ÷ Total distance across the 4 corridors (km)
```

Everything in this build (frontend labels, sample data, backend formula) is
consistent with that. If you actually want the inverse (a speed score,
higher = better), it's a one-line flip in `Code.gs` (`totalDist / totalTime`)
and a label change in `app.js`.

Also note: 8 border points only ever produce **4 corridors** (opposite
pairs), not 8 legs — E-W, N-S, NE-SW, NW-SE. The code reflects that.

## 2. Run it today (no backend needed)

`index.html` works standalone against the bundled `data/sample-cities.json`.
Open it locally or upload the folder as-is to any static host to see the
full design and interaction before wiring up live data.

## 3. Wire up the free live backend

1. Create a new Google Sheet.
2. **Extensions → Apps Script**, delete the placeholder code, paste in
   `backend/Code.gs`.
3. Back in the Sheet, the script expects a tab called **Cities** with header:
   `City | State | Tier | N | S | E | W | NE | NW | SE | SW | Center` — one
   row per city, each direction column holding a place name Google Maps can
   resolve (a toll plaza, checkpost, or well-known junction at the city's
   edge). **Center** is a well-known downtown landmark (central railway
   station, main square, clock tower) — see section 7 below for why this
   matters.
4. In the Apps Script editor, run `setup()` once. Authorise the requested
   permissions (this uses your Google account's Maps quota — no billing
   card needed). This creates the `Latest`/`History` tabs, installs the
   refresh schedule (see below), and runs the first calculation.
5. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the resulting `/exec` URL and paste it into
   `DATA_SOURCE.API_URL` at the top of `js/app.js`.
7. Re-upload/redeploy your frontend. It now polls your live sheet and
   auto-refreshes every hour, matching the backend's schedule.

### Refresh schedule (not a flat "every hour")
By default the backend runs **hourly from 6am–11pm, plus one overnight
check-in at 3am** — 19 runs/day total instead of 24, since traffic barely
moves between midnight and 6am and there's no reason to burn quota on it.
This is controlled by two constants near the top of `Code.gs`:

```js
const ACTIVE_HOURS = [6, 7, 8, ..., 23]; // hourly refresh window
const QUIET_HOUR_RUN = 3;                 // single overnight refresh
```

Edit these to taste, then **re-run `setup()`** — it always clears old
`runAllCities` triggers before installing new ones, so it's safe to re-run
any time you change the schedule. One platform limit to know: Apps Script
fires time-driven triggers "near" the target time, not to-the-second — a
9am trigger might fire anywhere from roughly 8:50 to 9:10. There's no way
to guarantee exact top-of-the-hour firing on the free tier.

### Quota reality check
`Maps.newDirectionFinder()` is free but rate-limited per Google account
(undocumented daily ceiling). The mandatory city-centre waypoint (section
5) roughly doubles the routing work per corridor versus a plain
point-to-point request, so this is easier to hit than it looks. With the
default schedule (19 runs/day) and **10 cities**, that's `10 × 4 × 19 =
760` corridor requests/day. If you still see `"Service invoked too many
times for one day"` in **Executions** (Apps Script editor → clock icon in
the sidebar), your options, roughly cheapest first:
- Trim `ACTIVE_HOURS` further (e.g. every 2 hours instead of hourly)
- Track fewer cities
- Wait — the quota resets daily
- Move to the paid Directions/Routes API (Google Cloud, has a recurring
  monthly free credit) for guaranteed headroom at scale

## 4. Trend charts (24h and 7-day)

Each city's detail sheet now shows two charts:

- **Last 24 hours** — one point per hourly refresh.
- **Last 7 days** — one point per day, taken from that day's *latest* recorded hour (e.g. if the last successful run of the day was 11 pm, that's the point plotted for that day).

**Where the data comes from:** `Code.gs` now writes every city's computed
index to a new **IndexHistory** sheet on each hourly run (`Timestamp | CityId
| CityName | Index`), created automatically by `setup()`. It's pruned back
to the last ~8 days automatically so the sheet doesn't grow forever.

**API contract** (same `/exec` URL, extra query params):
```
GET {API_URL}                              → latest snapshot (unchanged)
GET {API_URL}?history=<cityId>&range=24h   → { city, range, points: [{t, index}, ...] }
GET {API_URL}?history=<cityId>&range=7d    → same shape, one point per day
```
`cityId` is the slug shown in the Latest snapshot (e.g. `delhi`, `bengaluru`)
— `js/app.js` already sends the right id automatically when you tap a city.

**Before you connect the backend:** the charts still render using a
seeded, deterministic demo pattern (typical Indian peak-hour/weekday shape)
so the feature is fully visible and testable today. The app labels these
clearly as *"Demo pattern — connect backend for real history"* versus
*"Live from sheet"* once `DATA_SOURCE.API_URL` is set and returning real
history — nothing here is presented as real traffic data until it actually
is.

**Heads-up on history depth:** history only starts accumulating from the
moment `setup()` first runs `runAllCities()`. A brand-new deployment will
show a thin 24h chart and an empty-ish 7-day chart until a full week of
hourly runs has happened — that's expected, not a bug.

## 5. Forcing the route through the city centre (important)

Left to itself, Google's routing engine optimizes purely for speed — which
on a cross-city request very often means hopping onto a ring road or
bypass and skipping the congested core entirely. That defeats the whole
point of this index, since the number you'd get back would reflect the
bypass's traffic, not the city's.

**The fix already built in:** each corridor request now includes the
city's **Center** point as a mandatory waypoint (`addWaypoint`), so Google
is forced to route from the border, through downtown, to the opposite
border. On top of that, `AVOID_HIGHWAYS` (top of `Code.gs`, default `true`)
tells Google to avoid limited-access highways/expressways altogether,
closing off the easiest way to sneak back onto a bypass en route to the
centre point.

**Picking a good Center point per city:** something unambiguous and
genuinely downtown — a central railway station, a well-known clock
tower/square, the old city's main market. Avoid anything Google might
resolve ambiguously (a generic area name) or anything already near a ring
road itself.

**Trade-offs to know about:**
- Expect the index to jump upward the first time this runs for a city —
  that's the fix working, not a bug. Routes are now longer/slower on
  purpose, because they're honest about going through downtown.
- `AVOID_HIGHWAYS = true` is a blunt instrument — it also rules out
  legitimate arterial flyovers inside the city, not just ring roads.
  If a city's numbers look artificially inflated (Google forced onto tiny
  back streets it wouldn't realistically use), try setting `AVOID_HIGHWAYS
  = false` for that run and rely on the Center waypoint alone — it does
  most of the work by itself.
- A route with a waypoint returns **multiple legs** (border→center,
  center→border) instead of one. `fetchCorridor()` already sums across
  all of them — if you ever modify that function, keep that in mind or
  you'll silently measure only half the corridor.

## 6. Data quality — please verify before going live

Every border point shipped in `Code.gs`'s sample row and in
`data/sample-cities.json` is an **illustrative placeholder** built from
general knowledge of each city's layout, not a surveyed or verified
coordinate. Before publishing real numbers:

- Confirm each of the 8 points actually sits at the current city limit
  (cities like Bengaluru, Pune, and the NCR keep expanding).
- Prefer points Google Maps resolves unambiguously (toll plazas, named
  checkposts) over generic descriptions.
- Re-review every 6–12 months as ring roads, bypasses, and city limits
  change.

The Methodology page already tells users this is a city-level pulse check
using reference points, not a survey-grade boundary — keep that framing
honest as you add cities.

## 7. Hosting on your domain

The app is fully static (HTML/CSS/JS) — no build step, no server. Any
static host works: GitHub Pages, Netlify, Vercel, Cloudflare Pages, or a
plain folder upload to your existing hosting/cPanel. Point your domain's
DNS at whichever you choose and upload the four files/folders above.

## 8. Ideas for a v3 (not built yet, scoped for later)

- **City comparison** — pick 2–3 cities side by side.
- **Push/email alerts** — notify when a city crosses into "Severe."
- **More cities** — the Cities sheet is fully data-driven, so scaling
  past the starter set is just adding rows (mind the quota note above).

---
Created by Suva
