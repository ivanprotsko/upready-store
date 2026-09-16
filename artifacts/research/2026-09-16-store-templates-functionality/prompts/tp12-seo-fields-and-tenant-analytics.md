# tp12-seo-fields-and-tenant-analytics — SEO-поля товара, категории и страницы, произвольные ключи страниц магазина, пер-тенантный счётчик аналитики

Branch `feat/day16-tp12-seo-fields-and-tenant-analytics`, cut from `dev`, one Superset workspace, one PR into `dev`. Language: Russian is fine for prose and commits, English for identifiers.

## Order

Three measured gaps that block a real shop: no editable meta fields, a hardcoded list of page keys (so an owner cannot create «Доставка и оплата», which half the InSales demos have), and one analytics id shared by every storefront in the image.

## Where this comes from

Research `artifacts/research/2026-09-16-store-templates-functionality/` on this repository (task r03). Read `report.md` §2 and the rows of `features.json` whose `id` is one of: `structured-data`, `delivery-payment-page`, `web-analytics`. Each row carries the templates where the feature was seen and what our own product has today — the `upready_store` and `upready_where` columns are a MEASUREMENT of our code and of the live store, made 2026-09-16, not a memory.

Evidence to look at before you design anything:

  - Tilda, «Микроразметка и SEO-данные страницы»: http://examples-ru.tilda.ws/newsfeedrealestateru
  - InSales, «Страница «Доставка и оплата»»: https://demo-cream.myinsales.ru/
  - InSales, «Страница «Доставка и оплата»»: http://demo-fourth.myinsales.ru/
  - Tilda, «Страница «Доставка и оплата»»: http://examples-ru.tilda.ws/fooddeliveryru
  - Tilda, «Страница «Доставка и оплата»»: http://examples-ru.tilda.ws/plantsshopru
  - InSales, «Веб-аналитика»: https://demo-opening.myinsales.ru/

Do not copy anyone's visual style — only the mechanics. Our design language is Geist plus the composition corridor in `apps/storefront/src/lib/theme/composition.ts`; a sibling task `tp01-store-templates-lab` owns the style specification.

## What to build

- meta title / meta description / slug on product, category and shop page, editable in the owner panel and used by the storefront head (the JSON-LD and canonical logic already exists).
- `tenant_page` today accepts only `contacts|legal|about|privacy|offer` (`modules/tenant/models/tenant-page.ts`). Allow owner-defined keys with a slug, keeping the five known ones working and their footer links intact.
- A per-tenant analytics counter (GA4 and Яндекс.Метрика ids in tenant settings) replacing the single build-time `NEXT_PUBLIC_GA_MEASUREMENT_ID`, which today points every tenant at one property.

## How it is measured (rule 18f — reality, not «should work»)

- Integration tests for the new fields and the page-key change, including that the five legacy keys still resolve.
- On the stand: set a meta title, load the page, read it back out of the HTML — quote the curl and the output.
- Set a counter id for one tenant and show it is absent on another tenant's storefront.

Every acceptance line in the PR body quotes the command and its output, or names the screenshot file. Screenshots go to `artifacts/docs/tp12-seo-fields-and-tenant-analytics/`.

## Boundaries

- Backend and owner panel only; do not redesign the storefront in this task.
- No changes to another task's area, no history rewrites, no force-push, never commit `HANDOFF.json` on a task branch.
- A schema change on a live database is preceded by `pg_dump`.

## Finish

Checks green (name them with their result lines) → `git push -u origin feat/day16-tp12-seo-fields-and-tenant-analytics` → `gh pr create --base dev` with the measurements in the body → append a line to `handoff/day-2026-09-16-oksana-store/logs/workers.log` → stop, do not merge your own PR.
