# launch-artifact (NN=02) — port notes

## What was ported

Root `<section data-section="launch-artifact" data-testid="sec-launch-artifact">` (no legacy
id — the registry lists none for this section), 1:1 from
`reference/rendered/02-launch-artifact.html` (8 655 raw bytes):

- Two decorative `<i>` "corner tick" marks (top-left / top-right), each a 13×13px transparent
  box drawing an L-shaped mark out of two 1px/1.2px gradient lines — same technique as
  `proof-short`.
- A step row: a 5×5px square dot + a Roboto Mono eyebrow label `"01 · тарифы"`
  (`{{ nPlans }} · тарифы` in the raw template — `nPlans` is `num.plans` from
  `reference/dc-script.js`, a static count of the two plan cards below, so it was written out
  literally as `"01 · тарифы"` in `data.ts`, matching the rendered value verbatim).
- A 2-column CSS grid (`grid-template-columns: repeat(2, minmax(0px, 1fr))`, `gap: 1px`,
  `background`/`border: #E4E4E7`) holding two pricing-plan cards:
  - **"установка"** (`01`) — "Установим готовый магазин", 4 900 ₽ разово, 5 feature rows with
    icons (clock/compass/card/receipt/shield), primary CTA "Поставить магазин" → `t.me/vladupready`.
    This card carries the `box-shadow: inset 0 2px 0 #18181B` top accent (the "highlighted"
    plan marker in `data.ts`).
  - **"оформление"** (`02`) — "Оформим под ваш бренд", 9 900 ₽ разово, 5 feature rows
    (clock/layers/palette/type/shield-off, the last one muted/grey — "Возврату не подлежит"),
    outline CTA "Оформить под бренд" → the same Telegram link.

Every inline style value from the rendered DOM (colors as `rgb(...)`, font sizes, the two
`clamp()` paddings, gaps, border-radius, box-shadow, transitions) was copied verbatim into
`styles.module.css` classes — nothing recomputed or approximated. All copy text and the 10
feature-row strings were copied verbatim into `data.ts`, one `Plan`/`PlanFeature` object per
card. All 10 inline SVG icons were reproduced pixel-for-pixel (`viewBox`, `d` path data,
`stroke-width`, `stroke-linecap/linejoin`) as a small `FeatureIcon` switch component — the two
stroke colors used (`#71717A` normal, `#A1A1AA` muted) are exactly the ones in the rendered
markup.

`FeatureIcon` and `PlanCard` are small sub-parts of this one section, kept in `index.tsx`
(co-located, never used outside this file) — the port brief §3.1 restricts this folder to
`index.tsx` / `styles.module.css` / `data.ts` / `NOTES.md`, so nothing was split into extra
files.

## Interactive behaviour re-implemented

None — this section is fully static. Checked `reference/dc-script.js` for anything touching it:

- `gridPlans: gfit(300, 2)` (line 425) computes the 2-column grid — `gfit`/`ffit` derive a
  column count from container width; for exactly 2 fixed plan cards this always resolves to
  `repeat(2,minmax(0,1fr))`, matching the rendered DOM exactly, so it was hard-coded in CSS
  rather than re-implemented as a resize-driven state (there is nothing to recompute: the
  plan list itself is not dynamic).
- `nPlans: num.plans` (line 429) is the static count of plan cards (`2`), already baked into
  the rendered label `"01 · тарифы"` — no counter/state needed.
- No `show*` visibility flag, tab, rail/carousel, or accordion in `props.json` or
  `dc-script.js` references this section's copy strings ("Установим готовый магазин",
  "Оформим под ваш бренд", "t.me/vladupready" appears elsewhere too but only as the same
  static link).

The only "behaviour" in the reference markup is the two `style-hover="…"` attributes on the
CTA links (`reference/raw/02-launch-artifact.html` lines 46 and 84) — pure CSS hover, not
state, so it was ported as `:hover` rules in `styles.module.css` (`.ctaPrimary:hover` /
`.ctaOutline:hover`), matching the hover colors exactly (`#3F3F46` / `#FAFAFA` + `#D4D4D8`
border).

## Measured diff

Toolchain: `pnpm exec tsc --noEmit` → clean, no output (0 errors).

Ran (per §3.6, port 5202):

```
cd apps/homepage/port && mkdir -p .logs && \
  nohup pnpm exec vite --port 5202 > .logs/launch-artifact.log 2>&1 &   # PID 44115
# waited for "VITE v6.4.3  ready in 194 ms" in the log
node scripts/shot.mjs --url "http://localhost:5202/?section=launch-artifact" \
  --selector '[data-section="launch-artifact"]' --out shots/out/launch-artifact.png
node scripts/diff.mjs reference/shots/launch-artifact.png shots/out/launch-artifact.png
kill 44115   # confirmed dead: `ps -p 44115` exit 1, `lsof -iTCP:5202` empty
```

