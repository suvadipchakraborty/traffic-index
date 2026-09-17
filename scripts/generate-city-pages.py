#!/usr/bin/env python3
"""
Generates the static per-city SEO landing pages under city/<slug>/index.html.

Why static files instead of client-side routing: WhatsApp/Slack link
previews and most search engine crawlers do not execute JavaScript when
deciding what to show for a URL, so a single-page app with a #hash or
?query router would show identical, generic content for every city no
matter what URL was shared. Real, separate HTML files with unique
<title>/description/og:image per city are what actually let each city
rank for its own searches and get its own share-preview card.

Run this again whenever you add/remove a tracked city or change border
points, so these pages stay in sync with data/sample-cities.json.

Usage:  python3 scripts/generate-city-pages.py
"""

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(ROOT, "data", "sample-cities.json")
CITY_DIR = os.path.join(ROOT, "city")

# Replace this with your real deployed domain before going live — it's
# used in canonical links and absolute og:image URLs, both of which
# WhatsApp/Slack/Google require to be full absolute URLs, not relative
# paths. Search this whole project for work-from-traffic.netlify.app to find every
# spot that needs it (index.html has it too).
SITE_URL = "work-from-traffic.netlify.app"

DIR_NAMES = {
    "N": "North", "S": "South", "E": "East", "W": "West",
    "NE": "North-East", "NW": "North-West", "SE": "South-East", "SW": "South-West"
}

PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{meta_desc}">
<link rel="canonical" href="{canonical}">

<meta property="og:type" content="website">
<meta property="og:site_name" content="Indian Traffic Premier League (ITPL)">
<meta property="og:title" content="{og_title}">
<meta property="og:description" content="{meta_desc}">
<meta property="og:image" content="{og_image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="{canonical}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{og_title}">
<meta name="twitter:description" content="{meta_desc}">
<meta name="twitter:image" content="{og_image}">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../css/style.css">
</head>
<body>

<div class="wrap">

  <header class="hero" style="padding-bottom:14px;">
    <div class="hero-inner">
      <div class="brand-row">
        <a href="../../index.html" style="display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit;flex:1;">
          <div class="brand-mark">ITPL</div>
          <div class="brand-name">Indian Traffic Premier League</div>
        </a>
      </div>
      <div class="page-eyebrow" style="margin-top:18px;">City report</div>
      <h1 class="page-title" style="font-size:38px;">{city_name}</h1>
      <p class="ranking-sub" style="margin-bottom:0;">{state}</p>
    </div>
  </header>

  <section class="ranking-section">
    <div class="lane-divider" aria-hidden="true"></div>
    <div class="ranking-header">
      <div>
        <div class="page-eyebrow" style="margin-bottom:2px;">Right now</div>
        <h2 class="ranking-title">Live traffic index</h2>
      </div>
    </div>
    <div class="chart-wrap ranking-wrap" id="liveIndexBox">
      <div class="chart-loading">Loading live index…</div>
    </div>
    <a href="../../index.html?open={slug}" class="btn-primary" style="text-decoration:none;display:inline-flex;margin-top:14px;">Open full interactive dashboard →</a>
  </section>

  <section class="ranking-section">
    <div class="lane-divider" aria-hidden="true"></div>
    <div class="page-eyebrow" style="margin-bottom:6px;">About this reading</div>
    <p class="page-intro">{intro_paragraph}</p>

    <h3 style="font-family:var(--font-display);text-transform:uppercase;font-size:14px;margin:18px 0 8px;">The eight border points used for {city_name}</h3>
    <div class="leg-list">
{borders_html}
    </div>

    <div class="caveat-box">
      This index measures minutes of travel time per kilometre across
      {city_name}'s four cross-city corridors, refreshed hourly using
      live, traffic-aware routing forced through the city centre —
      not a fast bypass. <a href="../../index.html#methodology" style="color:var(--milestone-yellow);">Read the full methodology →</a>
    </div>
  </section>

  <section class="ranking-section">
    <div class="lane-divider" aria-hidden="true"></div>
    <div class="page-eyebrow" style="margin-bottom:6px;">Other cities we track</div>
    <p class="page-intro" style="margin-bottom:14px;">Compare {city_name} against every other city in the league.</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
{other_cities_html}
    </div>
    <div class="lane-divider" aria-hidden="true" style="margin-top:20px;"></div>
  </section>

</div>

<nav class="bottom-nav">
  <a href="../../index.html" style="text-decoration:none;flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 0 8px;color:var(--muted);font-size:11px;">
    <span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8a8f98" stroke-width="1.8"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg></span>
    Index
  </a>
  <a href="../../index.html#methodology" style="text-decoration:none;flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 0 8px;color:var(--muted);font-size:11px;">
    <span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8a8f98" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg></span>
    Methodology
  </a>
  <a href="../../index.html#contact" style="text-decoration:none;flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 0 8px;color:var(--muted);font-size:11px;">
    <span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8a8f98" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></span>
    Contact
  </a>
</nav>

<script src="../../js/city.js"></script>
<script>window.CITY_SLUG = "{slug}";</script>
</body>
</html>
"""


def build_intro(city_name, state):
    return (
        f"{city_name}, {state} is one of the {{count}} cities tracked by the Indian Traffic "
        f"Premier League. Every hour, we pull live, traffic-aware driving times across "
        f"{city_name}'s four busiest cross-city corridors — each one forced through the "
        f"city centre rather than a ring road or bypass, so the number reflects what "
        f"driving through {city_name} actually feels like right now, not the fastest "
        f"possible detour around it."
    )


def main():
    with open(DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)

    cities = data["cities"]
    count = len(cities)
    slugs = [c["id"] for c in cities]

    for city in cities:
        slug = city["id"]
        name = city["name"]
        state = city["state"]

        out_dir = os.path.join(CITY_DIR, slug)
        os.makedirs(out_dir, exist_ok=True)

        borders_html = "\n".join(
            f'      <div class="leg-row"><div class="leg-pair">{DIR_NAMES[d]}</div>'
            f'<div class="leg-nums">{loc}</div></div>'
            for d, loc in city["borders"].items()
        )

        other_cities_html = "\n".join(
            f'  <a href="../{s}/index.html" style="background:var(--asphalt-2);border:1px solid var(--lane-line);'
            f'border-radius:20px;padding:8px 14px;font-size:12.5px;color:var(--chalk-dim);text-decoration:none;">{c["name"]}</a>'
            for c, s in zip(cities, slugs) if s != slug
        )

        meta_desc = (
            f"Live traffic congestion index for {name}, updated hourly. "
            f"See {name}'s current minutes-per-kilometre score, trend charts, "
            f"and how it compares to other major Indian cities."
        )
        title = f"{name} Traffic Index — Live Congestion Data | ITPL"
        og_title = f"{name} Traffic Index — Indian Traffic Premier League"
        canonical = f"https://{SITE_URL}/city/{slug}/index.html"
        og_image = f"https://{SITE_URL}/assets/og/og-{slug}.png"

        html = PAGE_TEMPLATE.format(
            title=title,
            meta_desc=meta_desc,
            og_title=og_title,
            canonical=canonical,
            og_image=og_image,
            city_name=name,
            state=state,
            slug=slug,
            intro_paragraph=build_intro(name, state).format(count=count),
            borders_html=borders_html,
            other_cities_html=other_cities_html,
        )

        out_path = os.path.join(out_dir, "index.html")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
