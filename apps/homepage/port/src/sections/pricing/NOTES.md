# pricing (NN=09) — port notes

## What was ported

Source of truth: `reference/rendered/09-pricing.html` (the RENDERED DOM), cross-checked against
`reference/raw/09-pricing.html` and `reference/dc-script.js` (the `extra` array, lines 391-396,
and the block-numbering logic, lines 319-322) plus `reference/props.json` (`showTodoMarkers`
default `true`).

Structure ported 1:1 into `styles.module.css` classes with the same values (colors, sizes, radii,
fonts, spacing, `clamp()` expressions):

- Section shell: `border-top`, top corner ticks (`.corner`/`.cornerLeft`/`.cornerRight`), same
  as the pattern already used by sibling sections (e.g. `operations`).
- Header block: kicker dot + "07 · цены" line, `<h2>Цены</h2>`.
- Three-column grid (`grid-template-columns: repeat(3, minmax(0, 1fr))`, `gap: 1px`,
  `background: #E4E4E7`) with three white cards:
  1. "гарантия" — two paragraphs (guarantee text + disclaimer note).
  2. "оплачивается отдельно" — a 4-item list, three of the four items carrying an orange
     `todo:` badge (verbatim text from `dc-script.js`'s `extra` array).
  3. "нужно от вас" — a static 3-item list, no badges.
- Footer strip: "Дальше — поддержка и развитие магазина от" + a `todo: retainer_monthly` badge
  (this text is literal in both raw and rendered HTML, not `{{ }}`-templated — not a props key).

All copy lives in `data.ts`, verbatim. Images: none in this section.

## Interactive behaviours re-implemented

None. Unlike `operations` (rail scroll) or the tariff/FAQ sections, `dc-script.js` has no
click/tab/toggle handler that targets `sec-pricing` — the section is static markup driven by
`props.json` (`showTodoMarkers`) and the `extra` array. Consequently this component holds no
`useState`.

Two pieces of content are computed page-side rather than being this section's own data, and were
ported as static verbatim values (both documented the same way `operations`/NOTES.md documents its
own `nOps`):

- **`kickerNumber` ("07")**: `{{ nPricing }}` resolves from `dc-script.js`'s `order`/`num` logic
  (lines 319-322), which numbers ONLY the currently-visible optional blocks across all 12
  sections (`proof`, `frame`, `included`, `pricing`, `faq` toggles). Computing this correctly
  requires knowing the admin `blocks` state of sections outside this folder — out of scope per
  contract §3 item 1. Ported as the literal value the reference render shows.
- **`showTodoMarkers` (badges shown)**: a page-level prop (`props.json` default `true`, no local
  toggle inside this section) — rendered statically to match the reference; not exposed as state
  since there is nothing inside this section that flips it.

## Measured diff

```json
{"diffPct":2.5701,"w":1440,"h":543,"note":"size mismatch: reference/shots/pricing.png 1278x543 vs shots/out/pricing.png 1440x543, padded to 1440x543"}
```

tsc: `pnpm exec tsc --noEmit` — clean, no errors.

Vite process (PID 86667) was started on port 5209, used for the shot above, then killed;
confirmed not running (`ps -p 86667` returned no rows).

## What still differs, and why

`diffPct` is 2.5701%, above the ≤2% target. Two causes, both outside this section's own markup —
neither is a defect in the ported component itself:

1. **Width mismatch (systemic, affects every section).** The legacy page wraps ALL sections in
   `<div style="max-width:1280px;margin:0 auto;...border-left:1px solid #E4E4E7;border-right:1px
   solid #E4E4E7">` (`apps/homepage/index.html` line 79) — a page-shell wrapper owned by the
   merger (`App.tsx`), not by any individual `<section>`. Every file in `reference/shots/*.png` is
   1278px wide (1280 minus the two 1px borders) because of this; this isolated harness renders the
   section at the full 1440px viewport with no such cap, so the grid's three columns are wider than
   in the reference and content shifts (the `clamp()`-based paddings and the `repeat(3,
   minmax(0,1fr))` grid columns are viewport-relative). This exact cause, and the same fix, was
   already documented independently by the `operations`, `hero`, `launch-artifact`, `proof-short`,
   `shell` and `social-proof` section agents (see their `NOTES.md`) — it is confirmed systemic, not
   specific to pricing.
2. **Reference-fixture contamination (systemic, affects every section screenshot).** Visually
   inspecting `reference/shots/pricing.png` shows a floating fixed-position debug/admin panel
   (toggle switches, an audience selector reading "warm  price", a "TP ?V=" text fragment)
   overlapping the bottom-left corner of the section, cutting across card 1's guarantee text. The
   same overlay, in the same screen position, is visible in `reference/shots/operations.png` too —
   confirming it is baked into every reference screenshot at capture time (likely an admin/dev
   overlay from the legacy page left open during `split-reference.mjs`'s capture run), not
   something specific to the pricing markup. It contributes real pixel diff wherever it overlaps
   this section's own (correct) content, and cannot be fixed by changing this component — the fix
   is re-capturing `reference/shots/*.png` without that overlay present.

No other differences were found on visual inspection (typography, colors, spacing, badge styling,
and copy all match the reference at the columns that do align).

Given contract §3 item 6 ("Report the number you measured, even if it is worse"), the measured
2.5701% is reported as-is. Status is `partial` per the task's own definition (renders correctly,
diffPct > 2, no interactive behaviour is missing).

## Needs from merger

- Wrap sections in the `max-width:1280px` container (with the two 1px side borders), matching
  `apps/homepage/index.html` line 79, when assembling `App.tsx` — this should shrink the systemic
  width-mismatch diff for `pricing` (and every other section) once re-measured at full-page scale
  (§4's own target is `diffPct` ≤ 3, so this section may already clear that bar once wrapped).
- Consider re-running `scripts/split-reference.mjs` to regenerate `reference/shots/*.png` without
  the floating debug/admin overlay described above — it affects every section's reference
  screenshot, not just `pricing`, so it is a one-time fixture fix rather than a per-section one.
- If live cross-section numbering (`{{ nPricing }}`) is wanted instead of the static `"07"` shipped
  here, the merger/`App.tsx` would need to compute each visible optional section's ordinal from the
  shared `blocks` state and pass it down as a prop — this section has no visibility into sibling
  sections' state on its own.
- No shared state, anchors, or other cross-section wiring is otherwise needed from `pricing` —
  it is a static, self-contained section.
