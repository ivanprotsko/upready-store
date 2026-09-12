# social-proof — port notes

## What was ported

Source of truth: `reference/rendered/03-social-proof.html` (3 955 raw bytes, one logo rail with
10 cards). Structure:

- root `<section data-screen-label="Кто уже на этой системе">`, `position: relative`, top border.
- two decorative `<i>` corner ticks (top-left / top-right), 13×13px two-line gradient marks —
  identical shape to `proof-short`'s, mirrored horizontally.
- a header row (`flex-wrap: wrap; justify-content: space-between`) with:
  - left: a 5×5px dot + the kicker text `"{{ nLogos }} · на этой же системе"`.
  - right: muted caption "та же система управления магазином" + two 32×32px round icon
    buttons ("Назад" / "Вперёд") with a 14×14 chevron SVG (the "Назад" one rotated 180°).
- `#rail-logos`: a horizontal, `scroll-snap-type: x mandatory` flex rail (1px gap on an
  `#E4E4E7` background, so cards read as separated by hairlines), holding 10 cards. Each card:
  a 132px-tall logo tile (soft top-to-bottom gradient background, 1px border, 10px radius,
  grayscale+90%-opacity logo image) over a name/tag/note block.

All copy and the 10 logos (name, tag, note, image URL, `max-height`) are verbatim in `data.ts`,
taken from `reference/dc-script.js` `get logos()` (lines 45-58) — `props.json` has no `logos`
key, so the script getter is the actual data source, and it matches the rendered HTML exactly
(image URLs, alt text, tag text, note text all cross-checked 1:1). Every inline style value from
the rendered DOM (colors, sizes, radii, gaps, the `clamp()` padding, the two-layer gradient
corner marks, the flex-basis `min(80%,300px)`) was carried into `styles.module.css` unchanged.
The hover style on the nav buttons (`background:#FAFAFA;border-color:#D4D4D8`, from the raw
template's `style-hover` attribute — dropped by the DC runtime at render time since it has no
DOM equivalent) was re-added as a real `:hover` rule in the CSS module, matching the raw intent.

