# tp07-one-click-order-api — Заказ в один клик и предзаказ: ручки создания заказа без корзины и покупки товара с нулевым остатком, уведомление владельцу

Branch `feat/day16-tp07-one-click-order-api`, cut from `dev`, one Superset workspace, one PR into `dev`. Language: Russian is fine for prose and commits, English for identifiers.

## Order

«Купить в 1 клик» appears in 7 of 19 InSales templates and pre-order in 10 of 19 — for a Russian shop both are baseline. Neither exists in our backend.

## Where this comes from

Research `artifacts/research/2026-09-16-store-templates-functionality/` on this repository (task r03). Read `report.md` §2 and the rows of `features.json` whose `id` is one of: `one-click-buy`, `preorder`. Each row carries the templates where the feature was seen and what our own product has today — the `upready_store` and `upready_where` columns are a MEASUREMENT of our code and of the live store, made 2026-09-16, not a memory.

Evidence to look at before you design anything:

  - InSales, «Купить в один клик»: https://demo-cream.myinsales.ru/
  - InSales, «Купить в один клик»: https://demo-minimalism.myinsales.ru/
  - InSales, «Предзаказ товара не в наличии»: https://www.insales.ru/collection/themes/product/cream
  - InSales, «Предзаказ товара не в наличии»: https://demo-fine.myinsales.ru/

Do not copy anyone's visual style — only the mechanics. Our design language is Geist plus the composition corridor in `apps/storefront/src/lib/theme/composition.ts`; a sibling task `tp01-store-templates-lab` owns the style specification.

## What to build

- An endpoint that creates an order from one variant plus a contact (name + phone, email optional), without a cart, in a status that means «ожидает подтверждения» — the owner calls back to confirm.
- Pre-order: allow adding to cart and ordering a variant with zero stock when the shop has enabled it, and mark such a line as a pre-order in the order.
- Both must notify the owner through the channel that already exists (`api/tenants/notification-settings`, including its telegram branch) and the customer by email through `modules/smtp-notification`.
- A per-tenant switch for each of the two behaviours; default off, so no shop gets them by surprise.

## How it is measured (rule 18f — reality, not «should work»)

- Integration tests: order created from one variant; pre-order of a zero-stock variant; both switches off → the endpoint refuses.
- A live call against the local stand with the request and response in the PR body.
- Owner notification actually delivered on the stand (log line or received message quoted).

Every acceptance line in the PR body quotes the command and its output, or names the screenshot file. Screenshots go to `artifacts/docs/tp07-one-click-order-api/`.

## Boundaries

- Backend and owner panel only; do not redesign the storefront in this task.
- No changes to another task's area, no history rewrites, no force-push, never commit `HANDOFF.json` on a task branch.
- A schema change on a live database is preceded by `pg_dump`.

## Finish

Checks green (name them with their result lines) → `git push -u origin feat/day16-tp07-one-click-order-api` → `gh pr create --base dev` with the measurements in the body → append a line to `handoff/day-2026-09-16-oksana-store/logs/workers.log` → stop, do not merge your own PR.
