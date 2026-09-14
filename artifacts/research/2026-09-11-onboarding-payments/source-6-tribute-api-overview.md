# Source https://wiki.tribute.tg/for-content-creators/api-documentation
# Fetched 2026-09-11T00:49:20Z
# Topic: Tribute API overview — auth, base URL, checkout/redirect behavior

## Authentication

Generate an API key from the author dashboard: Settings → API Keys → Generate API Key. Requests
authenticate with an `Api-Key` header (not a bearer token).

## Base API URL

`https://tribute.tg/api/v1/` (confirmed from the products endpoint example on the docs site).

## Payment completion / redirect

The fetched pages (`api-documentation`, `api-documentation/products`) do **not** document a
post-payment redirect URL or a way to pass a custom platform account/customer id at checkout time —
unlike Polar, Tribute's purchase flow runs natively inside Telegram (the buyer taps a `link` / `webLink`
to the product inside the Telegram app or a web view of it; there is no evidence in the fetched docs of
a configurable "redirect to my site after payment" step). Consequence for the onboarding spec: Tribute
purchases cannot use a browser redirect-to-onboarding-wizard step the way Polar can — the onboarding link
must be **delivered to the buyer inside Telegram** (by the Tribute bot itself, or by upready.dev's own
bot reacting to the webhook and messaging the buyer's `telegram_id`), not via an HTTP redirect. This is a
documented asymmetry between the two providers, carried into §4 of the spec.

## Products

Product fields: `id` (integer), `name`, `amount` (price in minor units — cents for USD/EUR, kopecks for
RUB), `currency` (USD, EUR, or RUB — no other currencies documented), `type` (digital / custom /
physical), `status` (pending / approved / rejected), plus creation date, image URL, and supported payment
methods. No field for an external/platform customer id on the product or purchase objects was found in
the fetched excerpt.
