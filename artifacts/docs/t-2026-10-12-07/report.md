# t-2026-10-12-07 — cherkashino.ru promo codes, end to end on a local stand of current dev

Executor direct-t07 (Opus 5.5), 12.10.2026, launched by lead-upready-store for Ivan's order of 12.10 ~14:23 WITA, item 3:
«у нас работает функционал с промокодами? Где и как его добавить. Дай мне инструкцию и запусти локально cherkashino.ru».

Instruction for Ivan, in Russian: [instruction-ru.md](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t-2026-10-12-07-promo-stand/artifacts/docs/t-2026-10-12-07/instruction-ru.md).

## Answer in One Line

Promo codes work end to end, with gaps: the owner creates percentage and fixed codes in «Маркетинг → Акции». The buyer applies and removes them in the cart and at checkout, the totals show the discount, and Robokassa receives the discounted total. The gaps: a fixed-amount code needs a workaround in the panel, a wrong code gets only «Что-то пошло не так», an expired code is silently ignored, codes are case-sensitive, there is no minimum order amount, and part of the panel's labels are English.

## Stand

Worktree [t-2026-10-12-07-promo-stand](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t-2026-10-12-07-promo-stand), branch `feat/t-2026-10-12-07-promo-stand` on dev `c52e51ee`. Database `upready_store_ivan_1003` on 127.0.0.1:5433, dumped first to [upready_store_ivan_1003-pre-t-2026-10-12-07.dump](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t-2026-10-12-07-promo-stand/artifacts/stand-t-2026-10-12-07/upready_store_ivan_1003-pre-t-2026-10-12-07.dump) (119 MB, `pg_dump -Fc`, not in git). `medusa db:migrate`: every module up to date, links up to date, one Medusa migration script ran (`create-super-admin-role`). Env files copied from `stand/ivan-1001` without printing a value. Dependencies through the run queue (`corepack pnpm install --frozen-lockfile`, exit 0).

| Part | Address | HTTP (12.10 15:08) | proc-registry record |
|---|---|---|---|
| Storefront, `next build` + `next start -p 8700` | http://cherkashino-ru.localhost:8700/ru | 200 (`/ru/cart` 200) | 20261012-070820-14940 |
| Backend, `medusa develop` :9700 | http://localhost:9700/health | 200 | 20261012-064023-44182 |
| Panel, vite :5700 | http://localhost:5700/login | 200 (`/promotions` 200) | 20261012-064030-47399 |

All three are started by `proc-run.mjs --keep-for-ivan o-20260921-01 --ttl 604800`. The tool accepts only an order id (`/^o-\d{8}-\d{2}$/`), not the task id the brief names. `o-20260921-01` is the cherkashino-on-upready-store order the 05.10 stand used, and the task id is in each record's purpose (decision recorded with `decide.mjs`). Stop: `node /Users/ivanprotsko/upready/projects/devops/staff/tools/proc-registry.mjs stop <record>`.

`tenant_domain` was not changed. `cherkashino-ru.localhost` was already the primary host of tenant olavka, and the tunnel rows were already non-primary. `GET /storefront/by-host?host=cherkashino-ru.localhost` → `is_primary_host: true`; `host=cherkashino.ru` → `primary_host: cherkashino-ru.localhost`.

Stand owner login, local stand only: `stand-owner@cherkashino.test` / `promo-stand-1012`, role owner, row `tenadm_01M4QDHJ7JNSBK41JXFMNZ39EN`. It was created through the app's own `POST /tenants/staff` with a one-hour token of the existing owner, signed with the stand's `JWT_SECRET` (not printed). Sign-in checked: `POST /auth/tenant/emailpass` → 200.

The storefront build waited 7:25 in the run queue on `memFloor` (free ≈ 2.6–3.4 GB, the build needs 4.0). The first ticket was cancelled and resubmitted with `--remote=boat` after the lead's note about Ivan's word of 14:50, with the stand's `NEXT_PUBLIC_*` values in the command env, because `.env.local` is git-ignored and is not uploaded. boat refused (`acquire: нет BOAT_API_KEY в окружении раннера`), the queue fell back to the Mac and signalled lead-devops itself, and the build then ran 2:58, exit 0.

## What Was Checked and What Was Seen

### Owner Side (Panel, as the Stand Owner)

