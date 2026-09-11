# Admin tenants API + tenant files — contract for the platform night (11→12.09.2026)

Owner: orchestrator session (feat/mt-platform, session_01MQKTcc6DWhp7ZFrq8zRzFJ). Shared by workers
W1 (API + delete workflow), W2 (tenant files), W3 (export), W7 (Admin UI). A worker that needs a
change here writes the need into its `.ai/progress-<worker>.md`; only the orchestrator edits this file.
Verified on `@medusajs/*` 2.19.0 in `node_modules` (not from memory), 2026-09-11 08:4x WITA.

## 1. Authentication

- Everything under `/admin/*` is protected by the framework's default admin middleware (actor type
  `user`; session, bearer or secret api-key). Custom routes in `src/api/admin/**` inherit it; W1 proves
  it with a `401` test for an unauthenticated call.
- The Admin UI (W7) runs on the same origin as the API (`:9025/app` → `/admin/tenants`), so it calls
  `fetch(path, { credentials: "include", headers: { "content-type": "application/json" } })`. No
  `@medusajs/js-sdk` (not installed in `apps/backend`).
- Tenant admins keep logging in through `POST /auth/tenant/emailpass` (actor type `tenant`); nothing
  here changes that.

## 2. Shapes

```ts
type TenantSummary = {
  id: string;                 // ten_…
  handle: string;             // immutable through this API tonight (it is the technical subdomain)
  name: string;
  metadata: Record<string, unknown> | null;
  archived_at: string | null; // derived: metadata.archived_at ?? null (soft delete lives in metadata)
  created_at: string;
  updated_at: string;
  sales_channel: { id: string; name: string; is_disabled: boolean } | null; // via link tenant-sales-channel
  api_key: { id: string; token: string; revoked_at: string | null } | null;  // via link tenant-api-key (publishable, token is public)
  admins_count: number;
  products_count: number;     // via link tenant-product
  orders_count: number;       // via link tenant-order
};

type TenantAdmin = {
  id: string;                 // tenadm_…
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  updated_at: string;
};

type TenantDetail = TenantSummary & { admins: TenantAdmin[] };
```

## 3. Endpoints (all JSON; errors are Medusa's `{ type, message }`)

