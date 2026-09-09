# Checkout / Order / Account flow map (scout S3)

Repo `/Users/ivanprotsko/upready/projects/upready-store`, branch `dev`, clean tree at scan time.
Scope: what exists today for pickup-point selection, payment, order success/failure and the
account pages, and what Ivan's task 3 ("lay out states … every mockup can be seen, every
interaction scenario walked through") is missing. All paths relative to `apps/storefront/` unless
prefixed `apps/backend/`.

## 1. Top-line verdict

- Checkout, order-success and the whole account area (login/register/forgot-password, overview,
  orders list, order details, addresses, profile) are built and wired end-to-end on real data.
- **Pickup-point selection does not work today even though a "Pickup" shipping option is seeded.**
  The seed data never creates a `fulfillment_set` of type `"pickup"`, so the storefront's own
  `isPickupShippingOption()` check is always `false` (§2).
- **There is no order-failure / payment-declined page at all.** Both failure redirects
  (`?error=payment_failed`, `?error=order_failed`) land on `/cart`, and the cart page never reads
  that query param — the error is silently dropped (§3.3, §4).
- **Stripe is not configured on the backend** (no payment module block in
  `apps/backend/medusa-config.ts`) and the storefront's Stripe key is blank locally, so today the
  store only has one live payment provider: manual (`pp_system_default`), which always authorizes
  and cannot demo a decline (§3, §5).

## 2. Pickup-point selection

