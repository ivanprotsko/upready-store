# tp04-catalog-filters-ui — Фильтры и сортировка каталога на витрине: цена диапазоном, «только в наличии», расширенные сортировки, счётчики

Branch `feat/day16-tp04-catalog-filters-ui`, cut from `dev`, one Superset workspace, one PR into `dev`. Language: Russian is fine for prose and commits, English for identifiers.

## Order

Expose on the storefront what tp03 added to the API, in the shape InSales demos use: a filter panel with price from/to, an in-stock toggle, a wider sort list, a product counter and a «Сбросить» control.

## Where this comes from

Research `artifacts/research/2026-09-16-store-templates-functionality/` on this repository (task r03). Read `report.md` §2 and the rows of `features.json` whose `id` is one of: `price-range-filter`, `in-stock-filter`, `catalog-sorting`, `product-count-badge`. Each row carries the templates where the feature was seen and what our own product has today — the `upready_store` and `upready_where` columns are a MEASUREMENT of our code and of the live store, made 2026-09-16, not a memory.

Evidence to look at before you design anything:

  - InSales, «Фильтр по цене (диапазон от/до)»: https://demo-moon.myinsales.ru/collection/parfyum
  - InSales, «Фильтр «только в наличии»»: https://demo-base.myinsales.ru/collection/new
  - InSales, «Фильтр «только в наличии»»: https://demo-bubble.myinsales.ru/collection/myagkie-igrushki
  - InSales, «Сортировка каталога»: https://demo-cream.myinsales.ru/collection/uhod-za-kozhey
  - InSales, «Сортировка каталога»: https://demo-minimalism.myinsales.ru/collection/divani
  - InSales, «Счётчик товаров в категории»: https://demo-vibe.myinsales.ru/collection/svitera-i-dzhempery
  - Tilda, «Счётчик товаров в категории»: http://examples-ru.tilda.ws/oneproductpageru

Do not copy anyone's visual style — only the mechanics. Our design language is Geist plus the composition corridor in `apps/storefront/src/lib/theme/composition.ts`; a sibling task `tp01-store-templates-lab` owns the style specification.

## What to build

- `modules/store/components/refinement-list`: a price range control (two numeric inputs plus a slider) initialised from the bounds the API returns.
- An «Только в наличии» switch and a «Сбросить» button that clears every facet at once.
- `modules/store/components/sort-select`: add «по популярности» and «по рейтингу», keeping the existing three.
- The number of found products next to the filters, and the count of matching items next to each facet value (the attribute facets already return counts).
- Every filter state must live in the URL so a filtered listing can be shared and indexed.

## How it is measured (rule 18f — reality, not «should work»)

- Local stand: filter, sort, share the URL, reload — the same selection comes back. Screenshots at 390 and 1440 px.
- Typecheck and unit suite green; result lines quoted in the PR.

Every acceptance line in the PR body quotes the command and its output, or names the screenshot file. Screenshots go to `artifacts/docs/tp04-catalog-filters-ui/`.

## Boundaries

- Storefront only; if you need data the API does not return, name the missing endpoint in the PR instead of adding a backend model here.
- No changes to another task's area, no history rewrites, no force-push, never commit `HANDOFF.json` on a task branch.
- A schema change on a live database is preceded by `pg_dump`.

## Finish

Checks green (name them with their result lines) → `git push -u origin feat/day16-tp04-catalog-filters-ui` → `gh pr create --base dev` with the measurements in the body → append a line to `handoff/day-2026-09-16-oksana-store/logs/workers.log` → stop, do not merge your own PR.
