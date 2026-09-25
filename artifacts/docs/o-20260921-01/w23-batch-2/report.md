# W23 batch 2 — checkout in one centered column, max 736 px (t-2026-09-25-19)

Branch `fix/olavka-batch-2`, base `origin/dev` 42e910fa.

## What changed

1. `apps/storefront/src/app/[locale]/(checkout)/checkout/page.tsx:44`
   `lg:content-container flex flex-col lg:grid lg:grid-cols-[7fr_5fr] min-h-screen`
   →
   ```
   <div className="lg:content-container min-h-screen lg:min-h-0">
     <div className="flex flex-col lg:mx-auto lg:max-w-checkout">
       <CheckoutForm cart={cart} customer={customer} />
       <CheckoutSummary cart={cart} />
     </div>
   </div>
   ```
   Two nested divs, not one — see "Fix-up" below for why. The outer keeps `lg:content-container`
   (the page's normal side padding + centering + 1440 px cap, the fallback for a hypothetical width
   where 736 doesn't fit) and `min-h-screen`/`lg:min-h-0` (mobile keeps the full-height wrapper;
   desktop drops it — it existed only to stretch both grid columns to viewport height so their
   backgrounds lined up, which doesn't apply once there is one column). The inner div drops the grid
   (`lg:grid lg:grid-cols-[7fr_5fr]`) and stays `flex flex-col` at every width — form then summary,
   same DOM order as mobile — and adds `lg:mx-auto lg:max-w-checkout` to center and cap it at 736 px
   with **no padding of its own**, so 736 px is the box that the form/summary content actually fills,
   not a box that still has padding subtracted from it.

2. `tailwind.config.js` `theme.extend.maxWidth` gains `checkout: "736px"` (used as `max-w-checkout`,
   not a bare arbitrary value). PR #161 (`fix/olavka-batch-1`) also edits this file (`grid-3` token);
   my only change here is the one new key, so a merge conflict there is one line.

3. `checkout-form/index.tsx`: root div `px-4 py-6 lg:pe-10 lg:py-10 lg:ps-0 gap-y-6` →
   `px-4 py-6 lg:px-0 lg:py-10 gap-y-6`. `lg:pe-10 lg:ps-0` (the 7fr/5fr gutter against the old summary
   column) is gone; `lg:px-0` cancels the mobile `px-4` on desktop so the form's own content (cards,
   dividers) reaches the 736 px inner box's edges instead of sitting 16 px inset from it. `lg:py-10`
   (vertical desktop padding, unrelated to the column width) stays.

4. `checkout-summary/index.tsx`: root div was
   `flex flex-col gap-y-8 px-4 py-4 lg:py-10 lg:ps-10  bg-ui-bg-subtle lg:-me-[9999px] lg:pe-[9999px]`
   → `flex flex-col gap-y-8 px-4 py-4 lg:px-0 lg:py-10 bg-ui-bg-subtle lg:bg-transparent`. Classes
   dropped on desktop only (mobile keeps them, unchanged pixel for pixel — see byte-identical 390
   PNGs below):
   - `lg:-me-[9999px] lg:pe-[9999px]` — the full-bleed trick that stretched the summary's background
     past its 5fr grid column to the browser's right edge. Meaningless with no grid; left in it would
     have blown the column out to the right of the 736 px box.
   - `lg:ps-10` — the left half of the 7fr/5fr gutter, same reasoning as the form's old `lg:pe-10`.
   - Added `lg:px-0` for the same reason as the form (content flush to the 736 px box, not inset by
     16 px), and `lg:bg-transparent` to cancel `bg-ui-bg-subtle` from `lg` up, so the desktop column
     reads as one flow instead of a highlighted side panel (rule 4 of the brief). `bg-ui-bg-subtle`
     itself stays in the class list for mobile.

### Fix-up: 736 px has to be the visible content, not the padded wrapper

