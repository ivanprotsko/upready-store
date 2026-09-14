[AGENT: w2-tenant-files] [MODEL: sonnet] [DIR: /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform]

# W2 — Tenant files under `tenants/<id>/` + delete-by-prefix + seam test

You are a backend engineer on a Medusa 2.19 app (`apps/backend`, TypeScript, pnpm). Tonight every file
a tenant uploads must land under its own key prefix, and deleting a tenant must remove exactly that
prefix. W1 (admin API + delete workflow) and W3 (export) import your helper, so its FILE and SIGNATURES
come first.

Toolchain verified on this host by the orchestrator (2026-09-11 08:5x WITA): `corepack` at
`/usr/local/bin/corepack`, `corepack pnpm -v` = 10.11.1, node v26.8.1, `pnpm-lock.yaml` lockfileVersion
9.0, dependencies installed in this worktree. The plain `pnpm` on PATH is a different major and refuses
the lockfile — always call `corepack pnpm`; if `command -v corepack` ever fails in your shell, use
`npx -y pnpm@10.11.1` in its place.

## Read first

1. `docs/multitenancy/admin-tenants-api-contract.md` §5 (helper signatures, provider detection) and §4
   (where your step is called).
2. `AGENTS.md` — «Code that is not one of the seven primitives belongs in a sibling directory of its own»;
   backend keeps semicolons; `medusa lint` gates boot.
3. `apps/backend/src/api/tenants/uploads/route.ts` (today a re-export), `src/api/middlewares.ts`
   (the multer middleware reuse for `/tenants/uploads` — do NOT edit middlewares.ts, W1 owns it; the
   existing entry already parses your multipart body), `src/api/tenants/tenant-scope.ts`
   (`getTenantScope`), `medusa-config.ts` (S3 only in production with `S3_BUCKET`).
4. Verify in `node_modules`, not from memory:
   `node_modules/.pnpm/@medusajs+file-s3@2.19.0*/node_modules/@medusajs/file-s3/dist/services/s3-file.js`
   (`sanitizeFilePath`, `upload`, `delete`; key = prefix + dir + name-ulid.ext — directory segments are
   kept), `@medusajs+file-local@2.19.0*/…/dist/services/local-file.js` (`upload`, `delete`, `upload_dir`
   default `static/`), `apps/backend/node_modules/@medusajs/core-flows/dist/file/workflows/upload-files.d.ts`
   and `delete-files.d.ts`, the file module service
   (`@medusajs+file@2.19.0*/…/dist/services/file-module-service.js`) — check whether it can LIST; it most
   likely cannot, which is why the S3 branch needs `@aws-sdk/client-s3` `ListObjectsV2Command` +
   `DeleteObjectsCommand` (chunks of 1000).

## Step 0 — within your first 10 minutes, before anything else

Create `apps/backend/src/tenant-files/index.ts` exporting exactly `TENANT_FILES_ROOT`, `tenantFilePrefix`,
`TenantFile`, `listTenantFiles`, `deleteTenantFiles` with the signatures of contract §5 (bodies may throw
`not implemented` for a few minutes), and
`apps/backend/src/workflows/tenant/delete-tenant/steps/delete-tenant-files.ts` exporting default
`deleteTenantFilesStep` (`createStep("delete-tenant-files", async ({ tenant_id }, { container }) => …)`
returning `new StepResponse({ deleted })`, no compensation — say so in a comment). Emit a progress event
once both files typecheck (`npx tsc --noEmit`). W1 imports them.

## Deliverables (your owned paths)

- `apps/backend/src/tenant-files/index.ts` — real implementation:
  - local provider: prefix dir `static/tenants/<id>/` under `process.cwd()` (read the provider's
    `upload_dir` default; the app does not configure it); list = recursive readdir with sizes and public
    URLs built the way the provider builds them (`<backend_url>/static/<key>`; read how `local-file.js`
    gets its base URL); delete = remove those files and the empty directory; nothing there → `{ deleted: 0 }`.
  - S3 branch (active only when `NODE_ENV=production && S3_BUCKET`): `ListObjectsV2` paginated by prefix,
    `DeleteObjects` in chunks of 1000, client built from the same env vars as `medusa-config.ts`
    (`forcePathStyle: true`). `@aws-sdk/client-s3` is a transitive dependency of `@medusajs/file-s3`: run
    `node -e "require.resolve('@aws-sdk/client-s3')"` from `apps/backend`; if it fails, add it as a direct
    dependency pinned to the exact version `@medusajs/file-s3` uses (`cat node_modules/.pnpm/@medusajs+file-s3*/node_modules/@medusajs/file-s3/package.json`),
    with `corepack pnpm add --filter @dtc/gorgo-medusa-backend @aws-sdk/client-s3@<ver>` from the
    repository root, and write the reason into your progress file. Keep the lockfile change minimal.
