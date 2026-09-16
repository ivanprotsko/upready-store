# tp10-newsletter-and-trust-ui — Витрина: настоящая форма рассылки в подвале F4, формы обратного звонка и заявки, баннер согласия на cookie

Branch `feat/day16-tp10-newsletter-and-trust-ui`, cut from `dev`, one Superset workspace, one PR into `dev`. Language: Russian is fine for prose and commits, English for identifiers.

## Order

Render the tp09 forms on the storefront and add the cookie-consent banner a Russian shop needs.

## Where this comes from

Research `artifacts/research/2026-09-16-store-templates-functionality/` on this repository (task r03). Read `report.md` §2 and the rows of `features.json` whose `id` is one of: `newsletter-signup`, `callback-request`, `lead-request-form`, `cookie-consent`. Each row carries the templates where the feature was seen and what our own product has today — the `upready_store` and `upready_where` columns are a MEASUREMENT of our code and of the live store, made 2026-09-16, not a memory.

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
  - Tilda, «Баннер согласия на cookie»: http://examples-ru.tilda.ws/mythsru

Do not copy anyone's visual style — only the mechanics. Our design language is Geist plus the composition corridor in `apps/storefront/src/lib/theme/composition.ts`; a sibling task `tp01-store-templates-lab` owns the style specification.

## What to build

- Footer F4 gets its real newsletter form (this is the variant that today silently renders F1).
- A «Заказать звонок» control in the header and a lead form block usable on a content page.
- Cookie consent banner: shown once, remembered per browser, with a link to the shop's privacy page; it must not cover the buy button on a phone.
- Every form shows its own error and success state inline; a failed submit must never look like a success (rule 20a).

## How it is measured (rule 18f — reality, not «should work»)

- Local stand: submit each form and see it arrive in the owner panel; screenshots.
- The banner at 390 px with the product page behind it, showing the buy button is still reachable.
- Typecheck and unit suite green.

Every acceptance line in the PR body quotes the command and its output, or names the screenshot file. Screenshots go to `artifacts/docs/tp10-newsletter-and-trust-ui/`.

## Boundaries

- Storefront only; if you need data the API does not return, name the missing endpoint in the PR instead of adding a backend model here.
- No changes to another task's area, no history rewrites, no force-push, never commit `HANDOFF.json` on a task branch.
- A schema change on a live database is preceded by `pg_dump`.

## Finish

Checks green (name them with their result lines) → `git push -u origin feat/day16-tp10-newsletter-and-trust-ui` → `gh pr create --base dev` with the measurements in the body → append a line to `handoff/day-2026-09-16-oksana-store/logs/workers.log` → stop, do not merge your own PR.