`diff.mjs` printed exactly:

```json
{"diffPct":2.8626,"w":1440,"h":536,"note":"size mismatch: reference/shots/launch-artifact.png 1278x536 vs shots/out/launch-artifact.png 1440x536, padded to 1440x536"}
```

**diffPct = 2.8626** — above the ≤2 target. See below for why; it is not a fault in this
section's own markup/CSS.

## What still differs and why

1. **Width: reference 1278px vs mine 1440px.** Same systemic cause already documented by the
   `hero` and `proof-short` agents: the legacy page wraps the whole body in
   `<div style="max-width:1280px;margin:0 auto;border-left/right:1px solid #E4E4E7">`
   (`apps/homepage/index.html:79`), 1280 − 2×1px border = 1278px = the reference shot's width.
   `reference/rendered/02-launch-artifact.html`'s own `<section>` has no width constraint —
   it inherits it from that shared ancestor, which doesn't exist when the section is rendered
   alone via `?section=launch-artifact`. Not fixable inside this folder.

2. **A fixed-position debug/QA overlay bleeds into the reference screenshot.** Visually
   inspecting `reference/shots/launch-artifact.png` shows a panel with 5 toggle switches and a
   row of "warm"/"price" pill buttons overlapping roughly the left third of the image, sitting
   on top of the plan cards (partially obscuring the price and a few feature rows of the first
   card). This markup does **not** exist anywhere in `reference/rendered/02-launch-artifact.html`
   or `reference/raw/02-launch-artifact.html` — it is the page-wide debug widget from
   `apps/homepage/index.html:1113` (`position:fixed;left:16px;bottom:16px;z-index:60`), built in
   `reference/dc-script.js` from `blockRows` (5 `show*` toggles: proof/frame/included/pricing/faq,
   lines 330–334) and `audienceBtns` (the cold/warm/price switcher, lines 274–278) — the same
   widget hero's NOTES.md already flagged as page-wide and unconsumed by any single section's own
   template. Because it is `position: fixed`, it is pinned to the browser *viewport*, not to any
   section's document flow; `scripts/shot.mjs` uses `elementHandle.screenshot()` on a 1440×1080
   viewport, and Puppeteer scrolls the target element into view before clipping — for this
   section's height (536px) and scroll position, that pins the fixed widget's on-screen location
   inside the crop rectangle. A crop-only comparison (reference 1278×536 vs. my output cropped to
   the same 1278×536, no zero-padding) confirms this is genuine pixel content, not just the width
   padding: `{"diffPct":3.0862,"w":1278,"h":536}` — slightly *higher* than the padded 1440-wide
   number, i.e. the overlay accounts for more of the mismatch than the missing 162px column does.
   My component does not, and should not, render this widget — it belongs to no single section
   and is explicitly the kind of page-wide dev control the port brief scopes out of individual
   sections.
3. No other visual delta observed by eye between the two screenshots at the overlapping,
   unobstructed region (headline, price, feature rows, both CTA buttons, corner ticks, step
   label all match pixel-for-pixel by inspection).

Given 1 and 2 are both reference-capture artifacts outside this folder's control (not missing
or wrong content in the ported component), this is reported as **partial** per the task's own
classification (`diffPct > 2`), while the component itself is complete and faithful to the
rendered DOM.

## Needs from merger

- Wrap the assembled sections (inside `<Shell>`, between the nav and footer) in the shared
  `max-width: 1280px; margin: 0 auto; border-left/right: 1px solid #E4E4E7` container from
  `apps/homepage/index.html:79` — same ask as `proof-short`'s and `hero`'s notes. Once that
  exists, a full-page screenshot of `launch-artifact` should stop showing the 1440-vs-1278
  size-mismatch note.
- Decide who (if anyone) owns the fixed-position debug widget at `apps/homepage/index.html:1113`
  (`show*` block toggles + cold/warm/price audience switcher, `blockRows`/`audienceBtns` in
  `reference/dc-script.js`). It is page-global, not scoped to any one section's rendered DOM —
  hero's notes already flagged `audienceBtns` as orphaned; this section's measurement adds
  concrete evidence that its on-screen position also contaminates per-section reference
  screenshots for taller sections. Two options for the merger: (a) render it once in `App.tsx`
  as a shared dev-only control (if Ivan wants that behaviour preserved in the port at all), or
  (b) treat it as out of scope for the port and note in `REPORT.md` that any per-section diff
  number for a section tall enough to overlap it (this one measured concretely; others should be
  spot-checked) is inflated by a reference-capture artifact, not a real defect.
- Nothing else needed from the merger — `launch-artifact` is otherwise self-contained; the
  static grid, copy, icons, and hover CTAs need no shared state, prop, or file.
