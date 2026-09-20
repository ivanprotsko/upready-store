# Goal

Give a shop owner delivery they can actually sell with: named methods, a price that depends on the weight of
the cart and the destination, and a tracking number they type in by hand after they hand the parcel over.

The client agreed to exactly this model and nothing more:

> «По России принимать заказы и оплаты, а отправлять через Валдберис или СДЭК в ручном режиме, верно?» — «да»
> (`{{MISSION_DIR}}/research/telegram-digest.md`, 2026-08-07 #463839)

and for abroad a manual «цена за кг» formula with the tracking number entered by hand (#463691, #463850).
Carrier APIs (ApiShip, СДЭК, Почта России) are explicitly a later task: their credentials are per merchant and
the accounts are not open (`telegram-digest.md` §6 items 4–5).

## Where we stand today

`{{MISSION_DIR}}/research/upready-store-capabilities.md` §3 row «Доставка»: a new tenant gets exactly two flat
options named «<Магазин> pickup» and «<Магазин> courier» from `provisionTenantWarehouseWorkflow`, provider
`manual_manual`, one price per store currency. There is no delivery screen in the panel at all, so re-pricing
happens only through the Admin or the API, and the machine-made names reach the customer.

## Context pointers

- `apps/backend/src/workflows/tenant/create-tenant/index.ts` → `provisionTenantWarehouseWorkflow` — where those
  two options are born.
- `apps/backend/src/api/tenants/shipping-profiles/**`, `shipping-options/**`, `fulfillment-providers/**` — the
  tenant-scoped API that already exists.
- `apps/tenant-panel/src/routes/` — the panel has `orders`, `products`, `categories`, `promotions`, `campaigns`,
  `pages`, `home-settings`, `locations`, `settings`. There is no `shipping`. The nav lives in
  `apps/tenant-panel/src/components/layout/`.
- Checkout: `apps/storefront/src/modules/checkout/components/checkout-*` (one screen with sheets) and the
  pickup-point sheet fed by `GET /store/pickup-points`.
- Order detail in the panel: `apps/tenant-panel/src/routes/orders/**` — fulfillment, shipments,
  mark-as-delivered already exist; the tracking number is what is missing end to end.
- Customer side: `apps/storefront/src/modules/account/components/order-timeline`.
- For the shape of weight tariffs and zones, the old project solved the same problem and its reasoning is worth
  reading, not copying: `/Users/ivanprotsko/upready/projects/chrxnasdmds/apps/backend/src/lib/shipping/`
  (`carrier-router.ts`, `pochta-tariff.ts`) and `docs/kb/chrxn-carrier-router.md` there.

## Step plan

1. Model. A tenant shipping method carries: a name the owner writes, an optional description, a delivery-time
   hint, a set of zones (country, and for Russia a list of regions or «вся страна»), and a tariff that is one of
   flat, per-kilogram with a base, or free above a cart total. Keep it inside Medusa's `shipping_option` where
   it fits (`data` holds the tariff), and add your own table only for what does not fit. Weight comes from the
   variant's `weight` field, which the panel already edits; a cart line with no weight falls back to a per-tenant
   default weight that the owner sets, and that fallback is visible in the panel, not silent.
2. Calculation on the backend, never in the browser. A `calculated` option asks the provider for a price with
   the cart and the address; return a number plus a one-line explanation the checkout can show
   («2,4 кг × 180 ₽ + 150 ₽»).
3. Panel screen `/shipping`: list of methods, create, edit, order, enable/disable, plus the default weight.
   Names must be free text and must reach the customer as written.
4. Checkout: the delivery step lists the owner's methods with their real names, the computed price and the
   delivery-time hint. When no method matches the address, say so in a sentence the buyer understands instead
   of rendering an empty list.
5. Tracking: a field on the order in the panel («Трек-номер» plus the carrier name as free text), saved on the
   fulfillment; the customer sees it in the account order timeline and in the shipment e-mail if one exists.
6. Rename the two provisioned defaults to something a human wrote («Самовывоз», «Курьером») and make the
   provisioning workflow use those names for new tenants, in the tenant's default locale.

## Commands

```
cd apps/backend && npx medusa lint && npx tsc --noEmit && pnpm test:unit
cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http
cd apps/tenant-panel && pnpm typecheck && pnpm lint
cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build
```

## Acceptance (measured, quoted in the PR body)

- On the local multi-tenant stand (`{{MISSION_DIR}}/research/upready-store-capabilities.md` §5 «Порты локально»)
  the owner creates «Почтой России, 1–2 кг» with a per-kilogram tariff and a Russia zone; screenshot of the
  panel screen.
- A cart with two items of known weight shows that method at the arithmetically correct price in checkout, and
  a cart shipping to another country does not show it. Quote both cart weights, both prices and the rule.
- The owner writes a tracking number on the order; the customer sees the same string in their account.
  Screenshots of both sides.
- A newly created tenant gets human-readable default method names. Quote the two names from the API response.
- Seam tests for the price calculation pass; quote the whole file's result line.

## What NOT to do

- No ApiShip, no СДЭК, no Почта России API, no pickup-point network integration, and no carrier credentials.
  If you find yourself needing a token, you have left the scope.
- Do not compute the shipping price in the storefront and send it to the backend.
- Do not delete the existing flat options of shops that already have them: migrate or leave, never drop.
- Do not deploy.
