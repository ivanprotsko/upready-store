# tp11-wishlist-compare-ui — Витрина: избранное и сравнение товаров со счётчиками в шапке и отдельными страницами

Branch `feat/day16-tp11-wishlist-compare-ui`, cut from `dev`, one Superset workspace, one PR into `dev`. Language: Russian is fine for prose and commits, English for identifiers.

## Order

Comparison appears in 10 of 19 InSales templates and a wishlist in 8 — they are the two most common catalog features we lack entirely.

## Where this comes from

Research `artifacts/research/2026-09-16-store-templates-functionality/` on this repository (task r03). Read `report.md` §2 and the rows of `features.json` whose `id` is one of: `wishlist`, `compare-products`. Each row carries the templates where the feature was seen and what our own product has today — the `upready_store` and `upready_where` columns are a MEASUREMENT of our code and of the live store, made 2026-09-16, not a memory.

Evidence to look at before you design anything:

  - InSales, «Избранное (список желаний)»: https://demo-minimalism.myinsales.ru/
  - InSales, «Избранное (список желаний)»: https://demo-base.myinsales.ru/
  - Tilda, «Избранное (список желаний)»: http://examples-ru.tilda.ws/homegoodsru
  - Tilda, «Избранное (список желаний)»: http://examples-ru.tilda.ws/jewelryru
  - InSales, «Сравнение товаров»: https://demo-cream.myinsales.ru/product/uhod-za-kozhey-test-1
  - InSales, «Сравнение товаров»: https://demo-bubble.myinsales.ru/product/danielka-myagkaya-igrushka-dlinnyy-kot-igrushka-podushka-igrushka-antistress-kot-baton-70sm-90sm-110sm

Do not copy anyone's visual style — only the mechanics. Our design language is Geist plus the composition corridor in `apps/storefront/src/lib/theme/composition.ts`; a sibling task `tp01-store-templates-lab` owns the style specification.

## What to build

- Wishlist and comparison lists kept per browser (localStorage) so a guest can use both, with counters in the header.
- A wishlist page and a comparison page; comparison shows the shop's own attributes (`api/tenants/product-attributes`) as rows, hiding rows where all products agree, with a switch to show them.
- For a signed-in customer the wishlist should survive a device change — if that needs backend storage, do NOT add it here: name it in the PR as the follow-up task and ship the local version.
- Both lists must tolerate a product that has since disappeared (rule 20a: a client-held id is a cache of foreign state).

## How it is measured (rule 18f — reality, not «should work»)

- Local stand: add three products to comparison, see the differing rows, remove one, reload — state survives. Screenshots.
- A deleted product in the list does not break the page — show it.
- Typecheck and unit suite green.

Every acceptance line in the PR body quotes the command and its output, or names the screenshot file. Screenshots go to `artifacts/docs/tp11-wishlist-compare-ui/`.

## Boundaries

- Storefront only; if you need data the API does not return, name the missing endpoint in the PR instead of adding a backend model here.
- No changes to another task's area, no history rewrites, no force-push, never commit `HANDOFF.json` on a task branch.
- A schema change on a live database is preceded by `pg_dump`.

## Finish

Checks green (name them with their result lines) → `git push -u origin feat/day16-tp11-wishlist-compare-ui` → `gh pr create --base dev` with the measurements in the body → append a line to `handoff/day-2026-09-16-oksana-store/logs/workers.log` → stop, do not merge your own PR.
