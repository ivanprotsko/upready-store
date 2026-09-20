# tp05-home-content-blocks-api — Блоки доверия как данные магазина: преимущества, вопросы-ответы, соцсети, отзывы о магазине (API + панель)

Branch `feat/day16-tp05-home-content-blocks-api`, cut from `dev`, one Superset workspace, one PR into `dev`. Language: Russian is fine for prose and commits, English for identifiers.

## Order

The four blocks every competitor home page carries cannot be built on the storefront because the shop has nowhere to store them. Add them as tenant data with an owner screen and a public read endpoint.

## Where this comes from

Research `artifacts/research/2026-09-16-store-templates-functionality/` on this repository (task r03). Read `report.md` §2 and the rows of `features.json` whose `id` is one of: `advantages-block`, `faq-block`, `social-follow-share`, `store-reviews`. Each row carries the templates where the feature was seen and what our own product has today — the `upready_store` and `upready_where` columns are a MEASUREMENT of our code and of the live store, made 2026-09-16, not a memory.

Evidence to look at before you design anything:

  - InSales, «Блок преимуществ магазина»: https://demo-idea.myinsales.ru/
  - InSales, «Блок преимуществ магазина»: https://demo-loft.myinsales.ru/
  - Tilda, «Блок преимуществ магазина»: http://examples-ru.tilda.ws/floristsru
  - Tilda, «Вопросы и ответы (FAQ)»: http://examples-ru.tilda.ws/plantsshopru
  - Tilda, «Вопросы и ответы (FAQ)»: http://examples-ru.tilda.ws/homegoodsru
  - InSales, «Соцсети: подписка и кнопки «поделиться»»: http://demo-fourth.myinsales.ru/
  - InSales, «Соцсети: подписка и кнопки «поделиться»»: http://demo-gift.myinsales.ru/
  - Tilda, «Соцсети: подписка и кнопки «поделиться»»: http://examples-ru.tilda.ws/homegoodsru
  - Tilda, «Соцсети: подписка и кнопки «поделиться»»: http://examples-ru.tilda.ws/shetukaru
  - InSales, «Отзывы покупателей о магазине»: https://demo-idea.myinsales.ru/collection/dlya-devochek/product/medvezhonok
  - InSales, «Отзывы покупателей о магазине»: https://myshop-bcp658.myinsales.ru/
  - Tilda, «Отзывы покупателей о магазине»: http://examples-ru.tilda.ws/newsfeedrealestateru
  - Tilda, «Отзывы покупателей о магазине»: http://examples-ru.tilda.ws/plantsshopru

Do not copy anyone's visual style — only the mechanics. Our design language is Geist plus the composition corridor in `apps/storefront/src/lib/theme/composition.ts`; a sibling task `tp01-store-templates-lab` owns the style specification.

## What to build

- Advantages: an ordered list of up to 6 items (icon key, title, text) on the tenant's home document.
- FAQ: an ordered list of question/answer pairs, tenant-wide; the storefront will render an accordion.
- Social links: a map of network → URL in tenant settings.
- Store reviews: a review about the SHOP (author, text, rating, date, moderation flag) — a sibling of the existing product-review module (`apps/backend/src/modules/product-review`), reusing its moderation idiom rather than inventing a second one.
- Public read through `api/store/tenant/...` the way `home`, `pages` and `articles` already do, with revalidation of the storefront on write.

## How it is measured (rule 18f — reality, not «should work»)

- Integration tests per resource, including tenant isolation and the moderation flag.
- Owner screens in `apps/tenant-panel` reachable from the navigation; a short screencast or screenshots of creating one item of each kind.
- curl of each public endpoint with output in the PR body.

Every acceptance line in the PR body quotes the command and its output, or names the screenshot file. Screenshots go to `artifacts/docs/tp05-home-content-blocks-api/`.

## Boundaries

- Backend and owner panel only; do not redesign the storefront in this task.
- No changes to another task's area, no history rewrites, no force-push, never commit `HANDOFF.json` on a task branch.
- A schema change on a live database is preceded by `pg_dump`.

## Finish

Checks green (name them with their result lines) → `git push -u origin feat/day16-tp05-home-content-blocks-api` → `gh pr create --base dev` with the measurements in the body → append a line to `handoff/day-2026-09-16-oksana-store/logs/workers.log` → stop, do not merge your own PR.
