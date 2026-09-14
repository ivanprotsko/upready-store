# Goal

The moment a customer pays, the shop stops being hers. Measured live on
`https://cherkashino.shipshift.dev` twice (orders #5 and #6, created 2026-09-15 06:48 and 06:57 WITA per
`GET /tenants/orders`, live QA q01): after clicking «Оплатить» the browser lands on
`/ru/order/<id>/confirmed` and renders

- `data-theme="sneakers"`, `data-mode="dark"` on `<html>` — the shop is a light «supplements» store,
- header brand **UPREADY** instead of «ОКСАНА ЧЕРКАШИНА»,
- an English promo strip **«Free shipping over $120 · 30-day returns · every pair ships in 48 hours»** — another
  shop's sneaker terms, in a language the buyer does not read,
- footer **«© 2026 Upready. Все права защищены.»**

Reloading the very same URL (F5) renders it CORRECTLY: `data-mode="light"`, `data-theme="supplements"`, header
«ОКСАНА ЧЕРКАШИНА», no promo strip. So the page itself is fine on a hard load and wrong on the CLIENT-SIDE
transition every real buyer makes — from the `(checkout)` route group into `(main)`.

Screenshots (1280×900 / 390×844):
`{{MISSION_DIR}}/artifacts/q01-qa-customer/shots/08-order-confirmed-1280x900.png`,
`{{MISSION_DIR}}/artifacts/q01-qa-customer/shots/08c-order-confirmed-second-1280x900.png` (wrong, after payment),
`{{MISSION_DIR}}/artifacts/q01-qa-customer/shots/08d-order-confirmed-reloaded-1280x900.png` (right, after reload),
`{{MISSION_DIR}}/artifacts/q01-qa-customer/shots/08-order-confirmed-390x844.png`.

Report of the run: `{{MISSION_DIR}}/artifacts/q01-qa-customer/report.md`, step 8.

## Where to look

- `apps/storefront/src/app/[locale]/layout.tsx` — writes `data-theme` / `data-mode` on `<html>` from the tenant
  request headers the middleware sets. A client-side navigation does not re-run the root layout, so whatever the
  transition hands the client is what sticks: find out why the payload for
  `(main)/order/[id]/confirmed` carries the build profile's theme instead of the tenant's.
- `apps/storefront/src/app/[locale]/(main)/layout.tsx` — `suppressPromoBanner` is computed from
  `getTenantHandle()`; when the handle is null the sneakers promo strip renders and `Nav`/`Footer` fall back to
  the build profile («UPREADY»). That read is the prime suspect on this transition.
- `apps/storefront/src/app/[locale]/(checkout)/layout.tsx` — the group the buyer comes FROM.
- `apps/storefront/src/middleware.ts` — `tenantRequestHeaders`; the matcher is at the bottom of the file.

Do not "fix" it by forcing a full page reload after payment unless you can show in the code why nothing else
can work: a reload is a second blank screen at the worst possible moment.

## Acceptance (measure, do not assume — rule 18f)

On the live shop, place one test order end to end with the demo card (`4111 1111 1111 1111`, `12/30`, `123`),
and on the page you LAND on, without reloading, measure and attach:

1. `document.documentElement.getAttribute('data-mode')` === `light` and `data-theme` === `supplements`;
2. the header text contains «ОКСАНА ЧЕРКАШИНА» and does NOT contain «UPREADY»;
3. `document.body.innerText` does NOT contain «Free shipping over» nor «Upready»;
4. the order number, the item and the total are still shown, and the browser console has no errors;
5. two screenshots, 1280×900 and 390×844, into `{{MISSION_DIR}}/artifacts/<your-task>/`.

Cancel the order you place (`POST /tenants/orders/<id>/cancel` under the owner token, credentials in
`file:///Users/ivanprotsko/upready/.private/upready-store-day-2026-09-16/cherkashino-owner.md`) so the owner's
list stays clean, and say in your report which order number you left behind.
