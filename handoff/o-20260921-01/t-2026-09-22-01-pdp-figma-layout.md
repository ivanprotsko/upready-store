# t-2026-09-22-01 — product page laid out after Ivan's Figma mockup (cherkashino)

Written by the lead of upready-store 2026-09-22 18:20 WITA, right before a `/compact` Ivan asked for. Executor: the lead itself, solo (rule 3b), model Fable (order o-20260921-01: Fable on interfaces). Read `COMMON.md` next to this file for the shared rules of the order.

## Ivan's words (verbatim, in the lead's terminal, not via HQ)

- 2026-09-22 ~17:45 WITA: «посмотри этот макет» + https://www.figma.com/design/bjRl8KdydT35JigupFZdHd/Untitled?node-id=9-70418&t=0AHtQjIAZuuTvf5S-1
- 2026-09-22 ~18:05 WITA: «хочу, чтобы ты сделал такую же вёрстку, но после /compact»

## Design stage (rule 27d)

- Layout artefact: the Figma frame «ProductPage» (node 9-70418, 1184 × 3098). Figma API tokens in `.env.keys` are invalid (403), so the working copy is Ivan's own PNG export: `/Users/ivanprotsko/upready/projects/upready-store/artifacts/docs/o-20260921-01/mockups/ProductPage-figma-9-70418.png`. The view link also opens in the Superset browser pane without login (canvas only, small zoom).
- The same product on the current stand at the same width, for the before/after pair: `/Users/ivanprotsko/upready/projects/upready-store/artifacts/docs/o-20260921-01/mockups/stand-pdp-1184-2026-09-22.png` (product `kastorovoe-maslo-kastorka-indiyskaya-cherkashino`, 6 photos, http://cherkashino.localhost:8121/ru/products/kastorovoe-maslo-kastorka-indiyskaya-cherkashino).
- Canon: `~/upready/packages/geist-kit/AGENTS.md` (rule 27) for spacing, type and control sizes where the mockup is silent; the storefront's own system otherwise: `@medusajs/ui` + Tailwind, the profile/theme layer in `apps/storefront/src/lib/profile` (`image-frame.tsx`, `image-treatment.ts`, `profile.generated.json`), 36 next-intl locales (no hardcoded strings, parity check from AGENTS.md), footer variants in `apps/storefront/src/modules/layout/templates/footer/variants` (cherkashino uses f4).
- Human-eyes acceptance is Ivan's, on 1184 (the mockup width) and 390. Machine gates alone do not close this task.

## What the mockup shows, top to bottom, and what to do with each block

Defaults below are the lead's reading of the mockup; each one is a fork that Ivan may overrule at any time (the forks are listed to him in the chat reply of 18:20 WITA and in FOR-IVAN.md).

1. **Header**: burger, country + currency at the left, logo «ЧЕРКАШИНО» centred, at the right wishlist heart, account, «Корзина», a chat button. Default: burger opens the category menu that the current header shows inline; country and currency are the existing region/currency controls; wishlist heart and chat button are rendered only if a wishlist/chat feature exists (it does not today) — otherwise omitted, not stubbed.
2. **Three cards in a row** (gallery / centre / buy box), page background light grey, cards white with 1 px border and large radius:
   - Gallery: one large photo on white, no 3:4 frame, thumbnails in a horizontal strip UNDER the photo (the current page has them at the left). Keep `image-frame` treatment for whole-photo fit (nothing cropped).
   - Centre: breadcrumb in a pill above the title («Витрина / Каталог / Масла»), title in two lines, two pills «★ 4.8 · 2411 оценок ›» and «? 412 вопросов ›», variant label «100 мл» with variant swatches AS PHOTOS (5 thumbnails), an attribute grid in two columns with dotted leaders (Состав, Объём, Страна производства / Длина, Высота, Ширина упаковки), «Все описание» link, a dotted divider, a description clipped to 3 lines with a second «Все описание».
     Defaults: rating pill from the existing `product-reviews` data (`star-rating.tsx`), hidden when the product has no reviews; questions pill omitted (no questions source on the storefront); variant swatches use the variant's own image, falling back to the product thumbnail; attributes from the existing product attributes (the current «Характеристики» table) — first six; «Все описание» scrolls/expands the full description and attributes below the three cards.
   - Buy box: price «931 ₽» with a wallet icon, old price struck through «2326 ₽», big green «В корзину», outlined «Оплатить». Defaults: price and currency from the region as today (₽); struck price only when a compare-at price exists; «Оплатить» = add to cart and go straight to `/checkout`.
3. **«С этим товаром покупают»**: centred H2, four products in a row, photos on white without frames or borders, price above name in small grey type. Default: the existing related-products query (today «Вам может понравиться», a 3×2 grid) re-skinned to this row; the section title becomes the mockup's.
4. **«Не пропустите новый сезон!»**: a full-width course banner (illustration, date pill «17 августа», pill «Курс», button «Смотреть»), large radius. Default: rendered from an existing content block/tenant home_config if such a banner block exists in the code (check `src/modules/content` and `home_config`); otherwise omitted. Do not hardcode the picture.
5. **«Вы недавно просматривали»**: six products in a row, same card style. Default: client component over `localStorage` of visited product handles, hidden when fewer than 2 items.
6. **Footer** in three bordered columns («О магазине»: Черкашина Оксана, Контакты, Отследить заказ, Публичная оферта, Возврат, Приватность, Настройки cookie / «Здоровье без таблеток»: YouTube, Telegram / «Курсы»: Восстановление почек, Про АСД), then a row of outlined badges (DHL, CDEK, AMEX, VISA, Mastercard, stripe, PayPal, G Pay, Apple Pay), then the copyright line and the seller requisites («ИП … · ОГРНИП … · ИНН …») at the right. Default: a new footer variant (f7) so f4 stays for other tenants; links from the tenant's existing footer/legal data; badges from a static list per tenant config (the mockup's set as default); requisites from `GET /store/tenant/seller` (already used by f4).