| Step | Seen | Shot |
|---|---|---|
| Sign in | the stand owner lands in the panel of «Черкашино» | 01-panel-login.png |
| «Маркетинг → Акции», empty | «Нет записей» | 02-panel-promotions-list-empty.png |
| Create «Скидка в процентах от заказа» `TEST10`, 10 %, «Активно», no campaign | «Акция (TEST10) успешно создана»; the card shows 10,00 % and the rule Sales Channel = the shop (added by the backend) | 04 to 07 |
| Create «Скидка на сумму заказа» `MINUS300`, 300 ₽ | value field locked and labelled USD (finding 1); after «Добавить условие → Currency Code → Russian Ruble» it becomes RUB; created, the card shows 300,00 ₽ RUB | 08b, 08, 08a, 09 |
| Create `OLD15`, 15 %, «Новая кампания» «Проверка срока», 01.10.2026 00:00 to 11.10.2026 23:59 | created; campaign dates stored as entered (+08) | 10, 10a, 11 |
| List with the three codes; switching a code off | list shows TEST10, MINUS300, OLD15 «Активно»; «…» → «Редактировать», «Удалить»; the edit sheet offers «Черновик / Активно / Неактивно» (not saved) | 11a, 11b, 11c |

Database after the panel steps (promotions of tenant olavka, `ten_01M2GQVGEN1204CN90C510DNRG`):

```
TEST10   | active | percentage |  10 |     | order | across
MINUS300 | active | fixed      | 300 | rub | order | across
OLD15    | active | percentage |  15 |     | order | across | Проверка срока | 2026-10-01 00:00+08 | 2026-10-11 23:59+08
```

### Buyer Side

Store API (the calls the storefront makes; a cart with one «Ингалятор портативный», 3 614 ₽):

```
no code            item_total 3614    discount 0      total 3614
TEST10             item_total 3252.6  discount 361.4  total 3252.6
removed            item_total 3614    discount 0      total 3614
NOSUCH1            400 «The promotion code NOSUCH1 is invalid»
OLD15 (expired)    200, not applied, no error          total 3614
test10 (lowercase) 400 «The promotion code test10 is invalid»
MINUS300           item_total 3314    discount 300    total 3314
TEST10 + MINUS300  discount 631.4 (codes stack)        total 2982.6
```

Storefront (cherkashino-ru.localhost:8700):

| Step | Seen | Shot |
|---|---|---|
| Cart, no code | «Итого 3 614,00 ₽», link «Добавить промокод» above the totals | 12-shop-cart-no-code.png |
| `TEST10` → «Применить» | green badge «TEST10 (10%)», «Скидка − 361,40 ₽», «Итого 3 252,60 ₽» | 13-shop-cart-test10-applied.png |
| Trash icon next to the badge | badge gone, «Итого 3 614,00 ₽» | 14-shop-cart-test10-removed.png |
| `NOSUCH1` | «Что-то пошло не так. Пожалуйста, попробуйте ещё раз.» (finding 3) | 15-shop-cart-wrong-code-message.png |
| `OLD15` (campaign ended 11.10) | field cleared, no message, total unchanged (finding 2) | 16-shop-cart-expired-code-OLD15.png |
| `test10` | the same generic message (finding 4) | 16a-shop-cart-lowercase-test10.png |
| `MINUS300` | «MINUS300 (300,00 ₽)», «Скидка − 300,00 ₽», «Итого 3 314,00 ₽» | 17-shop-cart-minus300-applied.png |
| Checkout, code entered in the cart | the code is carried over: «1 товар 3 614,00 ₽», «Скидка − 361,40 ₽», «Итого 3 252,60 ₽», «Добавить промокод» under the totals | 18-shop-checkout-test10-totals.png |
| Checkout with address and «Почта России — до отделения» | «Доставка 410,00 ₽», «Итого 3 662,60 ₽» | 18a-shop-checkout-filled-test10.png, 18a-shop-checkout-totals-before-payment.png, 18b-shop-checkout-payment-step.png |

The cart was filled through the Store API with the shop's publishable key and the storefront's own `_medusa_cart_id` cookie, so each run starts from one known basket (one «Ингалятор портативный»). Every code was typed into the storefront's field in the browser.

### Robokassa Amount

Robokassa on the stand is in test mode (`tenant_integration_secret` robokassa `is_test = true`). Nothing was paid, and the browser aborted every request to `*.robokassa.ru`.

The guest checkout opens «Способ оплаты» only after the buyer confirms the address (with «Область»), the delivery and the contacts in the sheets. I did not drive the whole form. The signed request was read instead from the cart's Robokassa payment session (`POST /store/payment-collections/:id/payment-sessions`, provider `pp_robokassa_robokassa`), whose `data.payment_url` is what the pay button re-reads at the click (`payment-button/providers/robokassa.tsx`, `handlePayment`).

