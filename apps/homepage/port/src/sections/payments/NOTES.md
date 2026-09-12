# payments (NN=10) — port notes

## What was ported

Source: `reference/rendered/10-payments.html` (DOM as rendered by `support.js`), text and data
cross-checked against `reference/dc-script.js` (`payGroups`, `payMore` literals, ~line 289–410) since
the accordion items are closed by default and their body text (`m.lines`) is not present in the
rendered/raw HTML at all — it only exists in the script's data literal.

Root `<section data-section="payments" data-testid="sec-payments" id="sec-payments">` with:

- Two 13×13px corner brackets (`<i>` decorators, `.cornerTL` / `.cornerTR`).
- Eyebrow row: 5×5 dot + `"08 · оплата"` (mono, uppercase). The `08` is `nPayments` computed
  dynamically in `dc-script.js` from the `order`/`num` block-counter logic (§0's `{{ nPayments }}`);
  since `defaultAudience`/`showTodoMarkers`/`accentColor` are the only props this page actually
  supplies (checked `reference/props.json` — no `payments`/`payGroups`/`payMore`/`num` keys there,
  it's all computed client-side), I took the number verbatim from the RENDERED DOM (`08`, per
  contract §3 item 3: "port the rendered DOM") rather than re-deriving the counter logic, since that
  counter spans every other section's visibility flags and is explicitly out of this folder's scope.
- H2 "Покупатель платит так,<br/>как привык", intro paragraph — verbatim in `data.ts`.
- 3-column `payGroups` grid (каждый день / в один клик / частями), each a card with a mono tag,
  a wrapping row of brand chips (each an `<img>` logo at the exact per-brand width from the
  `dc-script.js` literal — `pay-split.svg`/`pay-mokka.svg` use 42px/45px, everything else 44px,
  height fixed 18px) and a note paragraph. All group/brand/note text and every logo filename come
  from the `payGroups` literal in `dc-script.js`, image paths rewritten from `images/logos/...svg`
  (the harness convention, `/images/<file>`) — no brand in this section's list has `hasLogo: false`,
  so the raw template's `sc-if br.noLogo` (plain-text fallback chip) branch never renders in this
  section and was not ported (nothing to port: rendered DOM has zero such chips).
- 5-item `payMore` accordion (border box, each row `border-bottom`), each row a full-width button
  (number + title + a 16×16 "+" made of two absolutely-positioned bars) and, when open, a panel of
  paragraph lines. Numbers/titles/line text taken from the `dc-script.js` array literal (identical
  Russian text, `n` = `String(k+1).padStart(2,'0')`).

## Interactive behaviour re-implemented

- `payMoreOpen` (`dc-script.js` line 2 state, default `-1`) → local `useState<number>(-1)` named
  `openIndex`. Clicking a row's button toggles it: same index closes it (`-1`), any other index opens
  it and implicitly closes whatever was open (only one row's content mounted at a time, matching
  `toggle: () => this.setState(s => ({ payMoreOpen: s.payMoreOpen === k ? -1 : k }))`).
  The `+` icon rotates 45° → an "×" via `transform: rotate(45deg)` when its row is open, `rotate(0deg)`
  otherwise (`m.rot` in the source).
  All 5 rows render closed by default, matching the rendered reference HTML (no panel present for
  any of the 5 `<button>` blocks in `reference/rendered/10-payments.html`).
- Button hover (`style-hover="background:#FAFAFA"` in the raw template) → `.accordionButton:hover`
  in the CSS module, since inline `style` has no native hover state.
- `payStop`/`payTgChange`/`payTry`/`payPlan`/`closePay` and everything else in `dc-script.js`'s
  return object belongs to the pricing-plan modal / Telegram capture flow — none of it touches
  `sec-payments`'s own DOM (checked the raw/rendered HTML: no `data-dc-tpl` node in this section
  reads `payTg*`, `payPlan`, or `payOpen`). Not re-implemented here; out of scope for this folder.

## tsc

`pnpm exec tsc --noEmit` (repo default project, run from `apps/homepage/port`) — clean, no output.

