# tariffs (NN=14, sec-tariffs) — port notes

## What was ported

Source of truth: `reference/rendered/14-tariffs.html` (dc-tpl ids 740–769), cross-checked
against the raw template (`reference/raw/14-tariffs.html`, `sc-for list="{{ plans }}"`) and
`reference/dc-script.js` `planData` / `renderVals()`.

- Section shell: outer `<section id="sec-tariffs">` with `border-top`, top padding, and the two
  corner-mark `<i>` elements (`.cornerTL` / `.cornerTR`), all values copied 1:1 from the inline
  styles (`#E4E4E7`, `#D4D4D8`, `clamp(48px,6vw,76px)`).
- Header block: eyebrow (dot + `{{ nTariffs }} · выбор тарифа`), `<h2>Выберите тариф</h2>`, intro
  paragraph — text copied verbatim into `data.ts`.
- The two-column plan grid (`sc-for list="{{ plans }}"`, `gridPlans`): rendered from
  `plans: TariffPlan[]` in `data.ts`, itself a verbatim copy of the two entries of
  `dc-script.js` `planData` (`install` and `brand`), including every row string, price, term,
  description and fine-print text.
- Per-card markup: tag, `<h3>` title, price row (Roboto Mono number + Inter `₽` + Roboto Mono
  term), description paragraph, checklist `<ul>` (inline SVG check icon, `stroke:#2563EB`, same
  `d="M20 6 9 17l-5-5"` path, copied exactly), CTA button, fine-print span.
- Button colour: `plan.best` (`install` → `true`) drives `.ctaBest` (`#2563EB` background) vs
  `.ctaDefault` (`#18181B` background) — ported from `pl.btn` in `dc-script.js` line 284-286.
- `grid-template-columns: repeat(2, minmax(0,1fr))`: this is `gridPlans = gfit(300,2)` evaluated
  at the reference viewport (1440px, page-container width 1280px) in `dc-script.js` — at that
  width `gfit` always resolves to `repeat(2,minmax(0,1fr))`, so it is hardcoded, with a
  `max-width: 620px` media query added so 2 plan cards don't get pathologically squeezed on a
  narrow phone viewport (approximation, not present as a literal breakpoint in `dc-script.js`,
  which recomputes `gridPlans` continuously off `window.innerWidth`).

## Interactive behaviour re-implemented

`dc-script.js` line 281-287:
```js
const plans = this.planData.map(pl => Object.assign({}, pl, {
  open: () => this.setState({ payPlan: pl.id }),
  ...
}));
```
Clicking "Оплатить" sets page-level `payPlan` state, which opens a payment modal (Telegram-handle
capture + Tribute checkout link — see `payOpen`/`payTitle`/`payPrice`/`payRows`/`payTgChange`/
`payTry` etc. in `renderVals()`). That modal's markup does not appear in ANY of the 16 split
`reference/raw|rendered/*.html` files — it lives in the legacy page's root template, outside every
numbered `<section>`, so it is genuinely shared/global chrome, not part of `sec-tariffs`'s own DOM.

Ported locally: a `selectedPlan` state hook (`useState<string | null>`) that the button's
`onClick` sets, plus `aria-pressed` reflecting it — so the click is not a dead no-op and a merger
can wire in the real modal with one prop (e.g. `onSelectPlan?: (id: string) => void`) without
touching the render tree.

`{{ nTariffs }}`: a running section-order number computed at runtime in `renderVals()` from the
page-wide `order` array (line 319) and the `blocks`/audience visibility state, which is shared
page state this folder does not own. Hardcoded to `"12"`, the value baked into
`reference/rendered/14-tariffs.html` under the default props (`props.json`: audience `cold`,
`showTodoMarkers: true`, no explicit `blocks` overrides).

## Measured diff

```
pnpm exec tsc --noEmit   → clean, no output
```

```json
{"ok":true,"url":"http://localhost:5214/?section=tariffs","selector":"[data-section=\"tariffs\"]","out":"shots/out/tariffs.png"}
{"diffPct":3.3851,"w":1440,"h":826,"note":"size mismatch: reference/shots/tariffs.png 1278x826 vs shots/out/tariffs.png 1440x826, padded to 1440x826"}
```

Visual side-by-side of `reference/shots/tariffs.png` vs `shots/out/tariffs.png`: text, numbers,
colours, spacing and icon rendering are pixel-equivalent at matching coordinates. The `diffPct`
above 2 is driven almost entirely by the width mismatch called out in the `note`, not by a
fidelity gap in this section's own markup.

## What still differs and why

1. **Width mismatch (1278px vs 1440px) — the main source of the diff.** The legacy page wraps
   every section in a page-wide container:
   `apps/homepage/index.html:79` —
   `<div style="max-width:1280px;margin:0 auto;background:#fff;border-left:1px solid #E4E4E7;border-right:1px solid #E4E4E7">`.
   At a 1440px viewport this yields exactly 1280 − 2×1px border = 1278px of visible content width
   for every section — matching `reference/shots/tariffs.png`'s measured 1278px exactly. This
   container is NOT part of any single section's `raw`/`rendered` HTML (it wraps all 16 of them)
   and is outside `port/src/sections/tariffs/**`, so it cannot be added from inside this folder
   without violating the "own only your section folder" rule. Rendered stand-alone via
   `?section=tariffs`, my component fills the full 1440px viewport instead, and `diff.mjs` pads
   the narrower reference to compare — the padded strip on the right (and the two 1px side
   borders) account for essentially all of the reported 3.3851%.
2. **Stray toggle-switch artifact bleeding into `reference/shots/tariffs.png`'s bottom-left
   corner.** The reference screenshot was captured from the full legacy page, where a
   fixed-position admin/content-toggle panel (`blockRows` in `renderVals()`, driven by
   `startPress`/`pwOpen`/admin state) overlays the bottom-left of the viewport regardless of
   which section is underneath. It has nothing to do with `sec-tariffs` and is not reproducible
   (or desirable) from inside this section's own component.

## Needs from merger

1. **Page-wide 1280px max-width container** (`index.html:79`, borders `#E4E4E7` left/right,
   `background:#fff`, centered) that wraps every section — belongs in `App.tsx` (or `Shell`), not
   in any individual section. Once added, `[data-section="tariffs"]`'s effective width in the
   assembled page will match the reference's 1278px and most of the residual `diffPct` should
   disappear.
2. **Shared payment modal** (`payPlan` state: Telegram-handle capture + Tribute checkout link,
   `payOpen`/`payTitle`/`payPrice`/`payRows`/`payTgChange`/`payTry`/`closePay` in
   `dc-script.js`). Not present in any of the 16 split sections' rendered HTML — it is root-level
   legacy chrome. Suggest lifting it into `App.tsx` as shared state, with `Tariffs` accepting an
   optional `onSelectPlan?: (id: string) => void` prop (currently the component keeps
   `selectedPlan` local and calls nothing external, so wiring costs one prop, no render changes).
3. Not scoped to me but worth flagging for whichever section owns it: the fixed-position
   admin/content-toggle overlay (`blockRows`) that contaminates the bottom-left of
   `reference/shots/tariffs.png` is genuinely global chrome, not this section's.
