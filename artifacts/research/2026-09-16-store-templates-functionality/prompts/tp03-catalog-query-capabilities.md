# tp03-catalog-query-capabilities — Выдача каталога: фильтр по цене, «только в наличии», сортировка по популярности и рейтингу, признак наличия в ответе

Branch `feat/day16-tp03-catalog-query-capabilities`, cut from `dev`, one Superset workspace, one PR into `dev`. Language: Russian is fine for prose and commits, English for identifiers.

## Order

The storefront cannot offer the filters every InSales demo has because the catalog query does not support them. Add the four capabilities to the tenant catalog API, each covered by a test.

## Where this comes from

Research `artifacts/research/2026-09-16-store-templates-functionality/` on this repository (task r03). Read `report.md` §2 and the rows of `features.json` whose `id` is one of: `price-range-filter`, `in-stock-filter`, `catalog-sorting`, `stock-status`. Each row carries the templates where the feature was seen and what our own product has today — the `upready_store` and `upready_where` columns are a MEASUREMENT of our code and of the live store, made 2026-09-16, not a memory.

Evidence to look at before you design anything:

  - InSales, «Фильтр по цене (диапазон от/до)»: https://demo-moon.myinsales.ru/collection/parfyum
  - InSales, «Фильтр «только в наличии»»: https://demo-base.myinsales.ru/collection/new
  - InSales, «Фильтр «только в наличии»»: https://demo-bubble.myinsales.ru/collection/myagkie-igrushki
  - InSales, «Сортировка каталога»: https://demo-cream.myinsales.ru/collection/uhod-za-kozhey
  - InSales, «Сортировка каталога»: https://demo-minimalism.myinsales.ru/collection/divani
  - InSales, «Статус наличия товара»: https://www.insales.ru/collection/themes-cosmetics/product/shablon-internet-magazina-moon
  - InSales, «Статус наличия товара»: https://demo-opening.myinsales.ru/
  - Tilda, «Статус наличия товара»: http://examples-ru.tilda.ws/plantsshopru
  - Tilda, «Статус наличия товара»: http://examples-ru.tilda.ws/furnitureru

Do not copy anyone's visual style — only the mechanics. Our design language is Geist plus the composition corridor in `apps/storefront/src/lib/theme/composition.ts`; a sibling task `tp01-store-templates-lab` owns the style specification.

## What to build

- `min_price` / `max_price` query parameters, plus an endpoint (or an extra field on the category response) returning the actual price bounds of the current selection so the UI can size a slider.
- `in_stock=true` — only variants with a positive inventory quantity.
- Sort orders `popularity` (by the number of sold units over the last 90 days) and `rating` (by the average review score from the product-review module) next to the existing `created_at` / `price_asc` / `price_desc`.
- An `availability` field on every product in the catalog response so the card can render a status without a second request.
- Tenant scoping stays as in the neighbouring routes (`api/tenants/tenant-scope.ts`); nothing here may leak another tenant's data.

## How it is measured (rule 18f — reality, not «should work»)

- Integration tests over the new parameters, including the tenant-isolation case, in the suite AGENTS.md prescribes for backend routes.
- curl against the local stand for each parameter, with the command and its output in the PR body.
- No migration that drops or rewrites data; if a schema change is needed, `pg_dump` first.

Every acceptance line in the PR body quotes the command and its output, or names the screenshot file. Screenshots go to `artifacts/docs/tp03-catalog-query-capabilities/`.

## Boundaries

- Backend and owner panel only; do not redesign the storefront in this task.
- No changes to another task's area, no history rewrites, no force-push, never commit `HANDOFF.json` on a task branch.
- A schema change on a live database is preceded by `pg_dump`.

## Finish

Checks green (name them with their result lines) → `git push -u origin feat/day16-tp03-catalog-query-capabilities` → `gh pr create --base dev` with the measurements in the body → append a line to `handoff/day-2026-09-16-oksana-store/logs/workers.log` → stop, do not merge your own PR.
