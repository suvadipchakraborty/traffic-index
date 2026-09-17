# Indian Traffic Premier League (ITPL)

A mobile-first web app that scores traffic congestion for India's biggest
cities as **minutes per kilometre**, using free, live-traffic-aware
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

## 4b. Weekly league table and time-of-day heatmap

Two more views on the homepage, both sourced from the same `IndexHistory`
sheet as the trend charts above:

- **Weekly league table** — every city ranked by its average index across
  the last 7 days, same bar-chart style as the "right now" ranking above
  it, just averaged rather than a single snapshot.
- **Time-of-day heatmap** — a scrollable table: cities down the side, 8
  time-of-day windows across the top (6-8 AM, 8-10 AM, 10-12 PM, 12-4 PM,
  4-6 PM, 6-8 PM, 8-10 PM, 10-12 AM), each cell showing that city's average
  index in that window over the last 7 days, colour-coded by congestion
  band. The overnight 3am check-in isn't part of any bucket — none of the
  8 windows extend before 6am — so that reading is simply excluded here.

**API contract:**
```
GET {API_URL}?weekly_ranking=1  → { generated_at, range: "7d", cities: [{id, name, avg_index}] }
GET {API_URL}?heatmap=1         → { generated_at, bucket_labels: [...8 strings], cities: [{id, name, values: [8 numbers or null]}] }
```
A `null` in `values` means no readings fell in that bucket in the last 7
days yet (normal for a brand-new deployment) — the frontend renders it as
a dash instead of a fabricated number.

Same demo-pattern fallback as the trend charts applies here too, with the
same "Live from sheet" / "Demo pattern" labelling.

## 5. Forcing the route through the city centre (important)

Left to itself, Google's routing engine optimizes purely for speed — which
on a cross-city request very often means hopping onto a ring road or
bypass and skipping the congested core entirely. That defeats the whole
point of this index, since the number you'd get back would reflect the
bypass's traffic, not the city's.

**The fix, and a real bug we found and fixed along the way:** each
corridor request includes the city's **Center** point as a waypoint, so
Google is forced to route from the border, through downtown, to the
opposite border. The first version of this used a plain waypoint
(`addWaypoint(center)`) — but live testing caught that Google's Directions
API **silently drops all live-traffic data** whenever a request includes
a plain "stopover" waypoint. This is documented, expected behavior on
Google's side, not a glitch: `duration_in_traffic` is only returned when
"the request does not include stopover waypoints." Every number this app
produced while that bug was live was Google's static, typical-conditions
estimate — not real traffic — even though everything looked like it was
working.

**The actual fix:** prefix the waypoint with `via:` —
`addWaypoint("via:" + center)`. A `via:` waypoint still forces the route
through that point, but Google treats it as a pass-through rather than a
stop, which keeps live traffic data intact. As a side benefit, it also
keeps the response as a single leg (a plain waypoint splits it into two),
so this costs exactly the same one Maps service call per corridor as
before — no extra quota impact from this fix.

On top of that, `AVOID_HIGHWAYS` (top of `Code.gs`, default `true`) tells
Google to avoid limited-access highways/expressways altogether, closing
off the easiest way to sneak back onto a bypass en route to the centre
point.

**Picking a good Center point per city:** something unambiguous and
genuinely downtown — a central railway station, a well-known clock
tower/square, the old city's main market. Avoid anything Google might
resolve ambiguously (a generic area name) or anything already near a ring
road itself.

**Trade-offs to know about:**
- Expect the index to jump upward the first time the `via:` fix runs for
  a city that was previously reporting static-only numbers — that's real
  traffic finally being counted, not a bug.
- `AVOID_HIGHWAYS = true` is a blunt instrument — it also rules out
  legitimate arterial flyovers inside the city, not just ring roads.
  If a city's numbers look artificially inflated (Google forced onto tiny
  back streets it wouldn't realistically use), try setting `AVOID_HIGHWAYS
  = false` for that run and rely on the Center waypoint alone — it does
  most of the work by itself.
- `fetchCorridor()` sums across whatever legs come back, defensively —
  normally just one with a `via:` waypoint, but this won't silently break
  if that ever changes.
- If you ever see `"No live traffic data for [...] — used static duration
  instead."` in Executions, that's your early-warning sign this fix has
  stopped working for a specific corridor — worth investigating rather
  than ignoring, given what caused it the first time.

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

