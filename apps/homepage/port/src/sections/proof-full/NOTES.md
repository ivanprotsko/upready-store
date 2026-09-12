# proof-full — port notes

## What was ported

Source of truth: `reference/rendered/04-proof-full.html` (7 956 raw bytes). Structure:

- root `<section id="proof-full" data-screen-label="Почему это про вас">`, `position: relative`,
  top border, `clamp(48px,6vw,76px) clamp(20px,4vw,56px)` padding.
- two decorative `<i>` corner ticks (top-left / top-right), identical 13×13px two-line-gradient
  mark shared with `social-proof`/`proof-short`.
- kicker row: 5×5px dot + `"{{ nProof }} · риск"`, then an `<h2>` heading "Это уже не гипотеза".
- a two-column `grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))` below it:
  - left column (`max-width:620px`): one lead paragraph (15px, `#27272A`) + two body paragraphs
    (13.5px, `#52525B`) + a mono source note (11.5px, `#A1A1AA`).
  - right column, two stacked `<figure>`s:
    1. a mock document card — header row (file icon + "оферта №98 · ред. 07.07.2026" + right-
       aligned "форс-мажор" tag) over a body of four grey filler bars (96%/88%/92%/61% width)
       with a highlighted clause block ("9.4" + orange-tinted callout text) inserted between the
       2nd and 3rd bar, and a footer disclaimer ("макет фрагмента · перед публикацией подставить
       скан документа"); a caption below the card.
    2. an inline `<svg viewBox="0 0 560 200">` bar chart (a wide bar showing 100% losses, with a
       thin dark segment for the 2.2% actually recovered and a lighter segment for the claimed
       10–15% ceiling, two labelled callouts and a source line); a caption below it.

All copy (paragraphs, source note, document-card text, chart text/labels, both figure captions)
is verbatim in `data.ts`, taken from `reference/rendered/04-proof-full.html` (`props.json` has no
keys for this section — none of its content is prop-driven). Every inline style value from the
rendered DOM (`rgb(...)` colors converted to the equivalent hex, sizes, radii, gaps, the
`clamp()` padding/heading size, the two-layer gradient corner marks, the four line widths) was
carried into `styles.module.css`/`data.ts` unchanged — the four `docLine` widths differ per line
so they stay as per-item inline `style.width` values (same pattern `social-proof`'s per-logo
`maxHeight` uses), everything else is a fixed CSS-module class. The SVG's structural attributes
(`x`/`y`/`width`/`height`/`fill`/`stroke`/paths/viewBox) are kept as literal JSX in `index.tsx` —
only its rendered text content moved into `data.ts`'s `chart` object, matching how `data.ts` in
this port separates "copy" from "structure".

No `/images/<file>` references exist in this section — every visual is either a decorative `<i>`
mark, plain divs standing in for redacted document lines, or an inline SVG. Nothing to route
through the images symlink.

`{{ nProof }}` (rendered as `"03"`) is NOT this section's own counter: `dc-script.js` computes it
at lines 319-322 as the position of the `'proof'` block among all currently-ON top-level page
blocks (`order.forEach(([k,on]) => { if (on) { ni++; num[k]=... } })`) — page-wide numbering
bookkeeping the section does not own. Ported as the static string `"03"` it renders to by default,
verbatim from `reference/rendered/04-proof-full.html` (see "Needs from merger").

## Interactive behaviour

None. Grepped `reference/dc-script.js` for anything touching this section's own content
(`proof`, `showProofFull`, `nProof`) — the only hits are:
- `b.proof` / `blocks.proof` — a design-tool block-visibility toggle (`blockRows`, lines 330-334)
  that lives in an admin/editor panel outside this section, defaulting to `false` in
  `this.state.blocks`. It decides whether the *whole section* is mounted at page level, which is
  App-level concern per §3 item 1 ("own only this folder") and the brief §4 ("merger … restores
  shared flags (`show*`) as one piece of state in `App.tsx`") — not something this component
  renders or reacts to internally.
- `showProofFull: a === 'cold' && b.proof` (line 339) — same story: gates whether the section
  exists in the DOM at all, computed from the shared `audience` + `blocks` state, not from
  anything local to `proof-full`.
- `nProof` (line 429) — the page-wide numbering value discussed above.

Nothing inside the section's own rendered DOM (`reference/rendered/04-proof-full.html`) has an
`onClick`/rail/accordion/toggle — it is a fully static content block (text + a static mock
document + a static SVG chart), so the component has no local React state.

## Measured diff

Toolchain: `pnpm exec tsc --noEmit` → clean, no output.

Ran (per §3.6, port 5204):

```
cd apps/homepage/port && nohup pnpm exec vite --port 5204 > .logs/proof-full.log 2>&1 &   # PID 43031, waited for "ready in" line
node scripts/shot.mjs --url "http://localhost:5204/?section=proof-full" \
  --selector '[data-section="proof-full"]' --out shots/out/proof-full.png
node scripts/diff.mjs reference/shots/proof-full.png shots/out/proof-full.png
kill 43031   # confirmed dead (lsof -nP -iTCP:5204 -sTCP:LISTEN empty afterwards)
```

`diff.mjs` printed exactly:

```json
{"diffPct":3.2914,"w":1440,"h":891,"note":"size mismatch: reference/shots/proof-full.png 1278x861 vs shots/out/proof-full.png 1440x891, padded to 1440x891"}
```

`3.2914 > 2` → target missed by measurement, reported as-is (§3.6: "Report the number you
measured, even if it is worse").

## What still differs and why

Visually compared `shots/out/proof-full.png` against `reference/shots/proof-full.png` side by
side (both read as images). The ported content — heading, kicker, both paragraph blocks, the
document-card mock (header, four filler bars, orange clause callout, footer disclaimer, caption)
and the SVG bar chart (bar segments, both callouts, source line, caption) — matches the reference
pixel-for-pixel in layout, type, and color at every point that is actually page content. Two
causes outside this section's own folder/DOM account for the whole `diffPct`:

1. **Shared 1280px page wrapper (same root cause `social-proof`/`proof-short` documented).** The
   legacy page wraps every section in a `max-width:1280px` centered container with a 1px border
   on each side (`apps/homepage/index.html` line 79), one level above each section's own
   `<section>` root. `reference/shots/proof-full.png` is 1278px wide because of it; this isolated
   harness renders the section at the full 1440px viewport, which is correct for an unwrapped
   element and inflates both the raw pixel diff and the padded-canvas comparison `diff.mjs` does
   when the two images are different sizes.
2. **The same design-tool editor-chrome overlay `social-proof`'s NOTES.md flagged.** Reading
   `reference/shots/proof-full.png` shows the identical artifact: five toggle switches and the
   text "warm" / "price" / "TP ?V=" bleeding in from the left edge over the lower-left corner of
   the section, on top of the third paragraph and the source note. Nothing in
   `reference/rendered/04-proof-full.html` produces this markup — it matches the shape of the DC
   editor's own audience (`cold/warm/price`) and block-visibility (`b.proof`/`b.frame`/
   `b.included`/`b.pricing`/`b.faq`) controls from `dc-script.js` lines 330-334, i.e. it is the
   design tool's own chrome caught in-frame during capture, not page content. Since it has no
   corresponding node in the rendered-DOM source of truth I was told to port (§3 item 3), I did
   not attempt to reproduce it.

With cause (1) alone the number would likely sit close to the `proof-short`/`social-proof`
precedent (roughly 1.8–2.4%); cause (2) adds a further chunk on top of that (the overlay covers a
visible, non-trivial area of the reference shot) and is the reference asset's own artifact, not
something this section's component can or should compensate for from inside its own folder.

## Needs from merger

- Same as `social-proof`/`proof-short`: wrap the assembled sections in `App.tsx` in the shared
  `max-width: 1280px; margin: 0 auto; background: #fff; border-left/right: 1px solid #E4E4E7`
  container from `apps/homepage/index.html` line 79, then re-measure this section's diff at that
  width.
- Same flag as `social-proof`'s NOTES.md raised, now confirmed on a second reference shot: whoever
  owns `reference/shots/*.png` should check whether the capture script leaves the DC editor's own
  audience/block-visibility control panel in frame — `proof-full.png` carries the same overlay
  (toggle switches + "warm"/"price" text) bleeding in from the left edge as `social-proof.png`
  did, at a different vertical offset (bottom-left here vs. full-height there), which reads like a
  panel whose position tracks scroll/section height rather than a fixed one-off artifact. Worth a
  re-capture once the shell wrapper lands, so the merger's diff isn't scored against it.
- `{{ nProof }}` → `"03"` is page-wide numbering (see "What was ported" above); ported as the
  static default. If the merger recomputes `show*`/numbering as one piece of shared `App.tsx`
  state per the brief §4, this section would need `kickerNumber` passed in as a prop instead of
  the hardcoded `data.ts` default — flagging it here since I cannot make that change from inside
  this folder.
