# Source https://polar.sh/docs/integrate/webhooks/events (redirected from https://docs.polar.sh/integrate/webhooks/events)
# Fetched 2026-09-11T00:45:30Z
# Topic: Polar webhook event names for a successful order/subscription

## Event names relevant to a successful payment

- `order.created` — new order generated (checkout completed, may still be processing)
- `order.paid` — "sent when an order is paid"; "the order is fully processed and payment has been
  received" (confirmed on a second, targeted fetch of the event's own reference page,
  `/docs/api-reference/current/order_paid`) — this is the event to key the onboarding flow off, not
  `order.created`.
- `checkout.created` — checkout session started
- `checkout.updated` — checkout session state changed (covers success and failure alike; a handler must
  branch on the status field inside the payload, not treat every `checkout.updated` as a purchase)
- `subscription.created` — new subscription initiated
- `subscription.active` — subscription is active (first activation or reactivation)
- `subscription.cycled` — subscription entered a new billing period (renewal)

## Payload shape

The fetch tool's summarization could not extract a field-level JSON schema from the docs site (the
reference pages render from an OpenAPI spec that the fetch/markdown conversion did not expand); the
`order_paid` reference page confirmed only the human-readable description above, not the JSON body.
Expected shape by the general Polar webhook envelope convention referenced across the docs (NOT
independently verified field-by-field in this fetch — verify against the OpenAPI spec at
`https://polar.sh/docs/api-reference` or `https://polar.sh/docs/llms.txt` before coding):

```
{
  "type": "order.paid",
  "data": {
    "id": "...",                 // order id
    "status": "paid",
    "customer": { "id": "...", "email": "...", "external_id": "..." | null },
    "product": { "id": "...", "name": "..." },
    "amount": 12345,             // minor units
    "currency": "usd",
    "created_at": "..."
  }
}
```

## Correction after fetch

The onboarding spec should key the "payment succeeded" transition off `order.paid` (for one-time
purchases) and `subscription.active` / `subscription.cycled` (for recurring plans), not off
`checkout.updated`, since the latter also fires on non-success state changes.