| | |
|---|---|
| Renders today | `checkout-shipping-section/index.tsx` draws every shipping option (courier + "Pickup") as an equal card in one `RadioGroup` — no separate "choose a pickup point" step ([`checkout-shipping-section/index.tsx:274-394`](../../apps/storefront/src/modules/checkout/components/checkout-shipping-section/index.tsx#L274-L394)). If the pickup option's fulfillment set were typed `"pickup"`, `checkout-info-rows/index.tsx` would hide the address row and show `t("addressNotNeededForPickup")` instead ([`checkout-info-rows/index.tsx:38,61-99`](../../apps/storefront/src/modules/checkout/components/checkout-info-rows/index.tsx#L38-L99)); `checkout-shipping-section` would also blank the delivery-address fields on selection ([`checkout-shipping-section/index.tsx:204-221`](../../apps/storefront/src/modules/checkout/components/checkout-shipping-section/index.tsx#L204-L221)). |
| Gate that blocks it | `isPickupShippingOption` reads `option.service_zone.fulfillment_set.type === "pickup"` ([`lib/util/fulfillment.ts:3-7`](../../apps/storefront/src/lib/util/fulfillment.ts#L3-L7)). The seed script's only fulfillment set is `type: "shipping"` — never `"pickup"` — created once per region in `seedFulfillment()` ([`apps/backend/src/migration-scripts/lib/fulfillment.ts:49-63`](../../apps/backend/src/migration-scripts/lib/fulfillment.ts#L49-L63)). The "Pickup" shipping option (`code: "pickup"`, free) is seeded inside that same `"shipping"` set, next to "Courier delivery" ([`apps/backend/src/migration-scripts/data/fulfillment/json/shipping-options.json`](../../apps/backend/src/migration-scripts/data/fulfillment/json/shipping-options.json)). Result: the option is selectable and labelled "Pickup", but the app can never tell it apart from a courier option — the pickup-only UI branches never fire. |
| Stock locations | One stock location per **region** (not per shop profile), e.g. `"Washington Warehouse"` / `"Pennsylvania Avenue NW 1600"` for `us` ([`apps/backend/src/migration-scripts/data/regions/json/us.json:5-11`](../../apps/backend/src/migration-scripts/data/regions/json/us.json#L5-L11)), built from `SEED_REGIONS.map(r => r.stock_location)` ([`apps/backend/src/migration-scripts/lib/stock-locations.ts:52`](../../apps/backend/src/migration-scripts/lib/stock-locations.ts#L52)). That one location is reused as both the courier origin and the (non-functional) pickup point — there is no set of **multiple** pickup points to choose from, per profile or otherwise. |
| API fields | `listCartShippingMethods` requests `/store/shipping-options?fields=+metadata` only ([`lib/data/fulfillment.ts:16-30`](../../apps/storefront/src/lib/data/fulfillment.ts#L16-L30)); the core route's own default field set (`id, name, price_type, service_zone_id, shipping_profile_id, fulfillment_provider_id, shipping_option_type_id, metadata`) excludes `service_zone` and any stock-location fields (`apps/backend/node_modules/@medusajs/medusa/dist/api/store/shipping-options/query-config.js`). Even with a real `"pickup"` fulfillment set, the current fetch would still need `fields` widened to `+service_zone.fulfillment_set.type` (already implied by the `StoreCartShippingOptionWithServiceZone` type) plus a stock-location relation to show an address per pickup point — unverified live because the local Medusa backend was not reachable on port 9000 during this scan (`curl` returned `000`); see Open Fork below. |
| Missing for the walk-through | (1) a `"pickup"`-type fulfillment set with its own service zone per demo city; (2) N stock locations with real addresses in that city, linked to that fulfillment set; (3) a shipping option of type pickup per location (today there is exactly one, shared, generic "Pickup" option — no way to pick *which* store); (4) a storefront step that lists those N locations once pickup is chosen (does not exist in any file under `checkout/components/`) and stores the choice (e.g. on `cart.shipping_address` or metadata) so it survives to the order. |
| Honest demo path | Seed a `"pickup"` fulfillment set (`type: "pickup"`) with one service zone and N `stock_location`s per profile city (mirror `seedFulfillment()`'s per-region loop but keyed to the profile, `apps/backend/src/migration-scripts/lib/fulfillment.ts`), one pickup-type shipping option per location, and add a picker to `checkout-shipping-section` (or a new sheet, matching the pattern of `checkout-address-sheet`/`checkout-billing-sheet`) that lists them once `isPickupShippingOption` is true — that flag will then start working with no other code change. |

## 3. Payment

### 3.1 Idle / method selection

`checkout-payment-section/index.tsx` renders one chip per entry of `listCartPaymentMethods(cart.region.id)` ([`lib/data/payment.ts:7-35`](../../apps/storefront/src/lib/data/payment.ts#L7-L35), `GET /store/payment-providers`), labelled from `paymentInfoMap` ([`lib/constants.tsx:11-40`](../../apps/storefront/src/lib/constants.tsx#L11-L40)). Selecting a chip calls `initiatePaymentSession` ([`checkout-payment-section/index.tsx:102-117`](../../apps/storefront/src/modules/checkout/components/checkout-payment-section/index.tsx#L102-L117) → [`lib/data/cart.ts:245-261`](../../apps/storefront/src/lib/data/cart.ts#L245-L261)). `isStripeLike` mounts a Stripe `PaymentElement` inline via `StripePaymentContainer`; `isManual` (`pp_system_default`) needs no extra input ([`lib/constants.tsx:43-75`](../../apps/storefront/src/lib/constants.tsx#L43-L75)).

**What's actually configured**: `apps/backend/medusa-config.ts` has no `@medusajs/medusa/payment` module block at all (`medusa-config.ts:100-120`) — every profile backend runs on Medusa's built-in default provider only, `pp_system_default`. `apps/storefront/.env.local:5` and `.env.template:15` both have `NEXT_PUBLIC_STRIPE_KEY=` empty. So `/store/payment-providers` returns exactly one provider today, and the Stripe branch of every component below is currently unreachable in any of the five stands.

### 3.2 Processing

`PaymentButton` dispatches to a provider button by `isStripeLike` / `isManual` ([`payment-button/index.tsx:66-77`](../../apps/storefront/src/modules/checkout/components/payment-button/index.tsx#L66-L77)); both share `usePlaceOrder()`/`PaymentButtonShell` for the submit-spinner and inline error slot ([`payment-button/shared.tsx`](../../apps/storefront/src/modules/checkout/components/payment-button/shared.tsx)).

- **Manual** (`providers/manual.tsx:9-35`): click → `setSubmitting(true)` → `completeOrder()` immediately. No card fields, no validation, nothing to decline — `pp_system_default` authorizes unconditionally by design.
- **Stripe** (`providers/stripe.tsx:33-103`): click → `stripe.confirmPayment({ redirect: "if_required", return_url: ".../api/payment-return?..." })`. Redirect-required methods leave the page.

### 3.3 Declined

- **Stripe, inline (no redirect needed)**: `error` present and not `isPaymentSettled` → `setErrorMessage(error.message)`, rendered by `ErrorMessage` under the button ([`providers/stripe.tsx:71-89`](../../apps/storefront/src/modules/checkout/components/payment-button/providers/stripe.tsx#L71-L89), [`error-message/index.tsx`](../../apps/storefront/src/modules/checkout/components/error-message/index.tsx)). This path stays on `/checkout` — no dedicated "declined" page.
- **Stripe, redirect flow**: `apps/storefront/src/app/api/payment-return/route.ts` handles the return. `redirect_status === "failed"` → back to `/checkout` with Stripe's own params so the Payment Element can retry (`payment-return/route.ts:56-74`). Any other rejection (`cartId`/`payment_intent` missing, session/secret mismatch) → `rejected()` → `/cart?error=payment_failed` (`payment-return/route.ts:23-49`). If `placeOrder(cartId)` doesn't throw but the cart still didn't convert, → `/cart?error=order_failed` (`payment-return/route.ts:76-85`).
- **Manual**: cannot decline client-side today — `pp_system_default` always authorizes, so there is no code path that reaches a "declined" state for it (§6 compares how to add one).
- **Where `?error=…` is read**: nowhere. `grep -rn "payment_failed" src` finds only the one write site in `payment-return/route.ts`; the cart page (`app/[locale]/(main)/cart/page.tsx:20-24`) calls `retrieveCart()` and renders `CartTemplate` — it never destructures `searchParams`, so both `payment_failed` and `order_failed` are dropped silently. **This is the direct cause of "no failure page exists."**
- **`placeOrder()` itself** ([`lib/data/cart.ts:429-461`](../../apps/storefront/src/lib/data/cart.ts#L429-L461)): `sdk.store.cart.complete()` → if `type === "order"`, redirect to `/order/{id}/confirmed`; otherwise it returns `cartRes.cart` with **no error thrown and no redirect** — a customer whose cart didn't convert (e.g. a real decline once a real gate exists) sees the button just stop spinning, with no message, unless the caller (payment-return route) itself decides that's a failure.

### 3.4 `PaymentTest` badge — currently dead

`payment-test/index.tsx` (an "attention — testing only" badge) is only referenced from the generic `PaymentContainer` in `payment-container/index.tsx:15,72-118`, which in turn is only imported by the unused legacy file `checkout/components/payment/index.tsx` (`grep` for `from "@modules/checkout/components/payment-container"` finds it plus the live `StripePaymentContainer` import in `checkout-payment-section/index.tsx:17` — the *default* `PaymentContainer`/badge path is not). `checkout-payment-section` (the component actually rendered) never shows this badge. Three legacy, unimported siblings exist alongside the live components: `checkout/components/review/`, `checkout/components/shipping/`, `checkout/components/payment/` — confirmed unreferenced by `grep -rln` across `src`.

## 4. Order success / failure

| State | Renders today | Gap |
|---|---|---|
| Success | `/order/[id]/confirmed/page.tsx` → `retrieveOrder(id)` → `OrderCompletedTemplate` (thank-you heading, `OrderDetails`, `Items`, `OrderSummary`, `ShippingDetails`, `PaymentDetails` if `order.payment_collections[0].payments[0]` exists, `Help`) — fully built (`order-completed-template.tsx:1-76`). | None — reachable today via manual payment (always succeeds) at any of the five stands. |
| Failure | No dedicated route or component exists. Both redirect targets are `/cart?error=…`, and the cart page ignores the param (§3.3). | Needs: a query-param read on the cart page (or a new `/checkout/failed` page) that renders a distinct "payment failed" panel, plus a real decline path to reach it (§6). |

## 5. Payment-provider comparison (Ivan's three options)

| Option | What it needs | Evidence |
|---|---|---|
| **(1) Storefront demo card form** — validate a test card client-side, reject a documented number (e.g. any card ending `0000`) before calling `placeOrder()`, route to a failure page | New client component (a card-number input + Luhn/pattern check) inserted where `ManualPaymentButton` sits today; on "declined" input, skip `completeOrder()` and instead `router.push` to a new failure page/panel. No backend change, no env keys, no other stand affected. Reuses the existing `pp_system_default` provider (still authorizes once the form lets a "good" number through) and the existing `ErrorMessage`/redirect plumbing already used by Stripe declines (§3.3). | `providers/manual.tsx:9-35` (today: no gate before `completeOrder()`); `providers/stripe.tsx:71-89` (existing inline-error pattern to copy) |
| **(2) Backend demo payment provider** that declines by rule (e.g. amount ends in `.00` or a metadata flag) | A new Medusa payment-provider module under `apps/backend/src/modules/` (there is precedent: `apps/backend/src/modules/smtp-notification`), registered in `medusa-config.ts` alongside/instead of the missing payment block (`medusa-config.ts:100-120` has none today), redeployed to all five backends. Heavier: new module + config change + a redeploy of every stand's backend, versus a storefront-only change for (1). | `medusa-config.ts:100-120` (no payment module present to extend); `apps/backend/src/modules/smtp-notification` (pattern for a custom module) |
| **(3) Stripe test keys** | Requires (a) adding `@medusajs/medusa/payment` with a Stripe provider block to `medusa-config.ts` on **every** backend, (b) real Stripe test secret/publishable keys distributed via `~/upready/.env.keys` per profile, (c) `NEXT_PUBLIC_STRIPE_KEY` set in each storefront env (`.env.local:5` currently blank). The storefront-side code (`payment-wrapper`, `providers/stripe.tsx`, `payment-return/route.ts`) is already fully built and only needs those keys — the gap is entirely backend config + key provisioning across 5 stands. | `medusa-config.ts:100-120`; `.env.local:5`; `.env.template:15`; `providers/stripe.tsx` (already implemented, currently unreachable) |

**Recommendation**: **(1) storefront demo card form.** It is the only option that touches nothing outside `apps/storefront`, needs no new keys, no backend redeploy across five stands, and reuses the failure-redirect plumbing Stripe's flow already established (`payment-return/route.ts:23-49`, `56-74`) — the only real gap to close alongside it is making the cart page actually render `?error=…` (§3.3), which every option needs regardless. (2) is a fair second choice if Ivan wants the decline logic testable via the Admin/API rather than in storefront code, at the cost of a 5-stand backend redeploy. (3) is the most work for a demo, since Stripe test mode adds no interaction Ivan's walk-through needs beyond what a scripted decline shows, but does add real external-account and key-management overhead across every stand.

## 6. Account pages

| State | Renders today | Notes |
|---|---|---|
| Login | `account/@login/page.tsx` + `default.tsx` → `LoginTemplate` toggles `LOGIN_VIEW.SIGN_IN / REGISTER / FORGOT_PASSWORD` client-side (`login-template.tsx:9-30`) rendering `Login`, `Register`, or `ForgotPassword`. Parallel-route split: `account/layout.tsx` shows `@dashboard` if `retrieveCustomer()` resolves, else `@login` (`account/layout.tsx:11-26`). | Complete. |
| Register | `account/components/register/index.tsx` (104 lines), reuses `signup()` from `lib/data/customer.ts:93`. | Complete. |
| Account overview | `account/@dashboard/page.tsx` → `retrieveCustomer()` + `listOrders()` → `Overview` component. | Complete. |
| Orders list | `account/@dashboard/orders/page.tsx` → `listOrders()` → `OrderOverview`, plus `TransferRequestForm` (leads when the list is empty — the "claimed a guest order" path) (`orders/page.tsx:21-52`). | Complete. |
| Order details | `account/@dashboard/orders/details/[id]/page.tsx` → `OrderDetailsTemplate` (same sections as the confirmation page, minus the thank-you banner) (`order-details-template.tsx:1-76`). | Complete. |
| Addresses | `account/@dashboard/addresses/page.tsx` → `AddressBook` (needs `retrieveCustomer()` + `getRegion()`). | Complete. |
| Profile | `account/@dashboard/profile/page.tsx` → `ProfileName`, `ProfileEmail`, `ProfilePhone`, `ProfileBillingAddress`; `ProfilePassword` is commented out (`profile/page.tsx:43-44`). | `ProfilePassword` component exists (`account/components/profile-password/index.tsx`) but is not rendered — an open fork if Ivan wants it walk-throughable. |

Order status colors/labels (`order-status/index.tsx:14-36`) mirror Admin so a shop owner reads fulfillment/payment status the same way on both sides.

## 7. Backend: emails and payment/fulfillment config

- Payment: no explicit module in `medusa-config.ts` → Medusa's built-in default (`pp_system_default`) is the only provider on every stand today (§3.1).
- Fulfillment: also no explicit module block; `seedFulfillment()` (run by `initial-data-seed.ts`) is what actually creates the one `"shipping"`-type fulfillment set per region (§2).
- Notification/email: `medusa-config.ts:100-117` always registers the local feed provider; SMTP (`smtpProvider`, `medusa-config.ts:14-30`) is added only when `SMTP_HOST` is set. Nine order/customer subscribers exist and fire on real events: `order-placed-email.ts`, `order-completed-email.ts`, `order-fulfillment-created-email.ts`, `order-shipment-created-email.ts`, `order-delivered-email.ts`, `order-canceled-email.ts`, `order-transfer-requested-email.ts`, `payment-captured-email.ts`, `customer-created.ts`, plus `password-reset-email.ts` (`apps/backend/src/subscribers/`). Templates live under `apps/backend/src/emails/` with `lib/` (shared styles) and `i18n/messages` (36 locales) — not read in full for this scan; existence confirmed by directory listing only.

## 8. `messages/en.json` — section key counts (checkout/order/account/cart)

| Section | Keys |
|---|---|
| CheckoutPage | 47 |
| Cart | 3 |
| CartDropdown | 6 |
| CartMismatchBanner | 3 |
| CartSummary | 1 |
| CartTotals | 5 |
| SignInPrompt | 3 |
| PaymentButton | 2 |
| PaymentMethods | 6 |
| PaymentTest | 2 |
| PaymentDetails | 4 |
| OrderCompleted | 2 |
| OrderDetails | 7 |
| OrderSummary | 7 |
| OrdersPage | 2 |
| ShippingDetails | 4 |
| Help | 3 |
| AccountInfo | 5 |
| AccountLayout | 3 |
| AccountNav | 6 |
| AccountOverview | 8 |
| Login | 9 |
| Register | 14 |
| NotFound | 4 |

No section named `Order*Failed`/`PickupPoint*` exists in the catalog — confirming both gaps are unbuilt, not just unrendered.

## 9. Open forks

| Question | Options | Recommendation |
|---|---|---|
| Where does the "order failed" state live? | (a) make the cart page read `?error=` and render a panel there (least code, matches existing redirect targets); (b) add a dedicated `/checkout/failed` (or `/order/failed`) route and repoint `payment-return/route.ts`'s three redirect sites (`route.ts:24,73,81,85`) to it | (a) — every failure redirect already targets `/cart`; wiring the read there is a one-file change plus new `messages` keys, vs. rewriting the return route's contract. |
| Payment-decline mechanism (blocks §5) | Storefront card-gate vs. backend demo provider vs. Stripe test keys | Storefront card-gate (§5) — cheapest, no cross-stand backend/key work. |
| Pickup-point data shape unverified live | The `/store/shipping-options` field list needed to surface a stock-location address per pickup option could not be checked against a running backend — port 9000 was unreachable during this scan (`curl` → `000`); the five stand ports (8028/8061/8070/8081/8110) serve the storefront, not the Medusa API directly | Before building the picker, curl the real backend for one profile (`/store/shipping-options?fields=+service_zone.fulfillment_set.type,+service_zone.fulfillment_set.location.address.*` or equivalent) once a `"pickup"`-type set exists, to confirm the exact field path — do not assume the type declaration (`StoreCartShippingOptionWithServiceZone`) matches what the route actually returns. |
| `ProfilePassword` commented out (§6) | Leave as-is vs. re-enable for the walk-through | Re-enable if Ivan wants every account sub-page interactive; the component already exists (`account/components/profile-password/index.tsx`), just uncomment `profile/page.tsx:43-44`. |
