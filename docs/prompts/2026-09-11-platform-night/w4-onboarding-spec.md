[AGENT: w4-onboarding-spec] [MODEL: sonnet] [DIR: /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform]

# W4 — Spec: onboarding after payment (upready.dev → polar.sh / tribute → account + purchase → one-time link → wizard → shop)

You are a product architect writing a SPEC, not code. Tonight nothing of this is implemented; the
owner decides the forks in the morning. Facts about external services come from their live documentation
fetched now (WebFetch), never from memory; every fetched page is saved as a source file.

## Read first

1. `docs/multitenancy/2026-09-11-night-2-platform-brief.md` — part B1 verbatim (Ivan's words, in Russian,
   are DATA: quote them, do not translate them away), and the «Что уже есть» section.
2. `docs/multitenancy/admin-tenants-api-contract.md` — what the platform API and `createTenantWorkflow`
   already provide (the wizard ends by calling the same workflow with a password-registered admin, exactly
   as `POST /admin/tenants` does).
3. `apps/backend/src/workflows/tenant/create-tenant/index.ts`, `src/api/tenants/route.ts`,
   `src/modules/tenant/models/*.ts` — what a tenant is today.
4. The tenant panel's public layout, so the wizard has a home: `ls apps/tenant-panel/src` — if the app is
   not on this branch, say so and describe the wizard as a route of `apps/tenant-panel` by name only.
5. The upready.dev site repository: search `~/upready/projects/` (`ls ~/upready/projects`, grep for
   `upready.dev` in package.json / README of candidates) and record the path you found, or «not found».

## Fetch (save each as `artifacts/research/2026-09-11-onboarding-payments/source-<N>-<slug>.md` with a
`# Source <url>` / `# Fetched <ISO>` / `# Topic` header and the extracted facts — not the whole page)

- polar.sh: webhooks (event names for a successful order/subscription, payload shape, signature header
  and verification algorithm, retry policy), checkout links / success URL with query parameters, customer
  identity fields (email, external id), sandbox.
- tribute (Telegram payments, tribute.tg): webhooks or API for a completed payment, payload fields
  (telegram user id, amount, product), signature/verification, redirect after payment, test mode.
- If a page cannot be fetched, write the URL and the failure into the source file — no guessing.

## Deliverable — `docs/multitenancy/onboarding-spec.md` (Russian, headings below; English identifiers)

1. **Цепочка** — sequence from upready.dev → tariff → checkout (polar / tribute) → webhook → account +
   purchase → link/redirect with one-time token → wizard `/onboarding/:token` → `createTenantWorkflow` →
   auto-login into the panel. A mermaid sequence diagram plus a numbered list.
2. **Модель `platform`** (new Medusa module `src/modules/platform`, NOT tonight): `account` (id, email,
   telegram_id nullable, name, created_at), `purchase` (id, account_id, provider ∈ {polar, tribute, manual},
   provider_event_id UNIQUE, provider_customer_id, plan, status ∈ {paid, refunded, expired}, paid_at,
   amount, currency, raw payload), `onboarding_token` (id, purchase_id, token (random 32 bytes, hashed
   at rest), expires_at, used_at), link account ↔ tenant 1:N. Field-by-field tables, and the JSON Schema
   of `purchase` as a fenced block.
3. **Вебхуки** `POST /webhooks/polar`, `POST /webhooks/tribute` — signature check exactly as the
   fetched docs say (header names, algorithm, secret source), idempotency by `provider_event_id`, retries
   and what happens on a duplicate, what the handler creates and in which order, and the failure paths
   (unknown plan, refund, duplicate email with an existing account).
4. **Ссылка и страница «оплата прошла»** — the contract for the upready.dev site: URL format,
   parameters, when the redirect happens vs when a link is sent (email / Telegram), TTL of the token,
   what the page shows when the token is used or expired.
5. **Мастер** in `apps/tenant-panel` (PublicLayout): step 1 shop name + handle (pre-filled from the
   purchase / email; handle rule from `src/api/tenants/validators.ts`), step 2 contacts (email from the
   account), step 3 currency / region / language (defaults from the plan), finish → password set → login.
   A table: field · pre-filled from · shown / hidden · editable later in the panel. Hidden: warehouse,
   shipping options, publishable key (provisioned automatically).
6. **Что уже есть и что переиспользуется** — `createTenantWorkflow`, the admin-side password
   registration from the contract, `POST /auth/tenant/emailpass`.
7. **Развилки для Ивана** — a numbered list, each with: the question in one sentence, options (2–3),
   your recommendation with one reason. Required forks: account identity (email vs telegram id vs both);
   what a plan grants (1 shop / N / duration, renewal); hard vs soft delete of a tenant and the retention
   period after deletion; manual «purchase» from the admin (no payment — tests and instalments). Add a
   fork only if the fetched docs force one.
8. **Источники** — the list of source files with URLs and fetch timestamps.

Length target: 250–450 lines. No code beyond schemas and route signatures. Do not create tasks or
questions in HANDOFF — the orchestrator does that from your §7.

## Rules

- No git commit/push/add. Write only the spec file and the source files named above.
- Do not ask; decide, record decisions in your progress file, continue.
- Progress: `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/.ai/progress-w4.md` +
  `node ~/upready/.ai/scripts/orchestrator.mjs emit --task plat-w4-onboarding-spec --kind progress|done|blocked --summary "…" --files "…"`.

## Return value (final message, under 20 lines)

```
STATUS: done | partial | blocked
FILES: <spec path>, <n> source files under artifacts/research/2026-09-11-onboarding-payments/
SITE_REPO: <path or not found>
FORKS: <n> (titles, one line each)
FETCH_FAILED: <urls or none>
OPEN: <what is missing and why>
```