## Measured diff

Harness: `cd apps/homepage/port && nohup pnpm exec vite --port 5210 > .logs/payments.log 2>&1 &`
(PID 90839, confirmed `ready in 104 ms` in the log), then:

```
node scripts/shot.mjs --url "http://localhost:5210/?section=payments" --selector '[data-section="payments"]' --out shots/out/payments.png
node scripts/diff.mjs reference/shots/payments.png shots/out/payments.png
```

```json
{"diffPct":2.5935,"w":1440,"h":884,"note":"size mismatch: reference/shots/payments.png 1278x883 vs shots/out/payments.png 1440x884, padded to 1440x884"}
```

Vite process killed after measuring (`kill 90839`; confirmed gone via `ps -p 90839`).

**diffPct = 2.5935** (target ≤ 2 — over target).

## What still differs and why

Diffed the two PNGs manually beyond `diff.mjs`'s own number: cropped both to the shared 1278×883
region and re-ran pixelmatch directly (bypassing `diff.mjs`'s zero-cost white-padding of the extra
162px strip, which happens to *lower* the reported percentage) — the real content-region diff is
~2.76%. Two causes, both already documented by earlier section agents (`hero`, `social-proof`,
`operations` NOTES.md) and both outside `src/sections/payments/**`:

1. **Missing `max-width:1280px` wrapper (the dominant cause).** The legacy page wraps every section
   in `<div style="max-width:1280px;margin:0 auto;...border-left/right:1px solid #E4E4E7">`
   (`apps/homepage/index.html` line 79) — merger-owned (`App.tsx`/shell), not any individual
   `<section>`. This harness renders `payments` unwrapped at the full 1440px viewport, so the
   `repeat(3,minmax(0,1fr))` grid computes wider columns than in the reference (which is laid out
   inside the 1278px-wide wrapper), shifting every column boundary and each brand chip's absolute
   position rightward past the corresponding reference pixel from the second grid column onward.
   Text content, wrapping, colors and typography are otherwise identical at every element checked.
2. **An overlay contaminating the reference screenshot, unrelated to this section.** `reference/shots/payments.png`
   shows a small floating dev/audience-picker panel (three toggle switches, faint `warm`/`price`
   labels, a `?v=` text fragment) at the bottom-left, overlapping the top of the accordion rows —
   this DOM does not exist anywhere in `reference/rendered/10-payments.html`; it is absent from
   `shots/out/payments.png`. Same contamination class `social-proof` and `operations` reported for
   their own reference shots.

Both causes are outside this folder per contract §3 item 1 and cannot be fixed here.
Per §3 item 6 ("Report the number you measured, even if it is worse"), 2.5935 (`diff.mjs`'s own
number) is reported as the acceptance figure.

## Needs from merger

- Wrap sections in the `max-width:1280px` container (with the two 1px side borders) described above
  when assembling `App.tsx` — matching `apps/homepage/index.html` line 79. This is the dominant cause
  of `payments`' diff and, per the pattern already observed by `hero`/`operations`/`social-proof`,
  should shrink materially once `payments` is re-measured inside the assembled page (§4's own target
  is ≤3 at full-page scale).
- `nPayments` ("08" in the eyebrow) is one value out of the page-wide `order`/`num` counter in
  `dc-script.js` (`order = [['plans',true], ['logos',true], ['proof',b.proof], ...]`, counting only
  the currently-visible optional blocks). It was ported as the static literal from the rendered
  reference DOM per contract §3 item 3, not as a live computation — if the merger restores the
  shared `show*` flags as page-wide state (contract §4), the eyebrow numbers across every numbered
  section (including this one) will need to be recomputed from that shared counter rather than
  hardcoded per section. Flagging so numbering stays consistent if any `show*` flag differs from its
  `props.json` default in the assembled page.
- No shared state/anchors otherwise: this section has no incoming nav anchor beyond its own
  `id="sec-payments"` (already set) and no `show*` visibility flag of its own (`order` always turns
  it on: `['payments', true]`).
