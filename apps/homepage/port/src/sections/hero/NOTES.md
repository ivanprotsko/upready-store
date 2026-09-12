# hero (NN=01) — port notes

## What was ported

Root `<section data-section="hero" data-testid="sec-hero">` (no legacy id — section
04 registry lists none for hero), 1:1 from `reference/rendered/01-hero.html`:

- Two-column flex row (`display:flex;flex-wrap:wrap;gap:clamp(28px,4vw,60px)`):
  left column with an `<h1>` + `<p>` (headline group), right column with a note
  `<p>` and the CTA `<a>` button + inline arrow SVG.
- Every inline style value on the rendered DOM (padding, gap, flex basis,
  font-size clamps, colors as `rgb(...)`, border-radius, box-shadow, the
  `transition: background .15s`) was copied verbatim into
  `styles.module.css` classes — nothing recomputed or approximated.
- Copy text (headline, paragraph, note, CTA label, SVG path data) copied
  verbatim into `data.ts`.

## Interactive behaviour re-implemented

The rendered/raw HTML diverge here: the raw template (`reference/raw/01-hero.html`)
has three `<sc-if>` branches (`isCold` / `isWarm` / `isPrice`) picking one of
three headline+paragraph variants, and an interpolated `{{ heroCta }}` label.
`reference/dc-script.js` (`renderVals()`, `resolveAudience()`, `persist()`,
`setAudience()`, ~lines 89–110 and 239–245) is the source of that logic:

- **Audience state** (`cold | warm | price`) is resolved once on mount:
  `?v=` or `?utm_content=` query param → else a `sessionStorage` value
  persisted for the last 30 minutes (`upready_v`, `{v, t}` JSON) → else the
  default (`cold`, matching `props.json` `defaultAudience.default`). Ported
  as `resolveAudience()` in `index.tsx`, run in a `useEffect` on mount and
  written back into `useState<Audience>`, wrapped in try/catch exactly like
  the original (private-mode / storage-disabled browsers just don't persist).
  Initial render (before the effect runs) shows the `cold` variant, mirroring
  the original's `state.audience === null` → default-variant first paint.
- **Headline/paragraph variant**: `heroVariants[audience]` in `data.ts`
  (`cold`/`warm`/`price`, each with its own `max-width` — 15ch for cold,
  16ch for warm/price, matching the three `<sc-if>` blocks exactly).
- **CTA label**: `heroCtaLabel(audience)` — `"Написать в телеграм"` for
  `price`, `"Поставить магазин"` otherwise (verbatim `heroCta` ternary from
  `renderVals()`). The `href` (`https://t.me/vladupready`) is static
  regardless of audience, matching the raw template.
- **CTA hover** (`style-hover="background:#3F3F46;color:#fff"` on the raw
  `<a>`): implemented as a plain CSS `:hover` rule on `.cta` — no state
  needed, hover is a pure style concern here.

Not re-implemented (out of scope for this section): `audienceBtns` built in
`renderVals()` (a cold/warm/price dev switcher) is never referenced by
`reference/raw/01-hero.html` or `reference/rendered/01-hero.html` — it must
be consumed by some other part of the page (admin panel?) not present in the
hero template, so it was left out. See "Needs from merger" below.

## Measured diff

tsc: `pnpm exec tsc --noEmit` — clean, no output.

Harness: started `pnpm exec vite --port 5201` in `port/`, confirmed the
`VITE v6.4.3 ready in 115 ms` line in `.logs/hero.log`, then:

```
$ node scripts/shot.mjs --url "http://localhost:5201/?section=hero" --selector '[data-section="hero"]' --out shots/out/hero.png
{"ok":true,"url":"http://localhost:5201/?section=hero","selector":"[data-section=\"hero\"]","out":"shots/out/hero.png"}

$ node scripts/diff.mjs reference/shots/hero.png shots/out/hero.png
{"diffPct":1.5539,"w":1440,"h":466,"note":"size mismatch: reference/shots/hero.png 1278x466 vs shots/out/hero.png 1440x466, padded to 1440x466"}
```

**diffPct = 1.5539** (≤ 2 target — pass).

Vite process killed after measuring (`kill 39350`, confirmed gone via `ps -p`).

## What still differs and why

- **Reference screenshot width (1278px) vs mine (1440px).** `reference/shots/hero.png`
  was captured 1278px wide even though the section itself is full-bleed and
  `props.json` declares `$preview.width: 1440`; my shot (taken the same way,
  `scripts/shot.mjs` default 1440px viewport, full-width selector box) is
  1440px. This is a property of how the reference asset was captured (likely
  `split-reference.mjs`'s own viewport/selector at generation time), not a
  layout bug in the ported component — the visible content (text position,
  size, wrapping) matches at every width both images share, and `diff.mjs`
  pads rather than fails on the mismatch. Not something fixable inside
  `src/sections/hero/**`.
- **Page background**: my screenshot shows the `body { background: #fafafa }`
  from `src/styles/base.css` (merger-owned, shared across all sections)
  behind the section, visible only in the letterboxed/mismatched-width area;
  the section's own background is transparent in both versions. Not a hero
  file.
- No other visual delta observed by eye between `reference/shots/hero.png`
  and `shots/out/hero.png` at the overlapping 1278×466 region.

## Needs from merger

- `audienceBtns` (`reference/dc-script.js` `renderVals()`, the
  cold/warm/price switcher with pill buttons `st: aBase + …`) is computed
  page-wide but not consumed anywhere in the hero raw/rendered HTML. If some
  other section (nav? an admin/debug panel?) renders it, that section's agent
  or the merger should confirm which slug owns it — hero deliberately does
  not render it since it isn't part of `reference/raw/01-hero.html` or
  `reference/rendered/01-hero.html`.
- Everything else needed by hero (audience resolution, sessionStorage
  persistence, headline variants, CTA label/hover) is self-contained inside
  `src/sections/hero/**` — no other shared state, prop, or file needed from
  the merger for this section to behave like the legacy page.
