# final-cta (NN=15) — port notes

## What was ported

Source: `reference/rendered/15-final-cta.html` (the rendered DOM, per §3 item 3 — not the raw
template). This is the closing CTA band: two corner "brackets" (decorative `<i>` pixels), a
heading, a paragraph with an inline `todo: response_time` badge, and a "Связаться" (Telegram)
button with an inline Telegram-logo SVG.

- `data.ts` — every string copied verbatim from the rendered HTML: heading, the paragraph split
  around the badge span (`paragraphBefore` / `responseTimeBadge` / `paragraphAfter`), the CTA
  `href` (`https://t.me/vladupready`) and label (`Связаться`). `reference/props.json` has no key
  touching this section — confirmed by grep for `response_time`, `final-cta`, the section's own
  `data-dc-tpl` ids (770–778), and `Финальный призыв`: no hits. Every value here is a DOM literal.
- `styles.module.css` — one CSS-module class per inline `style="…"` in the rendered HTML, same
  property values (colors kept as the rendered `rgb(...)` triples, `clamp()` sizes, `letter-spacing`,
  `box-shadow`, etc., copied 1:1). No section-owned width/max-width was present in the source, so
  none was added.
- `index.tsx` — the SVG path data (Telegram glyph) copied byte-for-byte from the rendered `<path
  d="…">`.

## Interactive behaviour

Grepped `reference/dc-script.js` for anything specific to this section (`final-cta`, the
`data-dc-tpl` ids 770–778, `response_time`, `vladupready`) — no hits; the page JS carries no
per-section logic for final-cta (no tabs/rails/accordion/`show*` flag reads it).

The one piece of behaviour that DOES apply here is generic, not section-specific: every element
carrying the runtime's `scp2` class gets a hover-state style swap driven by its
`style-hover="…"` attribute (see `reference/raw/15-final-cta.html` line 6:
`style-hover="background:#3F3F46;color:#fff"` on the CTA `<a>`). That swap mechanism lives in
`support.js` (out of scope per brief §0), so it's re-expressed here as local React state:
`useState<boolean>` + `onMouseEnter`/`onMouseLeave` toggling a second CSS-module class
(`.ctaHover`, `background: rgb(63, 63, 70)` — the hex `#3F3F46` from `style-hover`, converted to
match the rest of this file's `rgb()` convention; the hover text color, `#fff`, is unchanged from
the base state so no separate rule was needed for it).

## Measured diff

tsc: `pnpm exec tsc --noEmit` from `apps/homepage/port` — clean, no output.

Vite: `nohup pnpm exec vite --port 5215 > .logs/final-cta.log 2>&1 &` → PID 44824, confirmed ready
(`VITE v6.4.3 ready in 124 ms`) before shooting.

```
node scripts/shot.mjs --url "http://localhost:5215/?section=final-cta" \
  --selector '[data-section="final-cta"]' --out shots/out/final-cta.png
node scripts/diff.mjs reference/shots/final-cta.png shots/out/final-cta.png
```

```json
{"diffPct":3.7497,"w":1440,"h":459,"note":"size mismatch: reference/shots/final-cta.png 1278x459 vs shots/out/final-cta.png 1440x458, padded to 1440x459"}
```

`3.7497 > 2` → target missed by measurement, reported as-is (§3.6: "Report the number you
measured, even if it is worse").

Vite process killed after measuring (`kill 44824`, confirmed gone via `ps -p 44824` → exit 1,
empty listing).

## What still differs and why

Visually comparing `reference/shots/final-cta.png` and `shots/out/final-cta.png` side by side, the
ported text, badge, button, icon and corner brackets match the reference in position (relative to
their own centered column), size, color and spacing. The entire measured `diffPct` traces to two
causes outside this section's own folder/DOM, both already documented by sibling sections'
NOTES.md (`hero`, `social-proof`, `proof-full`) as a shared, cross-section root cause:

1. **Shared 1280px page wrapper.** `apps/homepage/index.html` line 79 wraps every section in
   `<div style="max-width:1280px;margin:0 auto;background:#fff;border-left:1px solid
   #E4E4E7;border-right:1px solid #E4E4E7">`, one level above each section's own `<section>` root.
   `reference/shots/final-cta.png` is 1278px wide (1280 minus the two 1px borders) because of this
   wrapper; this section's own rendered DOM carries no width constraint, so shooting it in
   isolation at the harness's full 1440px viewport is the correct behaviour for an unwrapped
   element — but it inflates both the raw content-shift and the padded-canvas comparison
   `diff.mjs` does when the two images differ in size (1278×459 vs 1440×458).
2. **Design-tool editor-chrome overlay in the reference capture.** `reference/shots/final-cta.png`
   has a panel of toggle switches and audience labels (`warm`, `price`, a `?v=` hint) bleeding in
   from the left edge — the same DC-editor overlay `social-proof` and `proof-full` flagged on
   their reference shots. It is not part of this section's rendered DOM.

Neither cause is fixable inside `sections/final-cta/**` without breaking §3 item 3 (styles must
match the rendered DOM's own values) or item 1 (own only this folder).

## Needs from merger

- Same as `hero`/`social-proof`/`proof-full`: wrap the assembled sections in `App.tsx` in the
  shared `max-width: 1280px; margin: 0 auto; background: #fff; border-left/right: 1px solid
  #E4E4E7` container from `apps/homepage/index.html` line 79, then re-measure this section's diff
  at that width — expected to drop well under the 2% target once the width matches.
- Same flag as `social-proof`/`proof-full`: whoever owns `reference/shots/*.png` should check
  whether the capture script is leaving the DC editor's own audience/block-visibility control
  panel in frame; `final-cta.png` carries the same overlay as those two.
- Nothing else — this section has no shared state, no cross-section behaviour, and no props.json
  entries to reconcile.