- `apps/backend/src/workflows/tenant/delete-tenant/steps/delete-tenant-files.ts` — calls `deleteTenantFiles`.
- `apps/backend/src/api/tenants/uploads/route.ts` — own `POST` handler: `getTenantScope(req)` →
  `uploadFilesWorkflow(req.scope).run({ input: { files: req.files.map(f => ({ filename: tenantFilePrefix(tenant.id) + f.originalname, mimeType: f.mimetype, content: f.buffer.toString("binary"), access: "public" })) } })`
  — copy the exact body/encoding from `@medusajs/medusa/dist/api/admin/uploads/route.js` (read it), keep
  the `{ files: [{ id, url }] }` response. Update the file's doc comment (it currently says files are not
  tenant-scoped).
- `apps/backend/integration-tests/http/tenant-uploads.spec.ts` — seam test in the style of
  `tenants.spec.ts`: register Acme and Globex through `POST /auth/tenant/emailpass/register` +
  `POST /tenants`; Acme uploads a small PNG (multipart, field `files`) → response `url` contains
  `/static/tenants/<acme id>/`; `listTenantFiles(container, acme.id)` has 1 entry and
  `listTenantFiles(container, globex.id)` has 0; then run `deleteTenantFiles(container, acme.id)` →
  `{ deleted: 1 }`, the file is gone from disk, Globex's upload (do one for Globex too) is still on disk.
  The runner's cwd is `apps/backend`, so `static/` lands there; clean up what the test created in
  `afterAll`. If W1's `deleteTenantWorkflow` is already importable when you get there, add one case that
  runs it with `purge_files: true` and asserts the same; otherwise leave that case to the orchestrator
  and say so.
- Also test the S3 branch if `~/upready/.env.keys` carries R2 credentials (`R2_BACKUP_*`): a throwaway
  prefix `tenants/test-<ulid>/`, upload two objects with the SDK, `listTenantFiles`, `deleteTenantFiles`,
  assert the sibling prefix survives — as a standalone script `apps/backend/scripts/tenant-files-r2-check.mjs`
  run once by you (paste its output into your progress file), not as a jest test. No credentials in files.

## Verification (report real output)

```bash
cd /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/apps/backend
npx tsc --noEmit
npx medusa lint
DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9032 corepack pnpm test:integration:http -- tenant-uploads > /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/.ai/w2-tests.log 2>&1; tail -40 /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/.ai/w2-tests.log
```

Ports 9023 / 9024 / 5180 belong to other sessions — never touch them. The stand DB `upready_store_mt` is
never written by you. Files already on the stand without a prefix stay where they are (note it).

## Rules

- No git commit/push/add — the orchestrator commits. No models/migrations in `src/modules/tenant`.
  Do not edit `src/api/middlewares.ts` or anything under `src/api/admin/**`.
- Do not ask; decide, record the decision in `.ai/progress-w2.md`, continue.
- Progress: dated lines in `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/.ai/progress-w2.md`
  + `node ~/upready/.ai/scripts/orchestrator.mjs emit --task plat-w2-tenant-files --kind progress|done|blocked --summary "…" --files "…"`.

## Return value (final message, under 25 lines)

```
STATUS: done | partial | blocked
FILES: <paths>
TSC: rc=<n>   LINT: rc=<n>   TESTS: <passed>/<total> (rc=<n>) log=.ai/w2-tests.log   R2: <ran|skipped: reason>
DEP_ADDED: <@aws-sdk/client-s3@ver | none>
DECISIONS: <one line each>
OPEN: <what is not done and why>
```
