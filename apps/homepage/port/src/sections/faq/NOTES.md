# faq (NN=13) — port notes

## What was ported

Source: `reference/rendered/13-faq.html` (rendered DOM, source of truth per contract §3
item 3), cross-checked against `reference/raw/13-faq.html` for the `sc-for`/`sc-if`
template logic, and `reference/dc-script.js` (`get faqData()` ~line 157,
`renderVals()` faq mapping ~line 267) for the underlying data and behaviour.

Two-column bordered card (legacy id `sec-faq`, `border-top: 1px solid #E4E4E7`), two
small corner brackets (`<i>` decorations, top-left/top-right), a left sticky column
(eyebrow number + "Частые вопросы" heading + intro paragraph) and a right column with
a 7-item FAQ accordion. All copy is in `data.ts` (`FAQ_ITEMS`), verbatim from
`faqData` in dc-script.js — matches the 7 questions/answers rendered in
`reference/rendered/13-faq.html`. Every inline style value (colors, sizes, radii,
fonts, spacing, `clamp()` expressions) was copied 1:1 into `styles.module.css` class
rules.

## Interactive behaviour re-implemented

- **Accordion, single-open.** `dc-script.js`: `state.faqOpen` (initial `0`), toggle
  `s => ({ faqOpen: s.faqOpen === i ? -1 : i })` — clicking the open question's button
  closes it (`-1`), clicking any other opens it and implicitly closes the previous one
  (only one index is ever tracked). Ported 1:1 as `useState<number>(0)` +
  `setOpenIndex(prev => prev === i ? -1 : i)` in `index.tsx`. The answer `<p>` is
  conditionally rendered only for the open item, matching the `sc-if value="{{ q.open }}"`
  in the raw template (no DOM node at all when closed, not just hidden).
- **Plus → x glyph rotation.** `rot: this.state.faqOpen === i ? 'rotate(45deg)' : 'rotate(0deg)'`
  ported as a conditional CSS class (`.iconWrapOpen` sets `transform: rotate(45deg)`;
  the base `.iconWrap` already carries the `.25s` transition and `rotate(0deg)`), so the
  open/close animation matches the reference.
- **Todo badge.** `sc-if value="{{ q.todo }}"` — item 6 ("Как оплатить?") has an empty
  answer and a non-empty `todo` field (`'todo: payment_methods_answer'`); the badge only
  renders when both the item has a `todo` string AND the page-level `showTodoMarkers`
  prop is truthy (`reference/props.json` default `true`, hardcoded as
  `SHOW_TODO_MARKERS` in `data.ts` since no control for it lives inside the FAQ section
  itself — see "Needs from merger").