First version of this diff (still visible in PR #162's first commit) put `lg:max-w-checkout` directly
on the single wrapper together with `lg:content-container`. Since `max-width` includes padding
(border-box) and `content-container` itself carries `lg:px-6`, and the form/summary kept their own
`px-4`, the **box** measured 736 px but the **visible content** — divider lines, delivery/payment
cards, the «Оформить заказа» button — measured 736 − 2×24 (content-container's `lg:px-6`) − 2×16
(the children's own `px-4`) = 656 px. Lead caught this on review (Ivan's «максимальная ширина 736»
meant what he sees, not an invisible wrapper) and asked for a re-measure keyed to the button and a
divider, not the wrapper div. Fixed by splitting "the box that gets the page's normal padding and
centers the whole thing" (outer, `lg:content-container`, unchanged width math) from "the box that
caps at 736 px with zero padding of its own" (new inner wrapper), and by zeroing the children's own
horizontal padding on desktop (`lg:px-0` on both `checkout-form` and `checkout-summary`). Re-measured
against `[data-testid="submit-order-button"]` and the `.h-px.bg-ui-border-base` divider directly (not
just the wrapper) — see the updated table below; both now read exactly 736 px with the same gaps as
before (352/272/144 at 1440/1280/1024), because the total left/right offset from the viewport edge to
the centered box is unchanged by moving padding from inside the box to margin outside it — only where
the visible content starts moved, by the padding that used to eat into it.

No changes to `(checkout)/layout.tsx` (header/footer) or to any `?step=` logic. Confirmed by reading
the live checkout components (`checkout-shipping-section`, `checkout-info-rows`,
`checkout-payment-section`, `checkout-pickup-point-sheet`) that this storefront's checkout is the
one-screen design AGENTS.md describes: `?step=` is read only by the unused upstream shim components
(`modules/checkout/components/{payment,review,shipping}`, confirmed nothing imports them) — the live
page renders the same content regardless of the `step` query value. `?step=address`,
`?step=delivery`, `?step=payment`, `?step=review` all return HTTP 200 and identical markup.

## Measurement table (`getBoundingClientRect` of `.overflow-x-hidden > div`, physical cart, light theme)

Script ran headless Chromium via Playwright against `next build` + `next start -p 8303`, once against
the original code (before) and once against this diff (after), same stand/cart.

| Width | Before: column w / left gap / right gap / summary below form | After: column w / left gap / right gap / summary below form |
|---|---|---|
| 1440 | 1440 / 0 / 0 / **no** (side by side) | **736 / 352 / 352** / yes |
| 1280 | 1280 / 0 / 0 / no | **736 / 272 / 272** / yes |
| 1024 | 1024 / 0 / 0 / no | **736 / 144 / 144** / yes |
| 768  | 768 / 0 / 0 / yes | 768 / 0 / 0 / yes (unchanged) |
| 390  | 390 / 0 / 0 / yes | 390 / 0 / 0 / yes (unchanged) |

At 1440 and 1280 the column is exactly 736 px, centered, gaps equal to the pixel. At 1024 (the `lg`
breakpoint itself) 736 still fits inside `content-container`'s padded width, so it caps there too,
centered. Below `lg` (768, 390) the wrapper's `lg:`-prefixed classes don't apply at all, so the column
is full width with each child's own `px-4` — byte-identical to before at those two widths, confirming
mobile is untouched.

Raw JSON: `/private/tmp/claude-502/-Users-ivanprotsko-upready-worktrees-upready-store-fix-olavka-batch-2/14f19bad-f1e0-4c0a-8324-7c765ec403e0/scratchpad/measurements.json`.

### Visible-content table (after the fix-up above)

Same method, but measuring the actual rendered content instead of the wrapper:
`[data-testid="submit-order-button"]` (the «Оформить заказ» button) and the first
`.h-px.bg-ui-border-base` divider (`checkout-info-rows`'s row separator), physical cart,
`?step=address`, light theme.

| Width | Button: width / left gap / right gap | Divider: width / left gap / right gap |
|---|---|---|
| 1440 | 736 / 352 / 352 | 736 / 352 / 352 |
| 1280 | 736 / 272 / 272 | 736 / 272 / 272 |
| 1024 | 736 / 144 / 144 | 736 / 144 / 144 |
| 768  | 736 / 16 / 16 (mobile `px-4`, unchanged — 768 − 2×16 = 736 is a coincidence of this width, not the `max-w-checkout` token) | same |
| 390  | 358 / 16 / 16 (mobile `px-4`, unchanged) | same |

Button and divider now match the wrapper measurement exactly at every width — the visible content
*is* the 736 px box, with nothing eating into it from either side. Raw JSON:
`/private/tmp/claude-502/-Users-ivanprotsko-upready-worktrees-upready-store-fix-olavka-batch-2/14f19bad-f1e0-4c0a-8324-7c765ec403e0/scratchpad/measurements-visible-content.json`.

The "before" side has no equivalent single-column number here: the original two-column layout puts
the button inside a 5fr grid column of a different, non-736-related width, so there is nothing
directly comparable to measure "before" — the point of this table is proving the *after* content
width, which is what the fix-up corrected.

## Screenshots

`artifacts/docs/o-20260921-01/w23-batch-2/`, `{before,after}-{physical,course}-{address,payment}-{1440,390}.png`
(16 files: 2 phases × 2 carts × 2 step params × 2 widths), plus two extra desktop shots proving sheets
don't break the column:

- `after-address-sheet-1440.png` — the address-edit sheet open over the after layout: sheet is a
  centered `fixed inset-0` overlay, page behind it still shows the single 736 px column.
- Verified in code (not just by screenshot) that every checkout sheet/modal
  (`checkout-modal/index.tsx`) is positioned `fixed inset-0` with its own `w-full sm:w-[540px]`
  (or `small:w-[880px]` when `wide`), entirely independent of the checkout content column's width —
  structurally unaffected by this change. The one pickup-point card seeded on this stand
  (`cherkashino`/`upready_store_w25_checkout`) turned out to be a single, non-merged shipping option
  (`isPickupShippingOption` false for it in this seed), so clicking it sets the method directly
  instead of opening `checkout-pickup-point-sheet` — a stand data quirk, not something this diff
  touches; the sheet component itself was still exercised via the address sheet above.

Physical cart (after-* screenshots and the visible-content table): `cart_01M3C5NJ0SZ6R7Y6AR1EJ880M6` —
the original physical cart (`cart_01M3C4G3QY56VDHPFHS2MW1330`, used for the `before-*` shots and the
first wrapper-measurement table) got its shipping method set to "pickup" as a side effect of an
earlier interactive Playwright probe into the pickup sheet during this same session, so it no longer
matches the `before` cart's default (nothing selected) state; re-created a clean cart instead of
reusing the polluted one. Confirmed the four `after-*-390.png` regenerated with the clean cart are
byte-identical (`cmp -s`) to the corresponding `before-*-390.png` — mobile is untouched by either this
diff or the fix-up. Course-only cart (unaffected by the pollution, reused as-is):
`cart_01M3C4G4A6718QPG4735XG2AWX` (`course-ochishchenie-pecheni`, digital delivery, no
address/shipping section — matches `isDigitalDeliveryCart`).

## Checks

```
cd apps/storefront
npx tsc --noEmit            # clean, 0 errors
npx next lint                # 0 errors; 2 pre-existing warnings (no-img-element in
                              # yandex-metrica and markdown-content, unrelated to this diff)
npm run test                  # Test Files  52 passed (52) / Tests  450 passed (450)
npx next build                # succeeds, /checkout 52.4 kB / 249 kB First Load JS
```

`node scripts/check-locale-catalogs.mjs` and the messages-catalog parity script were not run: this
diff adds no new UI string and touches no translation catalog.

Rule 27f: no destructive/outward-facing action was taken outside the task's own worktree, DB and
ports; nothing here needed a separate ok beyond the task brief itself.

## Stand notes

- `apps/backend/.env` / `apps/storefront/.env.local` copied from `redesign-olavka` per the brief,
  ports/DB swapped (9251→9291, 8233→8303, `upready_store_w15_n15`→`upready_store_w25_checkout`).
  Backend on 9291 via `nohup npx medusa develop` (not the broken restart script), storefront on 8303
  via `next build` + `next start` (a fresh build per phase, no long-lived dev server for the shots).
- DB `upready_store_w25_checkout`: rewrote `image.url` (550 rows) and `product.thumbnail` (36 rows)
  from `:9121` to `:9291`.
- `static/{o21-live,courses}` did not exist under `redesign-olavka/apps/backend/static` at task
  time (only `home-banners` was there) — not copied, so some product thumbnails on this stand show
  as empty placeholders in the screenshots. Doesn't affect column width/gap acceptance; no image was
  generated to work around it, per the brief.
- An early `pnpm install` picked up a PATH `pnpm@8.12.0` instead of the pinned 10.11.1 and rewrote
  `pnpm-lock.yaml` down to lockfile version 6 (AGENTS.md's documented pnpm-mismatch trap). Caught
  before running any check, reverted with `git checkout -- pnpm-lock.yaml`, reinstalled with
  `corepack pnpm install --frozen-lockfile`; the lockfile in this PR's diff is untouched
  (`git diff --stat -- pnpm-lock.yaml` is empty).
- All stand processes (backend PID tree, storefront PID tree) stopped at the end of the run; ports
  9291 and 8303 free (`lsof -i` empty for both).

## Spend

`node /Users/ivanprotsko/upready/memory/lead-upready-store/o-20260921-01/tools/worker-spend.mjs olavka-batch-2`
— $5.20 (65%) right after the first PR; the fix-up round (re-read the diff, rebuild/restart the stand
twice, re-measure, chase and fix a polluted cart, redo screenshots, update this report) pushed it to
$7.50 (93.75%), past the lead's $7.20 stop line. Stopping here: this commit, push and the done envelope
are the last actions this run takes.
