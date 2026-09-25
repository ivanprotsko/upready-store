# W23 batch 2 — checkout in one centered column, max 736 px (t-2026-09-25-19)

Branch `fix/olavka-batch-2`, base `origin/dev` 42e910fa.

## What changed

1. `apps/storefront/src/app/[locale]/(checkout)/checkout/page.tsx:44`
   `lg:content-container flex flex-col lg:grid lg:grid-cols-[7fr_5fr] min-h-screen`
   → `flex flex-col lg:content-container lg:max-w-checkout min-h-screen lg:min-h-0`.
   Drops the desktop grid (`lg:grid lg:grid-cols-[7fr_5fr]`), so the column stays `flex flex-col` at
   every width — the form then the summary, same DOM order as mobile. `lg:content-container` keeps
   the page's normal side padding and centering; `lg:max-w-checkout` caps the column at 736 px only
   from `lg` up. `min-h-screen` stays unprefixed (mobile, unchanged); `lg:min-h-0` resets it on
   desktop — it existed to stretch both columns to viewport height so their backgrounds lined up,
   which no longer applies to a single column.

2. `tailwind.config.js` `theme.extend.maxWidth` gains `checkout: "736px"` (used as `max-w-checkout`,
   not a bare arbitrary value). PR #161 (`fix/olavka-batch-1`) also edits this file (`grid-3` token);
   my only change here is the one new key, so a merge conflict there is one line.

3. `checkout-form/index.tsx`: `lg:pe-10 lg:ps-0` dropped from the root div (these existed to build the
   7fr/5fr gutter against the summary column; with no grid they'd just skew the form's own padding
   inside the 736 px box). `lg:py-10` (vertical desktop padding, unrelated to the two-column split)
   stays.

4. `checkout-summary/index.tsx`: root div was
   `flex flex-col gap-y-8 px-4 py-4 lg:py-10 lg:ps-10  bg-ui-bg-subtle lg:-me-[9999px] lg:pe-[9999px]`
   → `flex flex-col gap-y-8 px-4 py-4 lg:py-10 bg-ui-bg-subtle lg:bg-transparent`. Classes dropped on
   desktop only (mobile keeps them, unchanged pixel for pixel):
   - `lg:-me-[9999px] lg:pe-[9999px]` — the full-bleed trick that stretched the summary's background
     past its 5fr grid column to the browser's right edge. Meaningless with no grid; left in it would
     have blown the column out to the right of the 736 px box.
   - `lg:ps-10` — the left half of the 7fr/5fr gutter, same reasoning as the form's `lg:pe-10`.
   - Added `lg:bg-transparent` to cancel `bg-ui-bg-subtle` from `lg` up, so the desktop column reads
     as one flow instead of a highlighted side panel (rule 4 of the brief). `bg-ui-bg-subtle` itself
     stays in the class list for mobile.

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

Physical cart: `cart_01M3C4G3QY56VDHPFHS2MW1330` (`Свечи АСД с чесноком`, courier/pickup delivery).
Course-only cart: `cart_01M3C4G4A6718QPG4735XG2AWX` (`course-ochishchenie-pecheni`, digital delivery,
no address/shipping section — matches `isDigitalDeliveryCart`).

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
— tracked throughout, stayed under 55% of the 8 USD budget at the last check before this report.
