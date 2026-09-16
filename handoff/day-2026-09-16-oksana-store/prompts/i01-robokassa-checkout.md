# {{TASK_ID}} — Robokassa payments for the cherkashino tenant: configured end to end and reflected at checkout (gorgojs integration or the existing module — measured, not assumed)

Worktree `{{WORKTREE}}`, branch `{{BRANCH}}` cut from `{{BASE}}`. Product code task (backend + panel + storefront). Read `handoff/day-2026-09-16-oksana-store/prompts/_ivan-0831.md` first — it holds Ivan's order verbatim, the credential locations (names only) and the stand recipe.

## What exists (measure before deciding)
- upready-store: custom module `apps/backend/src/modules/payment-robokassa/` (already deployed on the live host), `apps/backend/src/api/robokassa/result/route.ts`, `apps/backend/src/api/store/tenant/robokassa.ts`, per-tenant settings `apps/backend/src/api/tenants/payment-settings/` (+ `helpers.ts`, test `integration-tests/http/tenants-payment-settings.spec.ts`), storefront `apps/storefront/src/app/api/payment-return/route.ts`, `src/lib/constants.tsx`, `src/modules/checkout/components/payment*`; gorgojs integration module already in `apps/backend/medusa-config.ts` (`@gorgo/medusa-integration`, `providers: []`, `INTEGRATION_ENCRYPTION_KEY`).
- gorgojs catalog: https://gorgojs.com/ru/medusa-integration-module and https://gorgojs.com/medusa/plugins?integrationModule=true (fetch once, save the text under `artifacts/docs/{{TASK_ID}}/docs/`), npm for the package name/licence.
- chrxnasdmds: its Robokassa code (grep `robokassa` under `apps/backend/src`), env names `ROBOKASSA_MERCHANT_LOGIN`, `ROBOKASSA_IS_TEST`, `ROBOKASSA_HASH_ALGORITHM` and the password names you find there.

## Stage 0 — measurement (deadline 45 minutes)
Run the stand, configure the cherkashino tenant with the TEST credentials from chrxnasdmds `.env`, go through checkout to the Robokassa page and back. Record exactly where it stops (screenshot + log line). Compare the gorgojs Robokassa provider (exists? free or licensed? per-tenant credentials? result/success/fail URLs, signature check, test mode, receipt/fiscalization fields) against the custom module in a 10-row table → `artifacts/docs/{{TASK_ID}}/decision.md`. Rule: if the gorgojs provider is installable now and covers every row the custom module covers, switch to it and remove the custom module; otherwise finish the custom module. Either way Ivan's bar is the same: «настроено и отражено на чекауте».

## Build
- Per-tenant Robokassa credentials in the panel (Settings → Payments), stored encrypted, test/prod switch, secrets never echoed back to the client after save.
- Checkout: Robokassa as the payment method for the tenant; redirect to Robokassa; return page (success/fail) in this storefront's components; `result` webhook verifies the signature and marks the order paid; idempotent on repeated callbacks.
- Unit test for the signature algorithm (both MD5 and the configured algorithm), integration test for the result route, Playwright e2e up to the redirect and back with a mocked return; lint/typecheck green.

## Acceptance
On the stand an order of the cherkashino tenant is paid through Robokassa TEST mode: screenshots (checkout → Robokassa page → return → order status paid in the panel), payment/invoice id in the report; the panel settings form works for a tenant; `git grep -n -i -E "password[12]=|merchant_pass" -- .` prints nothing; `report.md` lists the host env var NAMES the deploy needs and the panel steps, plus `## Экономия`; `report.json` with `secretRef`.
