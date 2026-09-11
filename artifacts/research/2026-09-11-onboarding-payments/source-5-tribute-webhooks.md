# Source https://wiki.tribute.tg/for-content-creators/api-documentation/webhooks
# Fetched 2026-09-11T00:49:00Z
# Topic: Tribute (Telegram payments) webhooks — event names, signature, retry policy

Found via web search (`docs.tribute.tg` does not exist as a direct URL; the live docs live at
`wiki.tribute.tg`, section "for-content-creators/api-documentation"). This is the Tribute *content
creator subscriptions/donations* product (the one that matches "tribute (телеграм)" in Ivan's brief —
a creator sells access/products to their Telegram audience) — NOT `wiki.tribute.tg/for-shops/api`, which
is a different, e-commerce-shop product under the same brand; do not conflate the two APIs.

## Event names

- Subscriptions: `newSubscription`, `cancelledSubscription`, `renewedSubscription`
- Donations: `newDonation`, `recurrentDonation`, `cancelledDonation`
- Physical orders: `physicalOrderCreated`, `physicalOrderShipped`, `physicalOrderCanceled`
- Digital products: `newDigitalProduct`, `digitalProductRefund`

For upready.dev's use case (selling a shop-creation plan as a one-off or recurring purchase), the
relevant events are `newDigitalProduct` (one-time plan) and `newSubscription` / `renewedSubscription`
(recurring plan), with `digitalProductRefund` / `cancelledSubscription` as the failure/reversal paths.

## Subscription payload `type` field

Subscription-family events carry a `type` field with three possible values: `"regular"` (a new
subscription or a renewal payment), `"gift"` (a gift purchase), `"trial"` (trial activation). A handler
must not treat `"trial"` as a paid purchase for entitlement purposes.

## Signature verification

"Each request contains a `trbt-signature` header with HMAC-SHA256 signature of request body signed with
your API key." The fetched pages did not reproduce the exact byte-for-byte construction (e.g. whether it
signs the raw body bytes or a canonicalized string) — verify against `https://tribute.tg/api/v1/openapi/en`
(referenced by the docs as the source of truth) before implementing the check; do not guess the
construction.

## Retry policy

"On delivery failure, system retries with exponential backoff over ~24 hours: 5min, 15min, 30min, 1h, 2h,
4h, 8h, 8h" (8 attempts total, last two both at 8h spacing per the quoted schedule).

## Refunds / idempotency

Digital-product refund webhooks exist for the case where "a user refunds Stars through App Store, Google
Play, or their bank" — use `purchase_id` to match a refund back to the original purchase and revoke
access. This confirms the payload carries a `purchase_id` field, which is the natural idempotency key
(→ platform `purchase.provider_event_id`) alongside whatever top-level webhook/event id Tribute assigns
(not itemized field-by-field in the fetched excerpt).

## Test/sandbox mode

Not mentioned in the fetched pages. Treat Tribute as having no documented sandbox and confirm directly
with Tribute support before relying on a safe test path; the onboarding spec should not assume one.
