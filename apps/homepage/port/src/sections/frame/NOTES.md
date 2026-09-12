# frame (NN=06, «Рамка») — port notes

## What was ported

1:1 port of `reference/rendered/06-frame.html` into `index.tsx` +
`styles.module.css` + `data.ts`:

- Corner brackets (two `<i>` decorations, absolutely positioned).
- Two-column grid (`repeat(auto-fit, minmax(330px,1fr))`): left column is
  eyebrow + heading + two paragraphs + a two-item dash list; right column is
  a bordered card holding an inline SVG diagram, plus a figcaption below it.
- The SVG diagram (viewBox 560×250) is reproduced element-for-element
  (3 circles, 2 multi-segment paths, 1 line, 5 rects, 12 text nodes) with the
  exact coordinates, colors, font sizes and `stroke-dasharray` values from
  the rendered markup. Geometry stays inline in `index.tsx`; every text
  string the diagram draws is a named export in `data.ts`.
- All copy (heading, two paragraphs, two bullets, figcaption, all SVG text)
  is verbatim in `data.ts`.

## Behaviour from dc-script.js

None owned by this section. Grepped `reference/dc-script.js` for the
section's own copy and for `frame` as a key: the only two hits are

- `state.blocks.frame` — the on/off switch for this section's own
  visibility, toggled by the admin panel (`blockRows` in dc-script.js:330-334)
  and read as the `showFrame` render flag (`showFrame: b.frame`, line 339).
  That's cross-section visibility state that belongs to `App.tsx` (the
  merger owns `show*` flags per the brief §4), not to this component.
- `num.frame` — a sequence number computed at render time from which of
  the five optional blocks (proof/frame/included/pricing/faq) are currently
  toggled on (dc-script.js:319-322: `order.forEach(([k, on]) => { if (on) {
  ni++; num[k] = ...} })`). This is what produces the `{{ nFrame }}` → "04"
  in the eyebrow. It is a cross-section computed value, not state local to
  this section, so this component has no state of its own — the eyebrow
  number is a static copy of what `reference/rendered/06-frame.html` shows
  (captured with all five blocks toggled on, see `scripts/capture-reference.mjs`
  pass 1). See "Needs from merger" below.

No other interactivity (no tabs, no rail, no accordion) touches this
section.

## Measured diffPct

Official acceptance command (brief §3 item 6, default width 1440, section
rendered standalone via `?section=frame`):

```
node scripts/shot.mjs --url "http://localhost:5206/?section=frame" --selector '[data-section="frame"]' --out shots/out/frame.png
node scripts/diff.mjs reference/shots/frame.png shots/out/frame.png
```

```json
{"diffPct":6.1982,"w":1440,"h":622,"note":"size mismatch: reference/shots/frame.png 1278x622 vs shots/out/frame.png 1440x534, padded to 1440x622"}
```

`pnpm exec tsc --noEmit` — clean, no output, exit 0.

## What still differs, and why

The 6.1982% and the size mismatch are **not** a fidelity bug in this
component — they come from a structural gap in the per-section test
harness, verified as follows:

- `reference/shots/frame.png` is 1278px wide, not 1440. Every other
  captured reference (checked `proof-short.png`, `social-proof.png`, both
  1278px) is the same width, because `apps/homepage/index.html` line 79
  wraps **every** `<section>` in `<div style="max-width:1280px;margin:0
  auto;background:#fff;border-left:1px solid #E4E4E7;border-right:1px
  solid #E4E4E7">` — a shared shell container outside any individual
  section, owned by `App.tsx` per the brief (§3 item 1: "Own ONLY
  `src/sections/<slug>/**`"). `?section=frame` in this harness renders the
  component directly under `#root` with no such wrapper, so at the
  official 1440px viewport the section stretches edge-to-edge instead of
  being capped at 1278px content width.
- This section's CSS uses `clamp(…, Nvw, …)` for padding/gaps/font-sizes,
  and `vw` resolves against the true browser viewport (1440px here), not
  the containing block. Inside the real page the section's rendered width
  is 1278px but its `clamp()` values still resolve off the 1440px
  viewport (e.g. padding `clamp(20px,4vw,56px)` → 4vw of 1440 = 57.6,
  clamped to **56px**). Missing the outer wrapper changes nothing about
  those `vw` values, but the resulting layout (555px-wide columns → 3-line
  heading, 622px total height) only appears when the section is actually
  constrained to 1278px by a parent — which is exactly what's missing in
  isolation.
- Verified directly: I started a page against the running reference server
  (`localhost:4790`, same admin-panel toggle sequence
  `scripts/capture-reference.mjs` uses) and measured the live section's
  grid column rects, heading rect and computed padding at viewport 1440.
  Then, in my own dev server, I injected the exact same wrapper div around
  `#root` (viewport still 1440, no other change) and re-measured. Every
  number matched exactly: column x/width `137 / 555` in both, heading rect
  `137 / 555 / 138.5625` in both, computed padding `76px 56px` in both,
  section height `621.47px` vs the reference's `621.47px`. Screenshotting
  my wrapped section and diffing it against `reference/shots/frame.png`
  gives **diffPct 0.5235** (the residual is the admin debug panel's toggle
  switches bleeding into the bottom-left corner of the frozen reference
  capture — visible in `reference/shots/frame.png` itself, not part of the
  actual page design). This confirms the component's markup, styles and
  computed layout are pixel-accurate; the 6.1982% is entirely an artifact
  of testing a section that depends on an ancestor's width outside a
  harness that doesn't provide that ancestor.
- (The temporary scripts and screenshots used for this verification were
  written under `port/scripts/` and `port/shots/out/` to reuse the
  existing puppeteer setup, and were deleted again before finishing —
  nothing outside this section's folder was left changed.)

## Needs from merger

- Wrap all sections in the shared shell container from
  `apps/homepage/index.html` line 79 (`max-width:1280px;margin:0
  auto;background:#fff;border-left:1px solid #E4E4E7;border-right:1px
  solid #E4E4E7`) inside `App.tsx`. Every section's `clamp(…vw…)` values
  depend on the true viewport width, so this only affects overall content
  width/centering, not the `vw` math — but without it any section (not
  just this one) will render edge-to-edge instead of capped at 1280px,
  which is a real visual difference in the full assembled page and the
  root cause of this section's inflated standalone diffPct.
- Wire up the real `nFrame` sequence number instead of the static "04"
  this component ships. It depends on the shared `blocks` state
  (`{ proof, frame, included, pricing, faq }`) that the merger already
  owns per the brief (§4: "restores shared flags (`show*`) as one piece of
  state in `App.tsx`"): `nFrame = String(1 + ['plans','logos','proof','frame']
  .filter(k => k === 'plans' || k === 'logos' || blocks[k]).length).padStart(2,'0')`
  is the general form of `reference/dc-script.js:319-322`'s `order`/`num`
  computation restricted to the four blocks that precede `frame`. The
  cleanest wiring is to lift that whole `num` computation into `App.tsx`
  (it already needs `blocks` state for `showFrame`/`showIncluded`/etc.) and
  pass `nFrame` down as a prop, since this section owns no state of its
  own to compute it locally without duplicating the admin-panel state.
- Also wire up `showFrame` (`= blocks.frame`, default `false` per the
  initial state in `reference/dc-script.js:2`) to conditionally render this
  section at all — this component always renders when mounted; the
  merger's job per §4 is to gate that.
