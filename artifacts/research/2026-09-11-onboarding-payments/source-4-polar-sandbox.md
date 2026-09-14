# Source https://polar.sh/docs/integrate/sandbox (redirected from https://docs.polar.sh/integrate/sandbox)
# Fetched 2026-09-11T00:46:20Z
# Topic: Polar sandbox environment

- Polar's sandbox is "a dedicated server, completely isolated from the production instance", for testing
  integrations without touching live data or processing real payments.
- Separate hosts: web UI at `https://sandbox.polar.sh`, API base at `https://sandbox-api.polar.sh`
  (production API base is `https://api.polar.sh`).
- Sandbox needs its own user account and organization; a production access token cannot be used against
  the sandbox API and vice versa — separate credentials per environment, both stored in
  `~/upready/.env.keys` once created.
- Test payments use Stripe test card numbers under the hood (e.g. `4242 4242 4242 4242`), since Polar's
  payment processing runs on Stripe.
- One documented behavioral difference from production: customer-facing emails in sandbox mode "are only
  delivered to recipients who are members of your organization" — so a sandbox end-to-end test of the
  "we email you a one-time onboarding link" path only works with an email that is a member of the sandbox
  org, not an arbitrary test address.
- Webhook behavior in sandbox vs production was not explicitly documented in the fetched excerpt beyond
  "isolated architecture" — treat webhooks as working the same way (register a sandbox endpoint against
  the sandbox org) but unverified word-for-word in this fetch.
