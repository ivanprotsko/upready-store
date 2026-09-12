# included (NN=07, «Что входит», legacy id `sec-included`)

## What was ported

Source of truth used: `reference/rendered/07-included.html` (rendered DOM), cross-checked
against `reference/raw/07-included.html` (the `{{ }}`/`sc-if`/`sc-for` template) to recover the
structural roles the rendered output collapses, and `reference/dc-script.js` (lines ~381-390,
419-420, 33-42) for the copy array and the rail-nav behaviour.

- Section shell: two corner ticks (`<i>`), eyebrow row (`05 · состав`), title row
  (`Что вы получаете` + prev/next buttons), the horizontal rail (`#rail-included`), and the
  closing paragraph. All inline styles from the rendered HTML became CSS-module classes in
  `styles.module.css` with identical values (colors kept as the raw template's hex, which are
  the same colors the rendered HTML gives as `rgb()` — verified value-by-value).
- The rail holds 8 cards, one per `included[]` entry from `dc-script.js`. Each card's mock
  illustration (`f.isDomain`/`f.isCatalog`/…/`f.isSeo`) was ported as its own render function
  inside `index.tsx` (`DomainIllustration`, `CatalogIllustration`, `CartIllustration`,
  `PayIllustration`, `ShipIllustration`, `AccountIllustration`, `AdminIllustration`,
  `SeoIllustration`), each reading its fixed copy from a matching `*_CARD` constant in
  `data.ts`. The 9th template branch, `f.isStub`, is never reached (`isStub: false` is
  hard-coded for all 8 real items in `dc-script.js`) and was not ported — nothing in the
  rendered reference exercises it.
- All text (the 8 `t`/`n` pairs, every illustration's mock copy — url, product names, prices,
  statuses, addresses, etc.) is verbatim in `data.ts`, taken from `dc-script.js`'s `included`
  array plus the literal strings in the raw template's `sc-if` branches (props.json carries no
  `included` key — the copy is hard-coded in the page script, not templated).
- Images: `images/products/candle.png`, `diffuser.png`, `set.png` referenced as
  `/images/products/<file>.png` (contract item 3).
- `nIncluded` (rendered as `05`) is a computed, order-dependent index (`dc-script.js` lines
  315-322: it counts only the sections whose visibility flag is on, ahead of `included` in
  page order) — copied verbatim as the literal `05` seen in the rendered reference rather than
  recomputed, since recomputing it needs the sibling sections' visibility flags this folder
  does not own (see "Needs from merger").

## Interactive behaviour re-implemented

- **Rail prev/next buttons** (`dc-script.js` `prevInc`/`nextInc`/`scrollRail`/`setIncRail`,
  lines 33-42 and 419-420): re-implemented as a `useRailNav()` hook using a `useRef` on the
  rail `<div>`. Clicking a button scrolls the rail by the first card's rendered width + 1px
  (falls back to 340px if the ref isn't attached yet — same fallback the legacy code uses),
  with `behavior: 'smooth'`, matching the original's imperative `scrollBy` exactly. No
  `window` globals or DOM queries outside the component; the ref is local state.
- The rail itself already scrolls/snaps natively via `overflow-x:auto` +
  `scroll-snap-type:x mandatory` (ported as plain CSS, not JS-driven), matching the legacy
  markup — no extra behaviour needed there.
- No tabs/accordion/toggle state lives in this section — `included` has none in
  `dc-script.js`.

## Measured diff

```
{"diffPct":0.9426,"w":1440,"h":781,"note":"size mismatch: reference/shots/included.png 1278x781 vs shots/out/included.png 1440x781, padded to 1440x781"}
```

`pnpm exec tsc --noEmit` (repo `port` dir): clean, no errors.

## What still differs and why

- **Width**: the reference screenshot is 1278px wide, mine is 1440px (full viewport). The
  legacy page wraps every section in a page-level shell —
  `apps/homepage/index.html` line 79: `<div style="max-width:1280px;margin:0 auto;background:#fff;
  border-left:1px solid #E4E4E7;border-right:1px solid #E4E4E7">` — which is NOT part of any
  individual `<section>`; it belongs to the page/App shell (owned by the merger, contract §4),
  not to this folder. Rendered standalone via `?section=included` (no shell wrapper in
  `main.tsx`), my section fills the full 1440px viewport instead of sitting inside that
  1278px-wide bordered column. `diff.mjs` pads the narrower reference image to match and still
  measures only 0.94% difference (both images agree white against white in the padded margin),
  so this did not block the ≤2% target, but the true side-by-side look (with the shell's
  left/right borders) can only be judged after the merger wraps sections in that shell.
- Nothing else identified — every card illustration, the corner ticks, the eyebrow/title row,
  and the footer paragraph matched closely enough to land under 1% diff.

## Needs from merger

- Wrap all sections (this one included) in the page shell — `max-width:1280px; margin:0 auto;
  background:#fff; border-left:1px solid #E4E4E7; border-right:1px solid #E4E4E7` (from
  `apps/homepage/index.html` line 79) — inside `App.tsx`/`base.css`, per contract §4. This
  section was measured standalone without that shell (as instructed for the per-section
  acceptance), so its true fit inside the shell should be re-checked once the merger adds it.
- `nIncluded` ("05") is hard-coded here as the literal value observed in the reference
  render. If the merger's assembled page ever changes which earlier sections are visible
  (`showProof`/`showFrame`/etc. in `dc-script.js`'s `order` array), this section's eyebrow
  number will need to be recomputed from that shared state — this folder has no access to the
  sibling sections' visibility flags to do that itself.