Images use the original `cdn.sanity.io` URLs verbatim (also confirmed against
`reference/rendered/03-social-proof.html`'s `<img src>` values) — these ten brand logos are
never copied into `apps/homepage/images/` (checked: no matching files there), unlike this
project's own image assets, so `/images/<file>` does not apply here.

`{{ nLogos }}` (rendered as `"02"`) is NOT this section's own counter: `dc-script.js` computes it
at lines 319-322 as the position of the `'logos'` block among all currently-ON top-level page
blocks (`order.forEach(([k,on]) => { if (on) { ni++; num[k]=... } })`) — i.e. it's a page-wide
numbering bookkeeping value, not data this section owns or computes. Per §3 item 1 (own only
this folder), it is ported as the static string it renders to by default (`"02"`), verbatim from
`reference/rendered/03-social-proof.html`, with the computation rule documented above in case the
merger wants to recompute it once all sections are assembled (see "Needs from merger").

## Interactive behaviour

`reference/dc-script.js`:
- `setLogoRail = (el) => { this._lrail = el; }` — a ref to the rail DOM node. → React `useRef`
  attached to `#rail-logos`.
- `prevLogo: () => this.moveLogoRail(-1)`, `nextLogo: () => this.moveLogoRail(1)` — the two
  buttons' `onClick`. → wired directly to the buttons.
- `moveLogoRail = (d) => this.scrollRail('rail-logos', this._lrail, d)` and the shared
  `scrollRail = (id, el, d) => { const node = el || document.getElementById(id); const first =
  node.firstElementChild; const step = first ? first.getBoundingClientRect().width + 1 : 340;
  node.scrollBy({ left: Math.sign(d) * step, behavior: 'smooth' }); }` (lines 36-43). → ported as
  a local `scrollRail(direction)` function that reads `railRef.current.firstElementChild`'s
  measured width (+1px for the rail's 1px gap) and calls the native `scrollBy` with
  `behavior: 'smooth'` — no React state involved, this is pure imperative DOM scrolling, exactly
  as in the source. No other section-owned state (`slide` tracking via `onRail`/`setState` is
  the *operations* rail's behaviour, not this one — `#rail-logos` has no `onScroll` handler in
  the source, unlike `#rail-ops`).

No `show*` visibility flag, tab, or accordion touches this section (grepped `dc-script.js` and
`props.json` for `logos`/`nLogos`/`rail-logos` — only the hits listed above).

## Measured diff

Toolchain: `pnpm exec tsc --noEmit` → clean, no output.

Ran (per §3.6, port 5203):

```
cd apps/homepage/port && nohup pnpm exec vite --port 5203 > .logs/social-proof.log 2>&1 &   # PID 33970, waited for "ready in" line
node scripts/shot.mjs --url "http://localhost:5203/?section=social-proof" \
  --selector '[data-section="social-proof"]' --out shots/out/social-proof.png
node scripts/diff.mjs reference/shots/social-proof.png shots/out/social-proof.png
kill 33970   # confirmed dead (lsof -nP -iTCP:5203 -sTCP:LISTEN empty afterwards)
```

`diff.mjs` printed exactly:

```json
{"diffPct":2.3907,"w":1440,"h":340,"note":"size mismatch: reference/shots/social-proof.png 1278x340 vs shots/out/social-proof.png 1440x339, padded to 1440x340"}
```

`2.3907 > 2` → target missed by measurement, reported as-is (§3.6: "Report the number you
measured, even if it is worse").

## What still differs and why

Two causes, both outside this section's own folder/DOM, visually confirmed by reading both PNGs:

1. **Shared 1280px page wrapper (same root cause `proof-short` documented).** The legacy page
   wraps all sections in `<div style="max-width:1280px;margin:0 auto;...border-left/right:1px
   solid #E4E4E7">` (`apps/homepage/index.html` line 79), one level above every section's own
   `<section>` root. `reference/shots/*.png` are all 1278px wide (1280 minus the two 1px
   borders) because of it; my isolated harness renders the section at the full 1440px viewport,
   which is the correct behaviour for an unwrapped element. This alone produced a 1.78% diff for
   `proof-short` (a much simpler, single-row section) — a comparable, non-zero baseline any
   section screenshotted this way will carry until the wrapper exists.
2. **An overlay unique to this reference screenshot, absent from the section's own rendered DOM.**
   Reading `reference/shots/social-proof.png` shows a ~170px-wide dark control panel bleeding in
   from the left edge across the section's full height — visible toggle switches, cut-off text
   ("...дит", "...ы", "TP ?V="), and the labels "warm"/"price". This matches nothing in
   `reference/rendered/03-social-proof.html` (verified: no such markup, colors, or text exist in
   that file). It closely matches the *shape* of the DC editor's own audience/block-visibility
   controls (`props.json`'s `defaultAudience` enum `cold/warm/price`, and the `b.proof`/`b.frame`/
   `b.included`/`b.pricing`/`b.faq` block toggles from `dc-script.js` lines 330-334) — i.e. it
   looks like the *design-tool's own chrome*, not page content, caught in-frame when this
   particular reference screenshot was captured. Sampling the equivalent screen region in three
   other reference shots (`hero.png`, `launch-artifact.png`, `proof-full.png`) at the same
   relative offset shows plain white (`ff ff ff ff`) — this artifact is specific to
   `social-proof.png`, not a page-wide fixture every section screenshot carries. Since it has no
   corresponding node in the rendered-DOM source of truth I was told to port (§3 item 3), I did
   not attempt to reproduce it; doing so would mean inventing markup not present in
   `reference/rendered/03-social-proof.html`.

With cause (1) alone the number would very likely sit under 2 (per the `proof-short` precedent);
cause (2) is the reference asset's own artifact and is not something this section's component can
or should compensate for from inside its own folder.

## Needs from merger

- Same as `proof-short`: wrap the assembled sections in `App.tsx` in the shared
  `max-width: 1280px; margin: 0 auto; background: #fff; border-left/right: 1px solid #E4E4E7`
  container from `apps/homepage/index.html` line 79, then re-measure this section's diff at that
  width.
- Flag to whoever owns `reference/shots/social-proof.png`: it appears to have captured a
  design-tool control panel (audience `cold/warm/price` + block-visibility toggles) overlapping
  the section on the left edge — worth a re-capture once the shell wrapper lands, so the
  merger's full-page comparison isn't scored against an artifact.