- **Responsive grid columns** (presentational, not a user interaction, but derived from
  `dc-script.js`'s `gfit(300, 2)` viewport-width formula in `renderVals()`, ~line 328-329):
  reproduced as a CSS `@media (max-width: 652px)` breakpoint collapsing
  `repeat(2, minmax(0,1fr))` to one column, since 652px is the width below which
  `Math.floor(inner / 300) < 2` given that formula's `pad`/`inner` computation. At the
  1440px capture width used for acceptance this has no visible effect (reference and my
  render both show 2 columns).

## tsc

`pnpm exec tsc --noEmit` (from `apps/homepage/port`) — clean, no errors.

## Measured diffPct

Harness: `cd apps/homepage/port && nohup pnpm exec vite --port 5213 > .logs/faq.log 2>&1 &`
(PID 14984), confirmed `VITE v6.4.3 ready in 99 ms` in `.logs/faq.log`, then:

```
$ node scripts/shot.mjs --url "http://localhost:5213/?section=faq" --selector '[data-section="faq"]' --out shots/out/faq.png
{"ok":true,"url":"http://localhost:5213/?section=faq","selector":"[data-section=\"faq\"]","out":"shots/out/faq.png"}

$ node scripts/diff.mjs reference/shots/faq.png shots/out/faq.png
{"diffPct":3.6062,"w":1440,"h":562,"note":"size mismatch: reference/shots/faq.png 1278x561 vs shots/out/faq.png 1440x562, padded to 1440x562"}
```

**diffPct = 3.6062** (target ≤ 2 — over target). Vite process killed after measuring
(`kill 14984`, confirmed gone via `ps -p`).

## What still differs and why

Visually comparing `reference/shots/faq.png` and `shots/out/faq.png` side by side (both
read directly): headline, body copy, spacing, accordion row layout, borders and the
plus-icon all match exactly at every point the two images share. Two causes account for
the whole delta, both outside this folder's control and both already reported by earlier
section agents for the same reference-capture artifacts (see `hero`, `payments`,
`social-proof`, `frame` NOTES.md):

1. **Reference screenshot width (1278px) vs mine (1440px).** `reference/shots/faq.png`
   is 1278px wide even though `scripts/shot.mjs` always sets a 1440px viewport and the
   section itself is full-bleed with no `max-width`. 1278 = 1280 − 2×1px, matching the
   page-wide bordered wrapper (`max-width:1280px` + 1px side borders) visible in
   `apps/homepage/index.html` around all sections but not captured in this section's own
   `reference/rendered/13-faq.html` (which only holds the `<section>` outerHTML). My
   render has no such ancestor wrapper (none exists inside `src/sections/faq/**`, and
   none is meant to per contract §3 item 1 — that's `App.tsx`, merger-owned), so it
   renders full 1440px wide and `diff.mjs` pads the narrower reference image rather than
   failing outright.
2. **An admin/design-tool overlay panel baked into the reference screenshot, not part of
   the FAQ section's own DOM.** `reference/shots/faq.png` shows a small floating panel
   (three toggle switches, faint `warm`/`price` labels, a `?v=` text fragment) at the
   bottom-left, overlapping the left column below the intro paragraph. This DOM node is
   absent from `reference/rendered/13-faq.html` and from `shots/out/faq.png` — it is the
   same page-wide audience/block-visibility control panel (`audienceBtns` +
   `blockRows` in `dc-script.js`) that `payments`, `social-proof`, `operations` and
   `frame` independently reported bleeding into their own reference screenshots, i.e. an
   artifact of how the reference asset was captured, not a layout bug in this component.

Both causes sit outside `src/sections/faq/**` per contract §3 item 1 and cannot be fixed
inside this folder. Per §3 item 6 ("Report the number you measured, even if it is
worse"), 3.6062 is reported as the acceptance figure below.

## Needs from merger

- Wrap sections in the page-wide `max-width:1280px` (with the two 1px side borders)
  container described above when assembling `App.tsx`. This is the larger of the two
  causes of this section's inflated standalone diffPct; per the pattern already observed
  by `hero`/`payments`/`social-proof`, it should shrink materially once `faq` is
  re-measured inside the assembled page (§4's own target is ≤3 at full-page scale).
- `EYEBROW_NUMBER` ("11" in `data.ts`) is one value out of the page-wide `order`/`num`
  counter in `dc-script.js` (`renderVals()`, ~line 319-322: `order.forEach(([k, on]) =>
  { if (on) { ni++; num[k] = ... } })`), counting only the currently-visible optional
  blocks. It was ported as the static literal from the rendered reference DOM per
  contract §3 item 3, not as a live computation — if the merger restores the shared
  `show*` flags as page-wide state (contract §4), the eyebrow numbers across every
  numbered section (including this one) will need to be recomputed from that shared
  counter rather than hardcoded per section.
- `SHOW_TODO_MARKERS` (`data.ts`) mirrors the page-level `showTodoMarkers` prop
  (`reference/props.json`, default `true`). No control for it exists inside the FAQ
  section itself in `dc-script.js` — if the merger wires up a shared props/admin state
  object, this constant should read from it instead of being hardcoded.
- Otherwise: none — the accordion, all copy, and the todo-badge logic are fully
  self-contained inside `src/sections/faq/**`.
