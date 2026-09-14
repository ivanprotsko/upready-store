# Goal

Make one backend able to take money for many shops. Two things, one PR:

1. **Per-tenant integration secrets.** A store owner saves the credentials of their own payment account in the
   panel; the value is encrypted at rest and is resolved per request for the tenant that the cart belongs to.
2. **Robokassa as a payment provider** on top of that store, working end to end in Robokassa's **test mode**:
   the checkout redirects to Robokassa, the customer pays with the test card, the result webhook is validated
   and the order becomes paid.

This closes the open question `q-cherkashina-tenant-secrets`, which today blocks both Robokassa and the
shipping carriers, and it is gap #1 of `{{MISSION_DIR}}/research/upready-store-capabilities.md` §6: the platform
has only the manual provider `pp_system_default`, so no money moves anywhere.

## Scope boundary, stated up front

Going LIVE with real money for the client is blocked outside this repository: Robokassa moderation is not
passed, the merchant's withdrawal is not activated, and the shop's domain is not identified under 569-ФЗ
(`{{MISSION_DIR}}/research/telegram-digest.md` §6, items 1–2). That is not your task and you must not claim it.
Your task is the capability plus a measured test-mode payment. Say exactly that in the PR body.

## Context pointers

- `{{MISSION_DIR}}/research/upready-store-capabilities.md` §3 row «Касса и оплата» (what exists: one-screen
  checkout in `apps/storefront/src/modules/checkout/components/checkout-*`, `api/payment-return` already
  anticipating redirect providers, demo card at `api/demo/pay`) and §2 (how a tenant is isolated: links in
  `apps/backend/src/links/tenant-*.ts`, module `apps/backend/src/modules/tenant`, sales channel per tenant).
- The design fork, with both routes already researched:
  `/Users/ivanprotsko/upready/worktrees/upready-store/feat/cherkashina-tenant/artifacts/docs/2026-09-12-cherkashina-migration/03-migration-report.md`
  «Вопросы Ивану» item 1, and `01-feature-inventory.md` rows 5 and 6. Measured there: the plugin
  `@gorgo/medusa-payment-robokassa@1.0.0` installs on Medusa 2.19 without peer conflicts of its own, and it
  needs the pnpm patch that the old project carries
  (`/Users/ivanprotsko/upready/projects/chrxnasdmds/patches/@gorgo__medusa-payment-robokassa@1.0.0.patch` —
  test-mode status through the validated Result webhook, `testPassword2` in the signature, case-insensitive
  `SignatureValue`). Version `2.0.0-beta.4` instead requires `@gorgo/medusa-integration`, which this repository
  already registers **with an empty `providers` array on purpose** (`AGENTS.md`, Backend conventions: leave the
  array empty).
- The old project's working integration, for reference only, never to be copied wholesale:
  `/Users/ivanprotsko/upready/projects/chrxnasdmds/apps/backend/medusa-config.ts` (payment block),
  `apps/backend/src/api/store/robokassa/success-return/route.ts`, `apps/backend/src/subscribers/order-auto-capture.ts`.
- `{{MISSION_DIR}}/research/chrxnasdmds-digest.md` §1 row «Оплата»: MerchantLogin `OLAVKA`, card + SBP are the
  only methods enabled, receipts under 54-ФЗ are off (`useReceipt` disabled).
- `AGENTS.md` «Cookie `sameSite` on the payment return»: the return from a redirect provider is a cross-site
  top-level navigation and the cart cookie must stay `lax`.

## Step plan

1. **Decide the secret store, in code, on evidence.** Spend the first pass reading
   `@gorgo/medusa-integration` as it is installed in this repository (`node_modules/@gorgo/medusa-integration`)
   plus the Medusa 2.19 payment-provider contract, and answer one question in writing: can a single registered
   provider resolve different credentials per tenant at call time? Write the answer with the file and line you
   read it from into the PR body. Then build the simpler of the two shapes that the evidence allows:
   - a tenant-scoped secret record (module `tenant`, new model, e.g. `tenant_integration_secret`:
     `tenant_id`, `provider`, `payload` encrypted, `is_test`), with AES-256-GCM encryption keyed by a single
     platform env var (`INTEGRATION_ENCRYPTION_KEY`), and a provider whose options are resolved per payment
     session from the cart's tenant;
   - or the same thing expressed through the integration module, if it genuinely supports several instances of
     one provider bound to a tenant.
2. **Never log or return a secret.** The read API returns a masked view (last 4 characters, plus «задано»
   or «не задано»), never the value. Write a test that asserts the API response contains no secret.
3. **Panel screen.** `apps/tenant-panel/src/routes/settings/` — a «Приём оплат» section: choose the provider,
   paste MerchantLogin, password 1, password 2, test password 1, test password 2, a «тестовый режим» switch,
   Save. The form must render the real control while the current value is still loading, never swap it for a
   paragraph, and never overwrite what the owner has typed when the fetch lands (rule 19h: keep a
   `touchedRef`, and carry «not answered yet» as its own state rather than collapsing it into `false`).
4. **Checkout.** The payment step offers Robokassa when the tenant has credentials, redirects to Robokassa
   with a correct signature, and `api/payment-return` brings the customer back to the confirmation page.
   The Result webhook is the source of truth for «paid» — validate its signature server side and never trust
   the browser redirect for the status.
5. **Isolation.** A second tenant without credentials must not see Robokassa at checkout at all, and must not
   be able to read the first tenant's record through any route. Prove both with requests, not by reading code.

## Commands

```
cd apps/backend && npx medusa lint && npx tsc --noEmit && pnpm test:unit
cd apps/backend && DB_HOST=localhost PORT=9199 pnpm test:integration:http
cd apps/tenant-panel && pnpm typecheck && pnpm lint
cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build
```

## Acceptance (measured, quoted in the PR body)

- Owner saves credentials in the panel; a direct `psql` read of the new table shows ciphertext, not the
  password. Quote the query and the (truncated) row.
- On the local stand a cart of that tenant reaches Robokassa's test payment page (quote the redirect URL with
  the signature parameter elided), the test payment completes, the Result webhook is accepted, and the order
  shows as paid in the panel. Screenshots of the payment page, the confirmation page and the paid order into
  `{{WORKTREE}}/artifacts/docs/{{TASK_ID}}/`.
- A second tenant's checkout does not offer Robokassa. Quote the request and the response.
- A request for the secrets of tenant A signed as tenant B returns 403 or 404. Quote it.
- New seam tests pass; quote the `ℹ fail` line of the whole file, not only your own cases.

## What NOT to do

- Do not put any merchant's credentials into `.env`, `deploy/`, a fixture, a test, or the PR body. Never commit
  a real key. The client's real keys live only on the live host and in `~/upready/memory/secrets/`.
- Do not fill `providers: []` of the integration module with a hardcoded list (`AGENTS.md`).
- Do not enable live mode, do not touch Robokassa's moderation, and do not claim the shop can take real money.
- Do not deploy, and do not write to the production database.
