# tp02-catalog-card-badges — Карточка товара в каталоге: метки наличия и скидки, старая цена, добавление в корзину из списка, «показать ещё»

Branch `feat/day16-tp02-catalog-card-badges`, cut from `dev`, one Superset workspace, one PR into `dev`. Language: Russian is fine for prose and commits, English for identifiers.

## Order

Bring the catalog product card up to the level every InSales and Tilda store template shows: a price block that displays the old (struck-through) price next to the discounted one, status and promo badges (В наличии / Нет в наличии / Новинка / Скидка −N%), an add-to-cart control on the card itself, and a «Показать ещё» button that appends the next page without a full reload.

## Where this comes from

Research `artifacts/research/2026-09-16-store-templates-functionality/` on this repository (task r03). Read `report.md` §2 and the rows of `features.json` whose `id` is one of: `product-card-price-badges`, `stock-status`, `quick-add-to-cart`, `pagination-load-more`. Each row carries the templates where the feature was seen and what our own product has today — the `upready_store` and `upready_where` columns are a MEASUREMENT of our code and of the live store, made 2026-09-16, not a memory.

Evidence to look at before you design anything:

  - InSales, «Карточка товара: цена, старая цена, метки SALE/NEW»: https://demo-base.myinsales.ru/collection/new
  - InSales, «Карточка товара: цена, старая цена, метки SALE/NEW»: https://demo-bubble.myinsales.ru/
  - Tilda, «Карточка товара: цена, старая цена, метки SALE/NEW»: http://examples-ru.tilda.ws/fooddeliveryru
  - Tilda, «Карточка товара: цена, старая цена, метки SALE/NEW»: http://examples-ru.tilda.ws/homegoodsru
  - InSales, «Статус наличия товара»: https://www.insales.ru/collection/themes-cosmetics/product/shablon-internet-magazina-moon
  - InSales, «Статус наличия товара»: https://demo-opening.myinsales.ru/
  - Tilda, «Статус наличия товара»: http://examples-ru.tilda.ws/plantsshopru
  - Tilda, «Статус наличия товара»: http://examples-ru.tilda.ws/furnitureru
  - InSales, «Добавление в корзину прямо из списка»: https://demo-stories.myinsales.ru/
  - Tilda, «Добавление в корзину прямо из списка»: http://examples-ru.tilda.ws/shetukaru
  - Tilda, «Добавление в корзину прямо из списка»: http://examples-ru.tilda.ws/instoreru
  - InSales, «Пагинация и «показать ещё»»: https://demo-stories.myinsales.ru/collection/kategoriya-1
  - Tilda, «Пагинация и «показать ещё»»: http://examples-ru.tilda.ws/menidyonru
  - Tilda, «Пагинация и «показать ещё»»: http://examples-ru.tilda.ws/cannyonlinestoreru

Do not copy anyone's visual style — only the mechanics. Our design language is Geist plus the composition corridor in `apps/storefront/src/lib/theme/composition.ts`; a sibling task `tp01-store-templates-lab` owns the style specification.

## What to build

- `modules/products/components/product-price` and `modules/home/components/product-card`: render the original price struck through whenever a promotion or a compare-at price applies, plus the discount percentage.
- A `ProductBadges` component (new, under `modules/products/components`) driven by data already on the product: stock quantity, `created_at` (Новинка within N days, N from a constant), active promotion. No new backend fields.
- Add-to-cart control on the card in `/store` and in a category listing, reusing `modules/home/components/add-to-bag-button`; a product with several variants opens the product page instead of guessing a variant.
- `modules/store/components/pagination`: keep the numbered pages for SEO and add a «Показать ещё» button that appends the next page client-side.

## How it is measured (rule 18f — reality, not «should work»)

- Local stand per AGENTS.md; a product with a promotion shows the struck-through price and the −N% badge; a product with zero stock shows «Нет в наличии» and its add-to-cart control is disabled.
- Screenshots of /ru/store at 390 and 1440 px, before and after, into artifacts/docs/<id>/.
- `pnpm --filter @dtc/gorgo-medusa-storefront typecheck` and the storefront unit suite green — quote the result lines.

Every acceptance line in the PR body quotes the command and its output, or names the screenshot file. Screenshots go to `artifacts/docs/tp02-catalog-card-badges/`.

## Boundaries

- Storefront only; if you need data the API does not return, name the missing endpoint in the PR instead of adding a backend model here.
- No changes to another task's area, no history rewrites, no force-push, never commit `HANDOFF.json` on a task branch.
- A schema change on a live database is preceded by `pg_dump`.

## Finish

Checks green (name them with their result lines) → `git push -u origin feat/day16-tp02-catalog-card-badges` → `gh pr create --base dev` with the measurements in the body → append a line to `handoff/day-2026-09-16-oksana-store/logs/workers.log` → stop, do not merge your own PR.
