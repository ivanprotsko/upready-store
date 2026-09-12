# delivery — port notes

## What was ported

Source: `reference/rendered/11-delivery.html` (the rendered DOM, per §3 item 3), cross-checked
against `reference/raw/11-delivery.html` for the `{{ }}` expressions and against
`reference/dc-script.js` for the values those expressions resolve to.

- Section header: kicker dot + `{{ nDelivery }} · доставка`, `<h2>` heading "Доставка подключена",
  the intro paragraph, and the nav row (`11 служб` label + two arrow buttons).
- The `#rail-delivery` horizontal card rail: 11 cards. Each card shows either a brand logo image
  (`d.hasLogo`) or a two-path outline SVG icon (`d.noLogo`), then the service name and its "kind"
  line. Both branches of the `<sc-if>` in the raw template are ported as a single ternary on
  whether `item.logo` is set — matches the rendered output exactly (verified item-by-item against
  `reference/rendered/11-delivery.html` lines 22-141).
- The two corner tick marks (`<i>` elements), identical pattern to `payments`/`operations`.
- All inline styles from the rendered HTML became CSS-module classes in `styles.module.css` with
  the exact same values (colors as hex equivalents of the rendered `rgb()`, sizes, radii, fonts,
  spacing, `clamp()` expressions, gradients). One layout note: the rendered HTML puts
  `margin-left:auto` only on the "Назад" (back) button, which pushes that button and the adjacent
  "Вперёд" (forward) button together to the row's right edge — ported as `.navButton:first-of-type
  { margin-left: auto }` rather than on the shared `.navButton` class, to avoid splitting the extra
  space between both buttons.
- Text: kicker number/text, heading, intro paragraph, service-count label, and all 11 items'
  name/kind copied verbatim into `data.ts` from the rendered HTML, cross-checked against
  `dc-script.js` `get deliveryData()` (lines 198-224) — the two sources match exactly, including
  the SVG `d1`/`d2` path data for the five logo-less items (Озон Доставка, ПЭК, Деловые Линии,
  СберЛогистика, Самовывоз).
- `nDelivery` = `"09"`: like `nOps`/`nLogos` in sibling sections, this number is page-level
  numbering computed in `dc-script.js` (`order.forEach(...)`, lines 319-322) over which top-level
  blocks are switched on — not something this isolated section computes on its own (§3 item 1
  keeps sections isolated). The rendered HTML already gives the ground-truth value for the default
  flag state ("09"), so it is hardcoded in `data.ts` with a comment, same convention as `operations`
  and `social-proof`.
- Images: the six logo images (`cdek.png`, `pochta-rossii.svg`, `yandex-delivery.png`, `5post.svg`,
  `dostavista.svg`, `dpd-trim.svg`) all exist under `apps/homepage/images/logos/` (symlinked as
  `port/public/images`), so they are referenced as `/images/logos/<file>` per §3 item 3.

## Interactive behaviour re-implemented as React state

Ported from `reference/dc-script.js`:

- `setDelRail` (line 35) → a `useRef<HTMLUListElement>` attached to `#rail-delivery` instead of the
  instance field `this._drail`.
- `prevDel`/`nextDel` (lines 417-418, `this.scrollRail('rail-delivery', this._drail, -209 / 209)`)
  → a local `scrollRail(direction: 1 | -1)` function in `index.tsx` mirroring `scrollRail` (lines
  36-41): it reads the rail's first child's rendered width (+1px gap) as the scroll step and calls
  `node.scrollBy({ left: direction * step, behavior: 'smooth' })`. The original passes `-209`/`209`
  into `Math.sign(d)` — only the sign is ever used, the actual distance always comes from the
  rendered card width — same pattern already ported in `operations`' `scrollRail`.
- No slide-index label exists for this section in the rendered markup (unlike `operations`'
  "слайд N / 5"), so no slide-tracking state was needed — the rail scroll is a pure side effect via
  ref, matching the original (`this._drail` mutation causes no re-render either).
- The button `style-hover` attribute in the raw template (`background:#FAFAFA;border-color:#D4D4D8`)
  → a plain `:hover` rule on `.navButton` in the CSS module, same convention as `operations`.

No `window` globals, no `support.js`, no DOM queries outside the component — state and refs only.

## Measured diff

```
pnpm exec tsc --noEmit   → clean, no output
```

Harness: `cd apps/homepage/port && nohup pnpm exec vite --port 5211 > .logs/delivery.log 2>&1 &`
(PID 12943, confirmed "ready in 115 ms" in the log), then:

```
node scripts/shot.mjs --url "http://localhost:5211/?section=delivery" \
  --selector '[data-section="delivery"]' --out shots/out/delivery.png
node scripts/diff.mjs reference/shots/delivery.png shots/out/delivery.png
```

```json
{"diffPct":0.3634,"w":1440,"h":506,"note":"size mismatch: reference/shots/delivery.png 1278x506 vs shots/out/delivery.png 1440x506, padded to 1440x506"}
```

Vite process (PID 12943) was killed after measuring; confirmed not running (`ps -p 12943` empty).

## What still differs, and why

0.3634% is well under the ≤2% target. The residual diff is the same systemic width mismatch every
other section agent has reported (`operations`/`payments`/`social-proof` NOTES.md): the legacy page
wraps sections in a `max-width:1280px` container with two 1px side borders
(`apps/homepage/index.html` line 79), so `reference/shots/delivery.png` is 1278px wide while this
isolated harness renders the section at the full 1440px viewport. `diff.mjs` pads the narrower
reference and counts the extra ~162px-wide strip as diff. This section's own content (heading,
kicker, intro, nav buttons, rail cards, logos/icons, names, kind lines) is otherwise faithful to
the reference at every position checked.

## Needs from merger

- Wrap sections in the `max-width:1280px` container (with the two 1px side borders) described above
  when assembling `App.tsx`, matching `apps/homepage/index.html` line 79 — same request already
  logged by `operations`/`payments`/`social-proof`.
- No shared state or cross-section wiring needed from `delivery` itself beyond that: it has no
  incoming/outgoing nav anchor pointing at `sec-delivery` from `dc-script.js`'s own anchor list, and
  no `show*` visibility flag gates it (`order` always includes `['delivery', true]`).
