#!/usr/bin/env python3
"""
Build index.html for the contact sheet.

Every tile label comes out of manifest.json — the run's own record — so a caption can
never disagree with the pixels beside it. The catalogue table below the grid is copied
from artifacts/wave/queue.json, artifacts/wave/spend.json and the four
artifacts/docs/2026-09-08-wave-<theme>.md handovers; a figure absent from those files is
written "not measured" and never guessed.

The page must open from file:// with no server: relative <img src>, no CDN, no webfont.
"""

import json
import os
from html import escape

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = json.load(open(os.path.join(HERE, "manifest.json")))

THEME_ORDER = ["supplements", "electronics", "womens-fashion", "home-goods"]
PAGE_ORDER = ["home", "category", "pdp"]
MODE_ORDER = ["light", "dark"]
PAGE_LABEL = {"home": "home", "category": "category", "pdp": "product"}

PORTS = {"supplements": 8070, "electronics": 8061, "womens-fashion": 8081, "home-goods": 8110}

# One row per theme. Sources are named per column in the table footnote; "not measured"
# means the figure is in none of the three source files.
TABLE = {
    "supplements": {
        "products": "15", "variants": "53", "categories": "not measured",
        "locales": "5", "images": "15 refs / 19 files", "usd": "0.939",
    },
    "electronics": {
        "products": "14", "variants": "34", "categories": "7",
        "locales": "5", "images": "14 refs / 22 files", "usd": "0.300",
    },
    "womens-fashion": {
        "products": "12", "variants": "87", "categories": "7",
        "locales": "1 of 5 declared", "images": "24 refs / 30 files", "usd": "0.450",
    },
    "home-goods": {
        "products": "12", "variants": "38", "categories": "6",
        "locales": "5", "images": "12 refs / 17 files", "usd": "0.600",
    },
}

BY_KEY = {(m["theme"], m["mode"], m["kind"]): m for m in MANIFEST}


def tile(theme, mode, kind):
    rec = BY_KEY.get((theme, mode, kind))
    label = f'<span class="t-th">{escape(theme)}</span><span class="t-sep">·</span>' \
            f'<span class="t-md t-md-{mode}">{mode}</span><span class="t-sep">·</span>' \
            f'<span class="t-pg">{PAGE_LABEL[kind]}</span>'
    if rec is None:
        return f'<figure class="tile tile-missing"><div class="miss">no record</div>' \
               f'<figcaption>{label}</figcaption></figure>'
    if rec.get("status") != "ok":
        reason = escape(rec.get("reason") or rec.get("status") or "unknown")
        return (f'<figure class="tile tile-down">'
                f'<div class="miss"><b>stand down</b><span>{reason}</span></div>'
                f'<figcaption>{label}</figcaption></figure>')
    src = f'shots/{rec["file"]}'
    flag = ""
    if rec.get("reshot"):
        flag = '<span class="flag" title="' + escape(rec.get("note", "")) + '">re-shot</span>'
    meta = (f'{rec.get("http")} · data-mode={escape(str(rec.get("landedMode")))} · '
            f'{rec.get("images")} img, {rec.get("broken")} broken · bg {escape(str(rec.get("bg")))}')
    return (f'<figure class="tile">'
            f'<a href="{src}" target="_blank" rel="noreferrer">'
            f'<img src="{src}" alt="{escape(theme)} {mode} {kind}" loading="lazy" width="1440" height="1200">'
            f'</a>'
            f'<figcaption>{label}{flag}<span class="meta">{meta}</span></figcaption>'
            f'</figure>')


ok = sum(1 for m in MANIFEST if m.get("status") == "ok")
down = sum(1 for m in MANIFEST if m.get("status") != "ok")

