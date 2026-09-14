# Piece 2: backend `/tenants/*` in Admin shape + seam tests

Read `artifacts/prompts/2026-09-11-tenant-panel-common.md` in your worktree first, then
`docs/tenant-panel/api-contract.md` (this is your spec; implement all of it), then `AGENTS.md`.

Worktree: `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-panel-backend` (branch
`feat/mt-panel-backend`). Piece id for emit: `mt-panel-2`. Work only under `apps/backend`.
Your own backend instance for live checks: `cd apps/backend && PORT=9024 npx medusa develop
> /tmp/mt-panel-2-backend.log 2>&1 &` (the `.env` is already in place; same database as the
stand, so the three tenants and their data exist). Seam tests use `PORT=9031`.

## Existing code to read before writing

- `apps/backend/src/api/middlewares.ts`, `apps/backend/src/api/tenants/**` (5 routes),
  `apps/backend/src/workflows/tenant/*`, `apps/backend/src/links/tenant-*.ts`,
  `apps/backend/src/modules/tenant/**`.
- How the Admin does it: `apps/backend/node_modules/@medusajs/medusa/dist/api/admin/products/route.js`
  and `middlewares.js` + `query-config.js` + `validators.js` in that folder; same for
  `admin/orders`, `admin/sales-channels`, `admin/regions`, `admin/price-preferences`,
  `admin/product-types`, `admin/product-tags`, `admin/collections`, `admin/shipping-profiles`,
  `admin/product-options` (if present) and `admin/uploads` (multer usage).
- The seam test file `apps/backend/integration-tests/http/tenants.spec.ts` (16 tests, all green
  today; keep them green).

## Deliverables

1. Every route in the contract, under `apps/backend/src/api/tenants/**`, with the validators and
   query configs wired in `middlewares.ts` through `validateAndTransformQuery`. Keep the current
   isolation guarantees and comments; extend, do not rewrite. Reuse Medusa's Admin validators
   (import from `@medusajs/medusa/api/admin/<resource>/validators` and `.../query-config`, the
   same way `AdminCreateProduct` is already imported).
2. Seam tests in `tenants.spec.ts`, same commit as the code: for `GET /tenants/products` and
   `GET /tenants/orders` the Admin shape (`count`, `offset`, `limit` present, `limit=1` returns one
   row with `count` still the total, `q` filters by title, `fields` narrows), the isolation path
   for every tenant-scoped route (tenant B: `count: 0`, 404 on tenant A's product id for GET and
   DELETE, 404 on tenant A's sales channel id), `GET /tenants/store` carries the tenant's name and
   channel id, one test per reference list asserting the shape. Reuse the file's existing helpers.
3. `docs/tenant-panel/api-contract.md`: if reality forced a deviation (a validator that does not
   exist, a shape that differs), edit the contract to match what you shipped and say so in the
   report. The panel is written against this document.

## Verification (report every command with its return code)

- `cd apps/backend && npx tsc --noEmit` → rc 0; `npx medusa lint` → rc 0.
- `cd apps/backend && DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9031 npm run test:integration:http > /tmp/mt-panel-2-tests.log 2>&1`
  → rc 0; paste the summary lines (tests passed/failed count).
- Live on your instance (9024), with a token from `POST /auth/tenant/emailpass` for
  `admin@acme.test` and for `admin@globex.test`:
  `GET /tenants/products?limit=2&offset=0&fields=id,title,handle,status,*collection,*sales_channels,variants.id,thumbnail`
  → acme `count` 4 and 2 rows, globex `count` 2; `GET /tenants/products?q=<an acme title>` → 1;
  `GET /tenants/orders?limit=20` → acme has the orders placed on :8000, globex `count` 0 (or its own
  only); `GET /tenants/store` → `name` = `Acme`; `GET /tenants/sales-channels` → 1 row;
  `GET /tenants/regions`, `/product-types`, `/product-tags`, `/collections`,
  `/shipping-profiles`, `/price-preferences` → 200 with the plural key and `count`;
  `DELETE /tenants/products/<globex product id>` with the acme token → 404, and the product still
  exists for globex afterwards. Paste the status codes and counts. Do not delete or create products
  on the shared database beyond what the tests create in their own throwaway database.
- Kill your 9024 instance before finishing.
