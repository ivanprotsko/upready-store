# Goal

A buyer who orders as a guest and then registers with the SAME e-mail cannot find the order — and the only
recovery path the interface offers is a letter that is never sent.

Measured live (QA q01, 2026-09-15, orders #5 and #6 on `https://cherkashino.shipshift.dev`):

- order #5 placed as a guest with `ivanprotsko+qa1@ivanprotsko.com`;
- an account was then registered on `/ru/account` with the very same e-mail (registration succeeded, «Привет,
  Иван», screenshot `{{MISSION_DIR}}/artifacts/q01-qa-customer/shots/10c-account-after-register-1280x900.png`);
- `/ru/account/orders` shows «Здесь пока ничего нет · У вас пока нет заказов»
  (`{{MISSION_DIR}}/artifacts/q01-qa-customer/shots/10d-account-orders-1280x900.png`, and the same on 390×844);
- the page's own advice is: «Перенос заказа. Не можете найти свой заказ? … Откройте письмо с подтверждением
  того заказа и вставьте ссылку из него сюда» — and the confirmation letter is NOT sent at all
  (backend log `[order-placed-email] … Could not find a notification provider for channel: email`, sibling task
  f02). So the loop is closed with no way out for the customer.

Consequence for Оксана: every guest buyer writes to her in Telegram asking «где мой заказ», and she answers by
hand. For the product: «личный кабинет» is on the InSales Combo feature list we are matched against.

## What to do

Decide, from the code, which of these is right — and say why in your report:

- claim the guest orders of an e-mail when an account is created for that e-mail (Medusa has a customer↔order
  link; check what `POST /store/customers` and the order's `email` field allow), or
- keep the explicit transfer flow but make it reachable without a letter (the buyer is logged in and can prove
  the e-mail), or
- both.

Suspect files: `apps/storefront/src/modules/account/**` (the orders screen and the transfer block),
`apps/storefront/src/lib/data/orders.ts`, `apps/storefront/src/lib/data/customer.ts`, and on the backend
`apps/backend/src/api/store/**` order routes plus the tenant scoping in `apps/backend/src/api/tenants/orders/`.
Whatever you choose, an order must never become visible to an account that does not own the e-mail: prove the
negative with a test that tries it and fails.

## Acceptance (measure — rule 18f)

On the live shop or on a stand that carries the tenant:

1. place a guest order with a fresh e-mail, then register an account with that e-mail;
2. `/ru/account/orders` lists that order with its number, date and total — screenshot 1280×900 and 390×844;
3. opening it shows the items, the delivery method and the address;
4. a second account with a DIFFERENT e-mail does not see that order — paste the attempt and its result;
5. cancel the test order you create (`POST /tenants/orders/<id>/cancel`) and name it in your report.
