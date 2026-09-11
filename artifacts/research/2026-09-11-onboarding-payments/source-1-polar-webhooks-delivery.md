# Source https://polar.sh/docs/integrate/webhooks/delivery (redirected from https://docs.polar.sh/integrate/webhooks/delivery)
# Fetched 2026-09-11T00:45:00Z
# Topic: Polar webhook signature verification and retry policy

## Signature header

Polar sends a `webhook-signature` header on every webhook request. For endpoints whose secret was
generated **on/after 2026-09-08**, Polar signs using the **Standard Webhooks** specification, which also
implies the sibling headers `webhook-id` and `webhook-timestamp` (part of that spec, referenced by the
docs but not individually re-quoted in the fetched excerpt). For endpoints whose secret predates that
date ("legacy" secrets), Polar signs using its own **Polar HMAC** scheme.

## Algorithm

**HMAC-SHA256** in both schemes.

- **Polar HMAC (legacy secrets):** "Key is the UTF-8 bytes of the full `whsec_…` string. Base64-encode
  that string before you hand it to a Standard Webhooks library." I.e. to verify a legacy secret with a
  Standard-Webhooks-shaped verification library, base64-encode the raw `whsec_…` secret first.
- **Standard Webhooks (secrets from 2026-09-08 on):** "Pass the `whsec_…` secret to the library as-is,"
  following the Standard Webhooks spec directly (no extra encoding step).
- Polar's own SDKs ship built-in webhook signature validation, so the primary source recommends using
  the SDK rather than re-implementing the HMAC check.

## Retry policy

- Up to **10 retries**, exponential backoff.
- Request timeout: Polar waits **10 seconds** for a response; the docs recommend the endpoint respond
  within **2 seconds**.
- After **10 consecutive failed deliveries** (non-2xx responses), the endpoint is automatically
  **disabled** and stops receiving events until manually re-enabled by the organization.

## Registering an endpoint

Organization settings → add endpoint → destination URL → delivery format (Raw JSON, or Discord/
Slack-specific formats) → subscribe to the desired event types. A secret is generated automatically or
can be set manually.

## Not found in the fetched excerpt

Exact byte-for-byte header list and the signed-content construction formula (e.g. `id.timestamp.body`)
were not reproduced verbatim by the fetch tool's summarization; treat "webhook-id + webhook-timestamp +
webhook-signature, HMAC-SHA256 over `{id}.{timestamp}.{body}`" as the Standard Webhooks convention this
page points to, not as a word-for-word quote — verify against the Standard Webhooks spec
(standardwebhooks.com) or Polar's SDK source before implementing the raw check.