| Method + path | Body / query | Response | Notes |
|---|---|---|---|
| `GET /admin/tenants` | `q?`, `limit?` (default 20), `offset?` (0), `archived?` = `exclude` (default) / `include` / `only` | `{ tenants: TenantSummary[], count, offset, limit }` | `q` matches `handle` or `name` (ilike). Order: `created_at desc`. |
| `POST /admin/tenants` | `{ name, handle, admin: { email, password, first_name?, last_name? } }` | `201 { tenant: TenantDetail }` | Registers an emailpass auth identity for the admin (`authModuleService.register("emailpass", { email, password })`, compensated by deleting the identity), then runs `createTenantWorkflow` with that `authIdentityId`. Duplicate handle or email → `400` (Medusa `INVALID_DATA`/`DUPLICATE_ERROR`). Handle rules = `PostTenantCreateSchema` in `src/api/tenants/validators.ts`. Password ≥ 8 chars. |
| `GET /admin/tenants/:id` | — | `{ tenant: TenantDetail }` | `404` when unknown. Archived tenants are readable. |
| `POST /admin/tenants/:id` | `{ name?, metadata? }` | `{ tenant: TenantDetail }` | `metadata` merges (Medusa convention, `null` value deletes a key). `metadata.archived_at` may NOT be set through this route (`400`); it belongs to the delete workflow. `handle` in the body → `400`. |
| `DELETE /admin/tenants/:id` | query `purge_files?=true` | `{ id, object: "tenant", deleted: true, archived_at }` | Soft delete, see §4. Idempotent: deleting an archived tenant answers `200` again with the original `archived_at`. |
| `GET /admin/tenants/:id/admins` | — | `{ admins: TenantAdmin[] }` | |
| `POST /admin/tenants/:id/admins` | `{ email, password, first_name?, last_name? }` | `201 { admin: TenantAdmin }` | Auth identity registered + `tenant_admin` row + `setAuthAppMetadataStep` (actor type `tenant`, value = admin id). Archived tenant → `400`. |
| `POST /admin/tenants/:id/admins/:adminId` | `{ email?, password?, first_name?, last_name? }` | `{ admin: TenantAdmin }` | Password: `authModuleService.updateProvider("emailpass", { entity_id: <current email>, password })` (the provider's `update` requires `entity_id`, which for emailpass IS the email). Email: `tenant_admin.email` + the provider identity's `entity_id` (`authModuleService.updateProviderIdentities({ id: <provider_identity.id>, entity_id: <new email> })`, find it by `listAuthIdentities` filtering `provider_identities.entity_id = old email` and `provider = "emailpass"`). When both are sent: password first (against the OLD email), then the email. Compensation restores the previous values. Admin not of this tenant → `404`. |
| `DELETE /admin/tenants/:id/admins/:adminId` | — | `{ id, object: "tenant_admin", deleted: true }` | The last admin of a tenant cannot be removed → `400`. Deletes the `tenant_admin` row and the auth identity (`deleteAuthIdentities`). |
| `POST /admin/tenants/:id/export` | — | `200`, `content-type: application/gzip`, `content-disposition: attachment; filename="tenant-<handle>-<YYYY-MM-DD>.json.gz"` | Owner W3. Runs `exportTenantWorkflow`, streams the bundle. |

Validators: zod (`@medusajs/framework/zod`) in `src/api/admin/tenants/validators.ts`, wired through
`validateAndTransformBody` / `validateAndTransformQuery` in `src/api/middlewares.ts` (W1 is the only
writer of that file tonight).

## 4. Soft delete — `deleteTenantWorkflow` (`src/workflows/tenant/delete-tenant/index.ts`, owner W1)

Input `{ id: string; purge_files?: boolean }` (default `false`). Steps, in order, each with a compensation
that restores the previous state (except the last one):

1. `tenant.metadata.archived_at = <ISO now>` (module service `updateTenants`; compensation writes the
   previous metadata back). No new model, no migration: the migration snapshot is shared with the panel
   branch `feat/mt-panel-2` tonight.
2. The tenant's sales channel → `is_disabled: true` (`updateSalesChannelsWorkflow.runAsStep`).
3. The tenant's publishable key → revoked (`revokeApiKeysWorkflow.runAsStep`; read its input type in
   `node_modules/@medusajs/core-flows/dist/api-key/workflows/revoke-api-keys.d.ts`). The storefront's
   calls with that key answer `401` from then on (Medusa's publishable-key middleware checks `revoked_at`).
4. Only when `purge_files` is true: `deleteTenantFilesStep({ tenant_id })` from
   `src/workflows/tenant/delete-tenant/steps/delete-tenant-files.ts` (owner W2, §5). No compensation is
   possible for deleted objects, which is why it is the last step and off by default.

Login is closed by MIDDLEWARE, not by touching auth identities (so a decision «restore» stays cheap):

- `/tenants/*` (after `authenticate`): when `req.auth_context.actor_id` is set, resolve the admin's tenant;
  `metadata.archived_at` present → `401 { message: "Tenant is archived" }`. `POST /tenants`
  (registration with an actorless token) is untouched.
- `POST /auth/tenant/emailpass` (login): look the body's `email` up in `tenant_admin`; its tenant archived →
  `401` with the same message, before Medusa's handler runs.

Expected after `DELETE`: tenant admin login `401`; `GET /tenants/me` with an old token `401`;
`GET /store/products` with the tenant's publishable key `401`; `GET /admin/tenants` hides the tenant
unless `archived=include|only`.

## 5. Tenant files (owner W2) — key prefix `tenants/<tenant_id>/`

Verified in `@medusajs/file-s3` 2.19.0 `dist/services/s3-file.js`: `upload()` builds
`fileKey = ${prefix}${parsedFilename.dir ? dir + "/" : ""}${name}-${ulid()}${ext}` after
`sanitizeFilePath` (which only strips leading slashes, `.` and `..` segments and keeps directory
segments). `@medusajs/file-local` does the same with `path.join(parsedFilename.dir, name-ulid.ext)` under
`static/`. So a tenant-scoped key is produced by sending `filename: "tenants/<tenant_id>/<original name>"`
to `uploadFilesWorkflow`; no custom provider is needed.

Shared helper, plain code outside the seven Medusa loader directories (AGENTS.md):

```ts
// apps/backend/src/tenant-files/index.ts  (owner W2; W1 and W3 import from it)
import type { MedusaContainer } from "@medusajs/framework/types";

export const TENANT_FILES_ROOT = "tenants";
/** Always ends with "/" — `tenants/<tenant_id>/`. */
export const tenantFilePrefix: (tenantId: string) => string;
export type TenantFile = { key: string; url: string; size: number | null };
/** Every object under the tenant's prefix (local provider: `static/tenants/<id>/**`; S3: ListObjectsV2 by prefix). */
export const listTenantFiles: (container: MedusaContainer, tenantId: string) => Promise<TenantFile[]>;
/** Deletes exactly the objects under the prefix. Returns how many. Nothing under the prefix = 0, not an error. */
export const deleteTenantFiles: (container: MedusaContainer, tenantId: string) => Promise<{ deleted: number }>;
```

Provider detection mirrors `medusa-config.ts`: S3 is active only when `NODE_ENV=production` and
`S3_BUCKET` is set (then also `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`); otherwise
the local provider with its default `static/` directory under `process.cwd()`. Public URLs keep the
tenant id in the path — accepted (public assets).

`POST /tenants/uploads` (own handler replacing the re-export): tenant id from the authenticated admin
(`getTenantScope(req)` in `src/api/tenants/tenant-scope.ts`), then `uploadFilesWorkflow` with
`filename: tenantFilePrefix(tenant.id) + file.originalname`, `access: "public"`. Response stays
`{ files: [{ id, url }] }` (what the panel reads).

## 6. Export bundle (owner W3)

`exportTenantWorkflow` → `{ bundle: TenantBundle, manifest: { counts: Record<string, number>, bytes: number } }`,
serialised as gzip JSON `tenant-<handle>-<YYYY-MM-DD>.json.gz`. Format documented in
`docs/multitenancy/tenant-bundle-format.md` with a JSON Schema next to the workflow
(`src/workflows/tenant/export-tenant/bundle.schema.json`). CLI: `apps/backend/scripts/tenant-export.mjs
<handle> [--out <dir>]` → spawns `npx medusa exec ./src/scripts/tenant-export.ts <handle> <out>` (container
access without HTTP credentials), prints the counts table and the size in bytes.

## 7. Stand used for acceptance

- Orchestrator's backend: `http://localhost:9025` (`medusa develop` from this worktree, `.env` with
  `PORT=9025`, DB `postgres://ivanprotsko@127.0.0.1:5433/upready_store_mt`, local file provider).
  Admin `:9025/app`, login `admin@upready.dev` / `supersecret`. `:9023` / `:5180` / `:9024` belong to
  other sessions — never stop them.
- Integration tests (`pnpm test:integration:http`) boot their OWN throwaway database through
  `@medusajs/test-utils`; pass `DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko` and a free `PORT`
  (W1 `9031`, W2 `9032`, W3 `9033`). The stand DB is never written by tests.
