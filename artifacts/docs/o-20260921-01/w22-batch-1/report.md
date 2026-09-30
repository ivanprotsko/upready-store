# W22 — olavka batch 1 (t-2026-09-25-18)

Branch `fix/olavka-batch-1`, base `origin/dev` 42e910fa. Five commits: A–D on t-2026-09-25-18,
E on t-2026-09-25-17 (a defect in the merged #160 script, found by an incident during this task —
see "Incident" below).

## A. Panel tables: one line per cell

`attribute-list.tsx` and `page-list.tsx`/`custom-page-row.tsx` (Ivan's two named screens) no
longer render a second line under a row's name/title. The removed text (options preview, section
hint, machine key, slug, URL, status detail, carrier, tariff hint, host-qualified path) is not
lost: it moves into a `title` attribute (native tooltip on hover) on the cell or its label.

Screenshots: `apps/tenant-panel/docs/evidence/t-2026-09-25-18/{attribute-list,page-list}/` —
1440 and 390, light theme, before and after. Before reproduces Ivan's exact screenshots
("Страна производства / Россия, Китай, Таиланд, Индия", "Контакты и реквизиты / Адрес,
телефон, часы работы, как вас найти."); after shows one line per row.

Other tables swept and fixed (same name+caption stacking pattern), file:line of the touched cell:
- `apps/tenant-panel/src/routes/courses/course-list/course-list.tsx:103` (title + slug)
- `apps/tenant-panel/src/routes/journal/article-list/article-list.tsx:231` (title + public URL)
- `apps/tenant-panel/src/routes/reviews/review-list/review-list.tsx:297` (product cell: title + source/language)
- `apps/tenant-panel/src/routes/reviews/review-list/review-list.tsx:328` (status cell: badge + hint)
- `apps/tenant-panel/src/routes/settings/marketplaces/analytics/components/cards-table.tsx` (six cells: card title, units, ABC, XYZ, stock, days-to-zero)
- `apps/tenant-panel/src/routes/settings/redirects/redirect-row.tsx:64` (from_path + host-qualified path)
- `apps/tenant-panel/src/routes/shipping/shipping-list/shipping-list.tsx` (name cell, price cell)
- `apps/tenant-panel/src/routes/shipping/shipping-zones/shipping-zones.tsx:263` (zone name + description)
- `apps/tenant-panel/src/routes/marketplace-orders/marketplace-orders.tsx:291` (status label + detail)
- `apps/tenant-panel/src/routes/marketplace-order-detail/marketplace-order-detail.tsx:161` (line-item product title: added truncate, no second line existed but it could wrap)

**Deliberately NOT touched, with reason:**
- `/settings/customer-login` — Ivan's own exception (0.1.2), not a table.
- `reviews/review-list/review-list.tsx`, the "Отзыв" column (rating line, title, body up to 5000
  characters, reply box) — this is the review's own content, not a name+caption duplicate.
  Forcing it to one line would make a review unreadable. Flagging this explicitly rather than
  silently skipping it, the same way Ivan named his own exception: if this should still collapse
  somehow, that is a design call for a follow-up task, not a mechanical fix.
- `settings/marketplaces/analytics/components/cards-table.tsx`'s and `shipping-list.tsx`'s
  secondary text was folded into `title` rather than deleted (unlike the two screens Ivan named
  explicitly) because it is either a meaningful warning (shipping's "Стоимость по умолчанию —
  укажите свою") or the only place some of the number is shown at all (cancelled units, offer
  lines, days to a stock-out date). Worth Ivan's eyes: `shipping-list.tsx`'s default-price warning
  is now hover-only, less visible than before.

No shared cell component existed for these hand-rolled tables (the tanstack-table-based lists —
products, orders, customers — already go through `DataTableRoot` + `TruncatedText`/`TextCell` and
were already one-line), so the rule was applied at each cell rather than centralized. Guard test:
`apps/tenant-panel/src/__tests__/table-cells-one-line.test.mjs`, one assertion per touched
screen — source-based (this package has no vitest/jsdom, see `error-boundary-auth.test.mjs`).
Red before the fix, green after (verified by reverting the three files to HEAD, rerunning, then
restoring — see "Checks" below for the actual command output).

## B. Storefront: 3 product cards per row only from 960px

`PRODUCT_GRID_CLASS` (`apps/storefront/src/modules/products/components/product-card/index.tsx`)
is the shared grid: the catalog (`paginated-products.tsx`), the home listings
(`listing-section/index.tsx`, `data-product-grid="home"`), and the loading skeleton
(`skeleton-product-grid`) all read it. `small:grid-cols-3` (small = 1024px in
`tailwind.config.js`) became `grid-3:grid-cols-3`, a new theme token added at exactly 960px
(no existing token sat there). No ad-hoc media query.

Column count, live-measured (computed `grid-template-columns`) on `/ru` (data-product-grid="home"):

| width | before (small=1024px, derived from the unmodified token) | after (measured) |
|---|---|---|
| 390 | 2 | 2 |
| 640 | 2 | 2 |
| 768 | 2 | 2 |
| 959 | 2 | 2 |
| 960 | 2 | **3** |
| 1440 | 4 | 4 |

"Before" at 960 is derived, not re-measured live: reproducing it would mean reverting the
storefront and re-running `next build` (6+ minutes) twice more against a tight token budget. The
value follows directly from the unmodified `small: 1024px` token in `tailwind.config.js` (git
history) — below 1024px `small:grid-cols-3` never applied, so the base `grid-cols-2` was the only
rule in effect at 960px. "After" is a live measurement (see `measure-grid.mjs` output below).

Screenshots: `apps/storefront/docs/evidence/t-2026-09-25-18/home-product-grid/{959,960}-light-after.png`.

## C. Storefront: course buy box width

The course layout (`apps/storefront/src/modules/products/templates/index.tsx`) pinned its buy box
to a fixed `24rem` column. The normal product page's buy box is `minmax(0,1fr)` out of
`minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1fr)`. Fix: the course layout now uses the SAME three-way
template, with its content (cover/gallery + summary) spanning the first two columns and the buy
box in the third — not a coincidentally-matching number, the identical column definition, so the
two pages agree at every viewport, not just the two tested here.

Buy box width (`getBoundingClientRect().width` of `[data-testid="product-buy-card"]`), course vs
two normal cherkashino products (`mumie-altayskoe-ochischennoe-naturalnoe-100-cherkashino`,
`troychatka-plyus-60-kapsul-cherkashino`):

| width | course before | normal before | course after | normal after |
|---|---|---|---|---|
| 1440 | 384.00 (fixed 24rem) | 353.68 | 353.68 | 353.68 |
| 1024 | 384.00 (fixed 24rem) | 244.21 | 244.21 | 244.21 |

"Before" course values are the literal `24rem` constant (384px), not viewport-dependent — no live
re-measurement needed, it is what the removed CSS said. "After" is a live measurement; course and
both normal products land on the identical width at both test widths (0.00px difference).

Screenshot: `apps/storefront/docs/evidence/t-2026-09-25-18/course-buy-box/1440-light-{course-after,normal-1,normal-2}.png`.

## D. `?v_id=` for one-variant products

`ProductSelectionProvider` (`product-selection/index.tsx`) now writes `v_id` only when the product
has more than one variant (`variantIdForUrl`, a small pure function pulled out of the effect for
testability). JSON-LD offer URLs (`lib/util/json-ld.ts`) are untouched — they still name the
variant on every offer, as asked.

Live check: navigated to
`http://olavka-com.localhost:8293/ru/products/course-ochishchenie-pecheni?v_id=variant_01M39WW8VSE17W0S0EN4YNFHKV`
(Ivan's own URL from the report) and read `location.href` ~1.5s after load:

```
course page URL after load: http://olavka-com.localhost:8293/ru/products/course-ochishchenie-pecheni
```

`v_id` is gone. The multi-variant case (a product with a real choice keeps `v_id` after a
selection) has no cherkashino product with more than one variant on this stand's restored DB to
click through live, so it is covered by the unit test only:
`apps/storefront/src/modules/products/components/product-selection/variant-id-for-url.test.ts`,
4 cases (one/multi-variant × before/after selection).

## E. `stand-restart-backend.sh`: relative-path incident

**Incident, disclosed to the lead in real time (SendMessage, before continuing):** starting my own
backend with a RELATIVE `apps/backend` (instead of the absolute path the script's own usage
example shows) matched every stand's backend on the box as one literal substring. The script
killed a live worker's process tree (task t-2026-09-25-n17 — confirmed by the lead to have been an
idle, already-pushed session, nothing lost) and this box's own `:9251` (the lead restarted it).
Reported at the time; the lead asked for this fix in the same PR, tagged `t-2026-09-25-17` (the
task that introduced the script in #160), since it is that script's own defect.

Fix (`scripts/stand-restart-backend.sh`):
1. `$DIR` is resolved to its absolute, physical path (`cd "$DIR" && pwd -P`) before anything else,
   and must be a real directory with a `package.json` naming `@medusajs/medusa` — in both real and
   `--dry-run` mode, since the proof below runs `--dry-run` against real worktree directories.
2. The command-line match now requires (a) the process is `node`, `npm` or `npx` (by the last path
   segment of `ps`'s own `comm`, whose first word also covers `npm exec medusa develop`-style
   rewritten titles) — never a shell or an agent's own `claude` process — and (b) `$DIR` matches as
   a whole path segment (followed by `/`, a space, or the end of the line), not a bare substring,
   so `apps/backend` no longer also claims `apps/backend-v2`. The same boundary check applies to
   the `cwd`-based match.

Proof (`--dry-run`, real command output, dummy processes cleaned up after): two "node"-named
sleep processes for two different worktrees (A, a decoy "A-v2" whose directory name merely starts
with A's), plus a plain (non-node) `sleep` whose own argv0 carries A's real absolute path as text —
the exact shape of what actually went wrong.

```
=== ORIGINAL script, relative "apps/backend" from worktree A's root ===
dry-run: would stop: 14571 14733 16847 18250 43286 43529 45550 99758 99759 99760 99761
  (my own live :9281 tree, the lead's live :9251 tree, AND all four dummies — A, A-v2, B, the decoy)

=== FIXED script, absolute path ===
dry-run: would stop: 99758
=== FIXED script, relative "apps/backend" from worktree A's root ===
dry-run: would stop: 99758
  (only A — A-v2, B and the text-decoy correctly excluded either way)
```

## Checks

Panel (`apps/tenant-panel`):
```
npx tsc --noEmit            → clean
npx eslint <touched files>  → clean
node --test src/__tests__/  → 75 passed, 0 failed
```
`table-cells-one-line.test.mjs` red-before/green-after verified by hand: copied the 12 touched
files aside, restored HEAD, reran (12 failed with the expected "must not render as its own
<Text>" messages), restored the fixed files, reran (12 passed), confirmed full suite (75) still
green.

Storefront (`apps/storefront`):
```
npx tsc --noEmit             → clean
npx next lint                → clean (two pre-existing @next/next/no-img-element warnings, unrelated)
npx next build                → succeeds, all 21 static pages generated
npm run test (vitest)        → 55 files, 461 passed, 0 failed
```

## Stand deviations from the brief, disclosed

- `static/{o21-live,courses}` did not exist under `redesign-olavka/apps/backend/static` (only
  `home-banners` does now). Copied from `feat-image-gen-extension/apps/backend/static/` instead
  (the freshest copy found, timestamps 2026-09-25).
- The incident above (E).