Placeholders in the mockup that are NOT to be copied: card prices in «$» and «$ —» (use region prices), «Тайланд / USD» (use the visitor's region), «Состав: АСД» for castor oil (real attributes), `{{ФИО_ИП}}` (real seller data).

## Where the code is

- Base branch: `dev` (local `dev` was rebased onto `origin/dev` and pushed 2026-09-22 18:12 WITA: `080f95dc`, ahead 0 / behind 0). PRs 105–110 are in it.
- PDP template `apps/storefront/src/modules/products/templates/index.tsx`; components under `apps/storefront/src/modules/products/components/` (`image-gallery/gallery.tsx`, `product-actions`, `product-attributes`, `product-description`, `product-price`, `product-reviews`, `product-tabs`, `related-products`, `thumbnail`); layout header/footer under `src/modules/layout`.
- Do NOT touch the stand worktree `feat/o21-storefront-visual-cherkashino` (it serves http://cherkashino.localhost:8121) except to read its `.env.local`.

## Flow

1. `uptime` first (the machine ran load 20–33 on 2026-09-22); one dev server at a time, `nice -n 10`.
2. Workspace (rule 21k/21l), no `git worktree add` by hand:
   `superset ws create --local --project b29f7dd2-d35c-442d-9636-3c55da1eccf7 --branch feat/o22-pdp-figma-layout --base-branch dev --json`
   then work in the worktree it prints (`~/upready/worktrees/b29f7dd2-…/feat/o22-pdp-figma-layout` or as printed). Verify the fork point is `origin/dev` (`git reflog show <branch> | tail -1`).
3. Stand for the branch: storefront only, reusing backend 9121 and its database. Copy `/Users/ivanprotsko/upready/worktrees/upready-store/feat/o21-storefront-visual-cherkashino/apps/storefront/.env.local` into the new worktree's `apps/storefront/`, keep `NEXT_PUBLIC_MEDUSA_BACKEND_URL` pointing at 9121, set the storefront port to 8122 (`npx next dev -p 8122`, log into this session's scratchpad). Product URL: http://cherkashino.localhost:8122/ru/products/kastorovoe-maslo-kastorka-indiyskaya-cherkashino.
4. Build the blocks in the order above, one PR per unit is the rule (21k): unit A = three cards + header (the visible part of the mockup), unit B = the three lower sections, unit C = footer f7 + badges. If the first PR grows past one screen of diff, split.
5. Before the PR: `npx tsc --noEmit`, `npx next lint`, `npx next build`, vitest of the storefront, the locale parity check from AGENTS.md, the framing probe of PR 105 (`apps/storefront/e2e` / `scripts` — see PR 105 body), CLS on 1184 and 390.
6. PR to `dev` with `gh pr create --base dev`, screenshots of the stand at 1184 and 390 next to the mockup in the PR body, then FOR-IVAN.md updated with the links. Merge only after Ivan's eyes.

## Acceptance (human)

- Side by side with the mockup at 1184: the three cards, their proportions, the thumbnail strip under the photo, the pills, the dotted leaders, the buy box, the four-in-a-row and six-in-a-row product rows, the three-column footer with the badge row are recognisable as the same layout.
- No product photo is cropped anywhere (the PR 105 probe stays at 0 failures).
- On 390 the three cards stack in the order gallery → title/pills → buy box, the buy box stays reachable above the bottom menu, product rows scroll horizontally, the footer columns stack.
- Nothing in the UI is an English leftover or a hardcoded Russian string; all 36 locales carry the new keys.
- Dark preset (acme.localhost) is not broken.
