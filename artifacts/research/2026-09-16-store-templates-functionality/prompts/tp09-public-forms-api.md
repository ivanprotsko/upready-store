# tp09-public-forms-api — Публичные формы магазина: подписка на рассылку, обратный звонок, заявка — хранение, антиспам, доставка владельцу

Branch `feat/day16-tp09-public-forms-api`, cut from `dev`, one Superset workspace, one PR into `dev`. Language: Russian is fine for prose and commits, English for identifiers.

## Order

Our storefront has no public form at all except checkout, which is why the footer variant «с рассылкой» is a placeholder. Add the three forms as one small subsystem, with anti-spam from the start.

## Where this comes from

Research `artifacts/research/2026-09-16-store-templates-functionality/` on this repository (task r03). Read `report.md` §2 and the rows of `features.json` whose `id` is one of: `newsletter-signup`, `callback-request`, `lead-request-form`, `recaptcha`. Each row carries the templates where the feature was seen and what our own product has today — the `upready_store` and `upready_where` columns are a MEASUREMENT of our code and of the live store, made 2026-09-16, not a memory.

Evidence to look at before you design anything:

  - InSales, «Подписка на email-рассылку»: https://demo-opening.myinsales.ru/
  - InSales, «Подписка на email-рассылку»: https://demo-vibe.myinsales.ru/
  - Tilda, «Подписка на email-рассылку»: http://examples-ru.tilda.ws/ascentru
  - Tilda, «Подписка на email-рассылку»: http://examples-ru.tilda.ws/bluerinru
  - InSales, «Заказ обратного звонка»: https://demo-base.myinsales.ru/
  - InSales, «Заказ обратного звонка»: https://demo-grand.myinsales.ru/cart_items
  - Tilda, «Заказ обратного звонка»: http://examples-ru.tilda.ws/fooddeliveryru
  - Tilda, «Заказ обратного звонка»: http://examples-ru.tilda.ws/floristsru
  - InSales, «Форма заявки и обратной связи с валидацией»: https://myshop-bcp658.myinsales.ru/
  - InSales, «Форма заявки и обратной связи с валидацией»: https://demo-loft.myinsales.ru/
  - Tilda, «Форма заявки и обратной связи с валидацией»: http://examples-ru.tilda.ws/newsfeedrealestateru
  - Tilda, «Форма заявки и обратной связи с валидацией»: http://examples-ru.tilda.ws/mythsru
  - InSales, «Защита форм от спама (reCAPTCHA)»: https://www.insales.ru/collection/themes-cosmetics/product/shablon-internet-magazina-landing
  - InSales, «Защита форм от спама (reCAPTCHA)»: https://www.insales.ru/collection/themes-cosmetics/product/shablon-internet-magazina-otkrytie-40

Do not copy anyone's visual style — only the mechanics. Our design language is Geist plus the composition corridor in `apps/storefront/src/lib/theme/composition.ts`; a sibling task `tp01-store-templates-lab` owns the style specification.

## What to build

- Newsletter subscription: email + consent flag + source page, deduplicated per tenant; owner sees and exports the list.
- Callback request and generic lead form: contact fields plus a free-text message, tied to a page or product when one is given.
- Anti-spam on every public form (a captcha provider or an equivalent, with the key in tenant settings); rate limiting per IP. The moment a public form exists this stops being optional.
- Delivery to the owner over the existing notification settings (email and telegram), and an owner screen listing what arrived.

## How it is measured (rule 18f — reality, not «should work»)

- Integration tests: submission, duplicate suppression, anti-spam rejection, tenant isolation.
- Live submission on the stand delivering a notification — quote the log line or the message.
- curl of each endpoint in the PR body.

Every acceptance line in the PR body quotes the command and its output, or names the screenshot file. Screenshots go to `artifacts/docs/tp09-public-forms-api/`.

## Boundaries

- Backend and owner panel only; do not redesign the storefront in this task.
- No changes to another task's area, no history rewrites, no force-push, never commit `HANDOFF.json` on a task branch.
- A schema change on a live database is preceded by `pg_dump`.

## Finish

Checks green (name them with their result lines) → `git push -u origin feat/day16-tp09-public-forms-api` → `gh pr create --base dev` with the measurements in the body → append a line to `handoff/day-2026-09-16-oksana-store/logs/workers.log` → stop, do not merge your own PR.
