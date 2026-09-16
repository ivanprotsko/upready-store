# tp08-quick-view-and-one-click-ui — Витрина: быстрый просмотр товара в модальном окне, кнопка «Купить в 1 клик», свёртка длинного описания

Branch `feat/day16-tp08-quick-view-and-one-click-ui`, cut from `dev`, one Superset workspace, one PR into `dev`. Language: Russian is fine for prose and commits, English for identifiers.

## Order

Add the three product-page mechanics our catalog lacks. The long-description one is not theoretical: on the live store the мумиё description prints as one uninterrupted wall of text.

## Where this comes from

Research `artifacts/research/2026-09-16-store-templates-functionality/` on this repository (task r03). Read `report.md` §2 and the rows of `features.json` whose `id` is one of: `quick-view-popup`, `one-click-buy`, `preorder`, `product-description-expand`. Each row carries the templates where the feature was seen and what our own product has today — the `upready_store` and `upready_where` columns are a MEASUREMENT of our code and of the live store, made 2026-09-16, not a memory.

Evidence to look at before you design anything:

  - InSales, «Быстрый просмотр товара во всплывающем окне»: https://www.insales.ru/collection/themes/product/shablon-internet-magazina-landing-1
  - Tilda, «Быстрый просмотр товара во всплывающем окне»: http://examples-ru.tilda.ws/fooddeliveryru
  - Tilda, «Быстрый просмотр товара во всплывающем окне»: http://examples-ru.tilda.ws/plantsshopru
  - InSales, «Купить в один клик»: https://demo-cream.myinsales.ru/
  - InSales, «Купить в один клик»: https://demo-minimalism.myinsales.ru/
  - InSales, «Предзаказ товара не в наличии»: https://www.insales.ru/collection/themes/product/cream
  - InSales, «Предзаказ товара не в наличии»: https://demo-fine.myinsales.ru/
  - InSales, «Описание товара со сворачиванием («показать полностью»)»: https://demo-minimalism.myinsales.ru/product/divan-1
  - InSales, «Описание товара со сворачиванием («показать полностью»)»: https://demo-idea.myinsales.ru/collection/dlya-devochek/product/medvezhonok

Do not copy anyone's visual style — only the mechanics. Our design language is Geist plus the composition corridor in `apps/storefront/src/lib/theme/composition.ts`; a sibling task `tp01-store-templates-lab` owns the style specification.

## What to build

- Quick view: a modal opened from a catalog card showing gallery, price, variants and add-to-cart without leaving the listing; the page URL must stay shareable (a route-intercepting modal or a query parameter, your call — say which and why).
- «Купить в 1 клик»: a short form (name + phone) on the product page and inside quick view, posting to the tp07 endpoint, with a clear success state.
- Pre-order state on a zero-stock product when the shop enabled it.
- Product description: collapse past ~12 lines with «Показать полностью» / «Свернуть», with the full text present in the DOM so it stays indexable.

## How it is measured (rule 18f — reality, not «should work»)

- Local stand, in a browser: open quick view from the listing, order in one click, see the order in the owner panel. Screenshots of each step.
- The мумиё product page before/after the collapse, at 390 px.
- Typecheck and unit suite green.

Every acceptance line in the PR body quotes the command and its output, or names the screenshot file. Screenshots go to `artifacts/docs/tp08-quick-view-and-one-click-ui/`.

## Boundaries

- Storefront only; if you need data the API does not return, name the missing endpoint in the PR instead of adding a backend model here.
- No changes to another task's area, no history rewrites, no force-push, never commit `HANDOFF.json` on a task branch.
- A schema change on a live database is preceded by `pg_dump`.

## Finish

Checks green (name them with their result lines) → `git push -u origin feat/day16-tp08-quick-view-and-one-click-ui` → `gh pr create --base dev` with the measurements in the body → append a line to `handoff/day-2026-09-16-oksana-store/logs/workers.log` → stop, do not merge your own PR.