rows = []
for theme in THEME_ORDER:
    tiles = "".join(tile(theme, mode, kind) for mode in MODE_ORDER for kind in PAGE_ORDER)
    live = any(BY_KEY.get((theme, m, k), {}).get("status") == "ok" for m in MODE_ORDER for k in PAGE_ORDER)
    state = '<span class="ok">live</span>' if live else '<span class="bad">down</span>'
    rows.append(
        f'<section class="row">'
        f'<h2 class="rowhead"><span class="name">{escape(theme)}</span>'
        f'<span class="port">localhost:{PORTS[theme]}</span>{state}</h2>'
        f'<div class="tiles">{tiles}</div>'
        f'</section>'
    )

trs = []
for theme in THEME_ORDER:
    d = TABLE[theme]
    cells = "".join(
        f'<td class="{"na" if v.startswith("not measured") else ""}">{escape(v)}</td>'
        for v in (d["products"], d["variants"], d["categories"], d["locales"], d["images"])
    )
    trs.append(f'<tr><th scope="row">{escape(theme)}</th>{cells}<td class="num">${escape(d["usd"])}</td></tr>')

HTML = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contact sheet — four store themes</title>
<style>
  :root {{
    --bg:#fbfbfa; --fg:#101010; --dim:#6b6b6b; --line:#e4e2dd;
    --card:#fff; --ok:#1a7f4b; --bad:#b3261e; --accent:#3b3b3b;
  }}
  * {{ box-sizing:border-box }}
  body {{
    margin:0; padding:28px 24px 64px;
    font:14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background:var(--bg); color:var(--fg);
  }}
  header {{ max-width:1680px; margin:0 auto 22px }}
  h1 {{ font-size:20px; margin:0 0 6px; letter-spacing:-.01em }}
  .sub {{ color:var(--dim); font-size:13px; margin:0 }}
  .sub b {{ color:var(--fg); font-weight:600 }}
  main {{ max-width:1680px; margin:0 auto }}

  .colhead {{ display:grid; grid-template-columns:repeat(6,1fr); gap:10px;
              position:sticky; top:0; z-index:5; background:var(--bg);
              padding:8px 0 8px 0; border-bottom:1px solid var(--line); margin-bottom:14px }}
  .colhead div {{ font-size:11px; letter-spacing:.08em; text-transform:uppercase;
                  color:var(--dim); text-align:center }}
  .colhead .light {{ color:#8a6d1f }}
  .colhead .dark  {{ color:#3d4f7a }}

  .row {{ margin:0 0 26px }}
  .rowhead {{ display:flex; align-items:baseline; gap:10px; margin:0 0 8px; font-size:15px }}
  .rowhead .name {{ font-weight:650; letter-spacing:-.01em }}
  .rowhead .port {{ color:var(--dim); font-size:12px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace }}
  .ok  {{ color:var(--ok);  font-size:11px; text-transform:uppercase; letter-spacing:.08em }}
  .bad {{ color:var(--bad); font-size:11px; text-transform:uppercase; letter-spacing:.08em }}

  .tiles {{ display:grid; grid-template-columns:repeat(6,1fr); gap:10px }}
  .tile {{ margin:0; background:var(--card); border:1px solid var(--line); border-radius:8px;
           overflow:hidden; display:flex; flex-direction:column }}
  .tile a {{ display:block; line-height:0 }}
  .tile img {{ width:100%; height:auto; display:block; background:#f2f1ee }}
  figcaption {{ padding:7px 8px 8px; font-size:11px; display:flex; flex-wrap:wrap;
                align-items:center; gap:4px; border-top:1px solid var(--line) }}
  .t-th {{ font-weight:600 }}
  .t-sep {{ color:#c9c6c0 }}
  .t-md-light {{ color:#8a6d1f }}
  .t-md-dark  {{ color:#3d4f7a }}
  .t-pg {{ color:var(--dim) }}
  .meta {{ flex-basis:100%; color:#9a9791; font-size:10px;
           font-family:ui-monospace,SFMono-Regular,Menlo,monospace; word-break:break-word }}
  .flag {{ background:#fff3d6; color:#7a5b00; border:1px solid #eadfb8;
           border-radius:3px; padding:0 4px; font-size:10px }}

  .tile-down, .tile-missing {{ background:#fdf6f5; border-color:#f0d9d6 }}
  .miss {{ aspect-ratio:1440/1200; display:flex; flex-direction:column; align-items:center;
           justify-content:center; gap:6px; text-align:center; padding:14px;
           color:var(--bad); font-size:12px }}
  .miss span {{ color:#8a6560; font-size:10px; line-height:1.4 }}

  table {{ border-collapse:collapse; width:100%; margin-top:8px; background:var(--card);
           border:1px solid var(--line); border-radius:8px; overflow:hidden; font-size:13px }}
  caption {{ text-align:left; font-size:15px; font-weight:650; padding:24px 0 8px }}
  th, td {{ padding:9px 12px; text-align:left; border-bottom:1px solid var(--line) }}
  thead th {{ font-size:11px; text-transform:uppercase; letter-spacing:.07em;
              color:var(--dim); font-weight:600; background:#f6f5f2 }}
  tbody th {{ font-weight:600 }}
  tbody tr:last-child th, tbody tr:last-child td {{ border-bottom:none }}
  td.num {{ font-family:ui-monospace,SFMono-Regular,Menlo,monospace }}
  td.na {{ color:#9a9791; font-style:italic }}
  .foot {{ color:var(--dim); font-size:12px; margin-top:10px; line-height:1.6 }}
  .foot code {{ background:#f0efec; padding:1px 4px; border-radius:3px; font-size:11px }}
</style>
</head>
<body>
<header>
  <h1>Contact sheet — four store themes</h1>
  <p class="sub"><b>{ok} of {len(MANIFEST)}</b> cells shot at the <b>1440</b> viewport (1440x1200, deviceScaleFactor 1),
  {down} not shot. 4 themes x 2 modes x 3 pages. Mode forced through <code>localStorage["upready-store.mode"]</code>
  before first paint and the landed <code>data-mode</code> asserted after load — the same mechanism
  <code>theme-coverage-gate.mjs</code> uses. Shot 2026-09-08, 05:53:04-05:55:33 WITA. Click any tile for the full PNG.</p>
</header>
<main>
  <div class="colhead">
    <div class="light">light · home</div><div class="light">light · category</div><div class="light">light · product</div>
    <div class="dark">dark · home</div><div class="dark">dark · category</div><div class="dark">dark · product</div>
  </div>
  {"".join(rows)}

  <table>
    <caption>Catalogue and spend, per theme</caption>
    <thead><tr>
      <th scope="col">theme</th><th scope="col">products</th><th scope="col">variants</th>
      <th scope="col">categories</th><th scope="col">locales</th><th scope="col">images</th>
      <th scope="col">fal.ai spend</th>
    </tr></thead>
    <tbody>{"".join(trs)}</tbody>
  </table>
  <p class="foot">
    Products, variants, categories, locales and images are copied from each theme's
    <code>artifacts/docs/2026-09-08-wave-&lt;theme&gt;.md</code>; nothing here was re-counted.
    Spend is the per-theme sum of <code>artifacts/wave/spend.json</code>, which agrees with
    <code>costUsd</code> in <code>artifacts/wave/queue.json</code> for all four; the four together are
    $2.289 of the ledger's $2.667 total, the remaining $0.378 being the <code>_measurement</code> renders
    that belong to no theme. <b>Images</b> reads "refs / files": catalogue image references, then files
    delivered. <b>Categories for supplements is "not measured"</b> — that theme's handover states products,
    variants, locales and image refs but no category count, and the brief forbids a guess.
    <b>womens-fashion locales</b> is "1 of 5 declared": its handover records that only <code>en.json</code>
    was ever written while <code>profile.json</code> declares five <code>catalogLocales</code>.
  </p>
</main>
</body>
</html>
"""

out = os.path.join(HERE, "index.html")
open(out, "w").write(HTML)
print(f"wrote {out} — {ok} ok, {down} not shot, {len(MANIFEST)} cells")