| Cart | Items after TEST10 | Delivery | Cart total | Session amount | `OutSum` | `IsTest` | Signature |
|---|---|---|---|---|---|---|---|
| cart_01M4QFJFMYYCF48C1Y3946EDMR | 3 252,60 | 410 (Почта России — до отделения) | 3 662,60 | 3 662,60 | 3662.60 | 1 | 64 chars |
| cart_01M4QEH757399RZ2CK09RYBS2S (API run) | 3 252,60 | 385 (first option, СДЭК) | 3 637,60 | 3 637,60 | 3637.60 | 1 | 64 chars |

The endpoint is `https://auth.robokassa.ru/Merchant/Index.aspx`. `OutSum` equals the discounted cart total, shipping included, in both runs. Shot: 19-robokassa-request-outsum-check.png, next to 18a-shop-checkout-totals-before-payment.png showing the same cart's «Итого 3 662,60 ₽».

## Findings (Not Fixed Here, Ivan Decides)

1. **Fixed-amount codes cannot be created without a workaround.** On «Скидка на сумму заказа» and «Скидка на товары» the value field is disabled and labelled USD.
   Cause: the create form asks `GET /tenants/promotions/null/rules?promotion_type=standard&application_method_type=fixed…` for the required rules of a promotion that is not saved yet. The tenant route `[id]/[rule_type]/route.ts` under [promotions/](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t-2026-10-12-07-promo-stand/apps/backend/src/api/tenants/promotions/) runs `assertOwnedPromotion(req, "null")` before the upstream handler and answers 404 «Promotion with id or code: null was not found» (measured). The upstream handler (`@medusajs/medusa` 2.19, `api/admin/promotions/[id]/[rule_type]/route.js`) tolerates a missing promotion and returns the disguised required `currency_code` rule. Without that rule `application_method.currency_code` stays empty, and the panel's `CurrencyInput` is `disabled={!currencyCode}`.
   Proposed fix: skip the ownership check when `req.params.id === "null"` (no promotion is read, the answer comes from the static attribute map), with a unit test. The panel then shows the required «Currency Code» row, as upstream does.
2. **An expired code is silently ignored.** `OLD15` after its campaign end answers 200 with no promotion on the cart. The storefront's `DiscountCode` shows a message only on a thrown error, so the buyer sees nothing.
   Proposed fix: after the update, compare the requested code with the cart's promotions and show the existing «Промокод недействителен или истёк.» (`Errors.invalidDiscount`, already in all catalogs). This is one change with finding 3.
3. **A wrong code gets only a generic error.** The buyer reads «Что-то пошло не так. Пожалуйста, попробуйте ещё раз.» (shot 15, and 16a for `test10`).
   Cause: the storefront already has the right text, `Errors.invalidDiscount` «Промокод недействителен или истёк.», chosen by `resolveErrorKey` when the message matches `/promotion|discount|…/` (`lib/util/error-messages.ts`). `DiscountCode` calls the server action `applyPromotions` and reads the thrown error's message. In a production build Next.js replaces a server action's thrown message with a redacted one carrying a digest, so the pattern never matches and the key falls back to `generic`. The storefront log shows the original: `⨯ Error: The promotion code NOSUCH1 is invalid … digest: '2741758231'`.
   Proposed fix: let `DiscountCode` call a server action that catches the error and RETURNS it, as the existing `submitPromotionForm` in `lib/data/cart.ts` already does. The message then survives production and maps to «Промокод недействителен или истёк.» The same action can return `invalidDiscount` when the requested code is absent from the updated cart, which covers finding 2.
4. **Codes are case-sensitive.** `test10` is «invalid» while `TEST10` exists. Proposed fix: upper-case the code in the panel on save and in the storefront before `applyPromotions`.
5. **No minimum order amount.** The rule attributes offered for `rules` are customer group, region, country, sales channel and currency (`GET /tenants/promotions/rule-attribute-options/rules`, measured). Medusa 2.19 has no cart-subtotal promotion rule. Proposed fix: a «Минимальная сумма заказа» field in the panel stored on the promotion (metadata), and a check where promo codes are applied to a cart (a workflow hook or a middleware on `POST /store/carts/:id` with `promo_codes`). A small feature, Ivan's call.
6. **English labels in «Акции».** Rule attributes (Customer Group, Region, Country, Sales Channel, Currency Code), «Select Operator», «Equals», currency names, and on the code card «Standard», «Across», «Not part of a campaign», «Add to Campaign». The card also shows the method («Промокод») under the row label «Кампания». Shots 08c, 07, 09.
7. **Codes stack** (TEST10 + MINUS300 = 631,40 ₽ off). No «do not combine» switch exists. Recorded as a fact for Ivan, not as a defect.

## Hand-In

PR_SECTION

## Time

Estimate 25–65 min (lead, size M). Actual: TIME_SECTION.
