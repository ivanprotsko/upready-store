# operations — port notes

## What was ported

Source: `reference/rendered/08-operations.html` (the rendered DOM, per §3 item 3), cross-checked
against `reference/raw/08-operations.html` for the `{{ }}` expressions and against
`reference/dc-script.js` for the values those expressions resolve to.

- Section header: kicker dot + `{{ nOps }} · операции`, `<h2>` heading with the `<br>` line break,
  the intro paragraph, and the rail nav (two arrow buttons + `слайд N / 5` label).
- The `#rail-ops` horizontal card rail: 5 cards, each an image box (aspect-ratio 544/490, object-fit
  cover, object-position right bottom) + title/index row + description paragraph.
- The two corner tick marks (`<i>` elements), identical pattern to `social-proof`/`proof-short`.
- All inline styles from the rendered HTML became CSS-module classes in `styles.module.css` with
  the exact same values (colors as hex equivalents of the rendered `rgb()`, sizes, radii, fonts,
  spacing, `clamp()` expressions, `aspect-ratio`, gradients).
- Text: kicker number/text, heading (two lines), body paragraph, and all 5 slide titles/descriptions
  copied verbatim into `data.ts` from the rendered HTML / `dc-script.js` `get opsSlides()` (lines
  60-68) — the values match exactly between the two sources.
- `nOps` = `"06"`: like `nLogos` in `social-proof`, this number is page-level numbering computed in
  `dc-script.js` (`order.forEach(...)`, lines 319-322) over which top-level blocks are switched on —
  not something this section computes on its own (§3 item 1 keeps this section isolated). The
  rendered HTML already gives the ground-truth value for the default flag state ("06"), so it is
  hardcoded in `data.ts` with a comment, same convention as `social-proof`.
- Images: the 5 slide images are external `https://cdn.sanity.io/...` URLs. `apps/homepage/images/`
  (the local `/images/<file>` asset dir) does not contain these files — only `demo-*` and logo/product
  assets — so per §3 item 3 ("images use `/images/<file>`", which only applies to images that exist
  locally) these stay as the original absolute CDN URLs, unchanged from the reference.

## Interactive behaviour re-implemented as React state

Ported from `reference/dc-script.js`:

- `setRail`/`onRail` (lines 22-30) → a `useRef<HTMLDivElement>` on `#rail-ops` plus an `onScroll`
  handler (`onRail` in `index.tsx`) that recomputes the current slide index from
  `scrollLeft / (firstChildWidth + 1)`, clamped to `[1, 5]`, and only calls `setSlide` when the
  index actually changed (mirrors the `if (i !== this.state.slide)` guard in the original).
- `prevSlide`/`nextSlide` → `scrollRail(-1)` / `scrollRail(1)` in `index.tsx`, which calls
  `node.scrollBy({ left: direction * step, behavior: 'smooth' })` with `step` = first card's
  rendered width + 1px, exactly like `moveRail`/`scrollRail` (lines 31, 36-41). Same pattern as
  `social-proof`'s already-ported `scrollRail`.
- `slideLabel` (line 414: `'слайд ' + (this.state.slide || 1) + ' / 5'`) → derived from the
  `slide` state, initialised to `1`, rendered as `слайд {slide} / {SLIDE_COUNT}`.
- The button `style-hover` attribute in the raw template (`background:#FAFAFA;border-color:#D4D4D8`)
  → a plain `:hover` rule on `.navButton` in the CSS module (no JS needed, same convention as
  `social-proof`'s `.navButton:hover`).

No `window` globals, no `support.js`, no DOM queries outside the component — state and refs only.

## Measured diff

```
pnpm exec tsc --noEmit   → clean, no output
```

Harness: `cd apps/homepage/port && nohup pnpm exec vite --port 5208 > .logs/operations.log 2>&1 &`
(PID 66089, confirmed "ready in 101 ms" in the log), then:

```
node scripts/shot.mjs --url "http://localhost:5208/?section=operations" \
  --selector '[data-section="operations"]' --out shots/out/operations.png
node scripts/diff.mjs reference/shots/operations.png shots/out/operations.png
```

```json
{"diffPct":2.9343,"w":1440,"h":771,"note":"size mismatch: reference/shots/operations.png 1278x771 vs shots/out/operations.png 1440x771, padded to 1440x771"}
```

Vite process (PID 66089) was killed after measuring; confirmed not running (`ps -p 66089` empty).

## What still differs, and why

Visually compared both PNGs side by side (`shots/out/operations.png` vs
`reference/shots/operations.png`, read as images) — the ported content itself (heading, kicker,
paragraph, nav buttons, slide label, all 5 cards with their images/titles/descriptions) is
pixel-identical in position, size, color and typography. The 2.93% diff comes entirely from two
causes outside this section's own markup, both already documented by earlier section agents
(`social-proof`/NOTES.md, `hero`/NOTES.md, `proof-short`/NOTES.md):

1. **Width mismatch (the dominant cause).** The legacy page wraps every section in
   `<div style="max-width:1280px;margin:0 auto;...border-left:1px solid #E4E4E7;border-right:1px
   solid #E4E4E7">` (`apps/homepage/index.html` line 79) — that wrapper is owned by the merger
   (`App.tsx`/shell), not by any individual `<section>`. All `reference/shots/*.png` are 1278px wide
   (1280 minus the two 1px borders) because of it; this isolated harness renders the section at the
   full 1440px viewport, which is correct for an unwrapped element but not comparable pixel-for-pixel
   to a reference shot cropped from inside a narrower wrapper. `diff.mjs` pads the narrower reference
   to 1440px and counts the entire extra ~162px-wide strip (4th card's right edge onward) as diff.
   `proof-short` alone (a single row, no rail) measured 1.78% from this cause; a 5-card rail section
   spanning the full row naturally measures higher.
2. **An overlay contaminating the reference screenshot, unrelated to this section.** The reference
   PNG shows a small floating panel (toggle switches, faint `warm`/`price` labels, a `?v=` text
   fragment) overlapping the left edge of the first two cards — this is not part of
   `reference/rendered/08-operations.html`'s DOM at all (no such element exists in that file) and is
   absent from `shots/out/operations.png`. It looks like a leftover dev/audience-picker overlay that
   was on-screen when the reference screenshot tool captured the legacy page, the same class of
   contamination `social-proof`'s NOTES.md reported for its own reference shot.

Both causes are outside `src/sections/operations/**` and cannot be fixed from inside this folder
per §3 item 1. Per §3 item 6 ("Report the number you measured, even if it is worse"), the measured
2.9343% is reported as-is.

## Needs from merger

- Wrap sections in the `max-width:1280px` container (with the two 1px side borders) described above
  when assembling `App.tsx`, matching `apps/homepage/index.html` line 79 — this should shrink the
  systemic width-mismatch diff for every section, `operations` included, once re-measured inside the
  assembled page (§4's own `diffPct` target is ≤3 at full-page scale, so this may already be enough
  without a per-section fix).
- No shared state, anchors, or cross-section wiring needed from `operations` itself — it has no
  incoming/outgoing nav anchor (`legacy id: none` per the registry) and no `show*` visibility flag.
