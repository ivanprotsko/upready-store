[AGENT: w1-admin-api] [MODEL: sonnet] [DIR: /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform]

# W1 — Admin tenants API + soft-delete workflow + seam tests

You are a backend engineer on a Medusa 2.19 app (`apps/backend`, pnpm workspace, TypeScript). Tonight
you implement the platform staff's API for managing tenants (shops) and their admins, plus the
soft-delete workflow. Another worker (W7) builds the Admin UI against the SAME contract in parallel,
W2 builds the tenant-files helper, W3 the export. Work only inside your owned paths.

Toolchain verified on this host by the orchestrator (2026-09-11 08:5x WITA): `corepack` at
`/usr/local/bin/corepack`, `corepack pnpm -v` = 10.11.1, node v26.8.1, `pnpm-lock.yaml` lockfileVersion
9.0, dependencies installed in this worktree. The plain `pnpm` on PATH is a different major and refuses
the lockfile — always call `corepack pnpm`; if `command -v corepack` ever fails in your shell, use
`npx -y pnpm@10.11.1` in its place.

## Read first (in this order)

1. `docs/multitenancy/admin-tenants-api-contract.md` — the contract. Implement it exactly; if a fact
   there turns out wrong against `node_modules`, record the discrepancy in your progress file and
   implement what the code allows, keeping the response shapes.
2. `AGENTS.md` (repo conventions: backend keeps semicolons, `medusa lint` gate, test runner facts).
3. `apps/backend/src/modules/tenant/**`, `src/links/tenant-*.ts`, `src/workflows/tenant/create-tenant/**`,
   `src/api/tenants/route.ts`, `src/api/tenants/tenant-scope.ts`, `src/api/tenants/validators.ts`,
   `src/api/middlewares.ts`, `integration-tests/http/tenants.spec.ts` (the seam-test style to copy).
4. Medusa APIs — verify in `node_modules`, never from memory:
   `node_modules/.pnpm/@medusajs+auth@2.19.0*/node_modules/@medusajs/auth/dist/services/auth-module.js`
   (`register`, `updateProvider`, `updateProviderIdentities`, `listAuthIdentities`, `deleteAuthIdentities`),
   `@medusajs+auth-emailpass@2.19.0*/…/dist/services/emailpass.js` (`update` needs `entity_id` = email),
   `apps/backend/node_modules/@medusajs/core-flows/dist/{api-key,sales-channel,auth}/workflows/*.d.ts`
   (`revokeApiKeysWorkflow`, `updateSalesChannelsWorkflow`, `setAuthAppMetadataStep`), and how the
   framework protects `/admin/*` custom routes (search `dist/http` of `@medusajs/framework` and
   `@medusajs/medusa/dist/api/middlewares.js`).

## Deliverables (you own these paths; nobody else writes them tonight)

- `apps/backend/src/api/admin/tenants/route.ts` (GET list, POST create)
- `apps/backend/src/api/admin/tenants/[id]/route.ts` (GET, POST update, DELETE)
- `apps/backend/src/api/admin/tenants/[id]/admins/route.ts` (GET, POST)
- `apps/backend/src/api/admin/tenants/[id]/admins/[adminId]/route.ts` (POST, DELETE)
- `apps/backend/src/api/admin/tenants/validators.ts` (zod schemas), `helpers.ts` (summary builder:
  links → sales_channel / api_key / counts; `archived_at` derived from metadata)
- `apps/backend/src/api/middlewares.ts` — you are the ONLY writer tonight: add the `/admin/tenants*`
  validators and the two archived-tenant gates from contract §4 (`/tenants/*` after authenticate, and
  `POST /auth/tenant/emailpass`). Keep every existing route entry intact.
- `apps/backend/src/workflows/tenant/delete-tenant/index.ts` (+ its own `steps/*` EXCEPT
  `steps/delete-tenant-files.ts`, which W2 writes with the signature from contract §5; import it and call
  it last, guarded by `purge_files`). If the file is not there yet when you first typecheck, wait for it
  (check every few minutes with `ls`), do not create it yourself.
- `apps/backend/src/workflows/tenant/create-tenant-by-admin/**`, `add-tenant-admin/**`,
  `update-tenant-admin/**`, `remove-tenant-admin/**` — workflows with compensations (auth identity
  registered → deleted on failure; email/password change → previous values restored).
- `apps/backend/integration-tests/http/admin-tenants.spec.ts` — seam tests, same style as
  `tenants.spec.ts`, covering at least:
  1. unauthenticated `GET /admin/tenants` → 401; authenticated (create an admin user + login the way
     Medusa's own tests do, or use `api-key` secret — verify in `@medusajs/test-utils` / core-flows how
     to mint an admin session in the runner) → 200 with `count`.
  2. `POST /admin/tenants` with password → 201; then the new admin logs in through
     `POST /auth/tenant/emailpass` → 200 token; `GET /tenants/me` → its tenant; `POST /tenants/products`
     → product visible via `GET /store/products` with the tenant's key.
  3. add a second admin, change its email and password, log in with the new pair → 200, with the old
     pair → 401; remove it; removing the last admin → 400.
  4. `DELETE /admin/tenants/:id` → 200; admin login → 401; old bearer on `/tenants/me` → 401;
     `GET /store/products` with the tenant key → 401; list hides it, `archived=include` shows it.
  5. `POST /admin/tenants/:id` with `handle` → 400; with `metadata.archived_at` → 400.

## Verification you run yourself (report the real output, never the expected one)

```bash
cd /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/apps/backend
npx tsc --noEmit
npx medusa lint
DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9031 corepack pnpm test:integration:http -- admin-tenants > /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/.ai/w1-tests.log 2>&1; tail -40 /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/.ai/w1-tests.log
```

The runner creates its own database; `DB_HOST` must be the literal `localhost`. Do not point anything at
port 9023, 9024 or 5180 (other sessions), and never write to the stand DB `upready_store_mt` directly.
The orchestrator's backend on `:9025` (`medusa develop` from this worktree) restarts on your saves; that
is expected. A lint error blocks `medusa develop` from booting, so keep lint green as you go.

## Rules

- No `git commit`, no `git push`, no `git add` — the orchestrator commits. No new models or migrations
  in `src/modules/tenant` (the migration snapshot is shared with another branch tonight). No new
  dependencies without writing why into your progress file first.
- Do not ask questions; decide, write the decision and its reason into your progress file, continue.
- Progress channel: append dated lines to
  `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/.ai/progress-w1.md` after every
  milestone and run
  `node ~/upready/.ai/scripts/orchestrator.mjs emit --task plat-w1-admin-api --kind progress --summary "<one line>" --files "<comma list>"`;
  final: `--kind done --verify "<the three commands' exit codes>"`; stuck: `--kind blocked`.
- Delete nothing outside the files you created.

## Return value (final message = data for the orchestrator, keep it under 25 lines)

```
STATUS: done | partial | blocked
FILES: <comma-separated paths you wrote>
TSC: rc=<n>   LINT: rc=<n>   TESTS: <passed>/<total> (rc=<n>) log=.ai/w1-tests.log
DECISIONS: <one line each, deviations from the contract included>
OPEN: <what is not done and why>
```