## 8. SEO: social share cards + per-city pages

**⚠️ One required step before any of this works: find-and-replace
`SITE_URL_PLACEHOLDER` with your real domain** (e.g. `itpl.yourdomain.com`,
no `https://`, no trailing slash) across every file that has it —
`index.html`, `sitemap.xml`, `robots.txt`, and
`scripts/generate-city-pages.py`. WhatsApp, Slack, and Google all require
**absolute** URLs for `og:image` and canonical links — a relative path
silently fails to show a preview at all, with no error to tell you why.

### Social share cards (Open Graph)
`index.html`'s `<head>` now has `og:title`, `og:description`, `og:image`,
`og:url`, and matching `twitter:*` tags, plus a shared social-card image
at `assets/og/og-home.png`. Once the placeholder is fixed, pasting your
homepage link into WhatsApp or Slack should show a rich preview with the
ITPL branding.

**Why there's no live/dynamic OG image:** this is a static site with no
server, so there's no way to render "today's index" into an image on
request — that needs either a serverless function (Netlify Functions, for
example) or a third-party dynamic-image service, both of which are real
options later but add real complexity and (for Netlify Functions
specifically) a paid-tier dependency you may not want given the account
issue you're already navigating. For now, the cards show fixed branding —
still a big upgrade over the blank/generic preview you'd get without any
tags at all.

### Per-city pages
Each tracked city now has its own real, separate HTML file at
`city/<slug>/index.html` (e.g. `city/mumbai/index.html`) — not a
JavaScript route, an actual file. That distinction matters: WhatsApp/Slack
previews and most search crawlers don't run JavaScript to decide what a
page is about, so a single-page app with a `#hash` or `?query` router
would show identical, generic content for every city regardless of which
URL was shared. These are genuinely separate pages with their own
`<title>`, meta description, and OG image (`assets/og/og-<slug>.png`),
built to target searches like "Mumbai traffic index."

**How each city page works:** static, crawlable text (a description of
that city plus its 8 real border points) is baked in at generation time,
so search engines have real unique content to index immediately. A small
script, `js/city.js`, then fetches your live backend on page load and
fills in the current index number — same live-data pattern as the main
app, just on a simpler page. A button links back to
`index.html?open=<slug>`, which auto-opens that city's full detail sheet
(trend charts included) in the main app — `js/app.js` already supports
this via `applyOpenCityParam()`. The bottom nav's Methodology/Contact
links go to `index.html#methodology` / `index.html#contact`, which
`applyInitialHashView()` in `app.js` opens directly to the right tab.

**Regenerating these pages:** `scripts/generate-city-pages.py` builds all
10 from `data/sample-cities.json`. Re-run it (`python3
scripts/generate-city-pages.py`) any time you add/remove a tracked city or
change border points, so these pages stay in sync — it always overwrites
the existing city folders, safe to run repeatedly.

**Keeping the API URL in sync:** `js/city.js` has its own copy of
`DATA_SOURCE.API_URL`, deliberately kept separate from `js/app.js` so a
mistake on the simpler city pages can never take down the main app. If you
ever redeploy your Apps Script and get a new `/exec` URL, update it in
**both** files.

### sitemap.xml + robots.txt
Both are at the project root and already list the homepage and all 10
city pages. Submit `sitemap.xml` to Google Search Console once your
domain is live — this is usually the fastest way to get new pages crawled
rather than waiting for Google to discover them organically.

## 9. Ideas for a v3 (not built yet, scoped for later)

- **City comparison** — pick 2–3 cities side by side.
- **Push/email alerts** — notify when a city crosses into "Severe."
- **More cities** — the Cities sheet is fully data-driven, so scaling
  past the starter set is just adding rows (mind the quota note above).

---
Created by Suva
