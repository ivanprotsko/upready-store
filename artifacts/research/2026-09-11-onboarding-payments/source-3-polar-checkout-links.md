# Source https://polar.sh/docs/features/checkout/links (redirected from https://docs.polar.sh/features/checkout/links)
# Fetched 2026-09-11T00:46:00Z
# Topic: Polar checkout links, success URL, customer identity passthrough

## Checkout link semantics

A Checkout Link is a "long-lived URL tied to your organization" that does not expire; visiting it opens
a fresh, temporary Checkout Session each time. Always share the Link URL itself in emails / on the
pricing page, never a generated session URL.

## Success URL

You configure a success URL on the link (or the underlying product). It supports one dynamic
substitution token: include `checkout_id={CHECKOUT_ID}` as a query parameter in the success URL you
configure, and Polar replaces `{CHECKOUT_ID}` with the actual Checkout Session id at redirect time — this
is the id the upready.dev site's success page (or the onboarding wizard) needs to correlate the browser
redirect with the webhook that will arrive separately.

## Parameters accepted on the checkout link itself

- **Attribution**, copied onto the session's metadata: `reference_id` (your own internal reference),
  `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`.
- **Prefill**: `customer_email`, `customer_name`, `discount_code`, `amount`,
  `custom_field_data.{slug}` for custom fields defined on the product.
- **Metadata set on the Link** (via the dashboard/API, not a URL query param) "is copied to the generated
  Checkout Session, and propagates to the resulting Order and/or Subscription on success" — this is the
  mechanism to carry a platform-side correlation id (e.g. a pending `purchase.id` created before redirect,
  or the plan slug) through to the webhook payload's `metadata` field.

## Not confirmed in this fetch

The docs excerpt does not explicitly mention a `customer_external_id` query parameter on the checkout
link (only `reference_id` and metadata, both of which land in `metadata`, not on the `customer` object
itself). The spec should therefore treat `reference_id` / link metadata, not a Polar-native
`external_id`, as the carrier for correlating a checkout back to a platform `account`/`purchase` row,
unless a later, more specific fetch of the Customer API confirms an `external_id` settable at checkout
time.
