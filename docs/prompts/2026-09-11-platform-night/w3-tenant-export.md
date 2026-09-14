[AGENT: w3-tenant-export] [MODEL: sonnet] [DIR: /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform]

# W3 — `exportTenantWorkflow`, bundle format, CLI, admin export route, seam test + stand measurement

You are a backend engineer on a Medusa 2.19 app (`apps/backend`, TypeScript, pnpm). The export bundle
is the one artifact behind two later specs (detaching a tenant into a standalone Medusa and per-tenant
backup), so its format must be complete, documented and measured tonight.

Toolchain verified on this host by the orchestrator (2026-09-11 08:5x WITA): `corepack` at
`/usr/local/bin/corepack`, `corepack pnpm -v` = 10.11.1, node v26.8.1, `pnpm-lock.yaml` lockfileVersion
9.0, dependencies installed in this worktree. The plain `pnpm` on PATH is a different major and refuses
the lockfile — always call `corepack pnpm`; if `command -v corepack` ever fails in your shell, use
`npx -y pnpm@10.11.1` in its place.

## Read first

1. `docs/multitenancy/admin-tenants-api-contract.md` §6 and §5 (files helper you import from
   `src/tenant-files` — owner W2; if the file is not there yet, wait a few minutes and `ls` again, do not
   create it; until then develop against the signatures in the contract).
2. `AGENTS.md`; `src/modules/tenant/**`; `src/links/tenant-*.ts`; `src/workflows/tenant/**`
   (`provision-tenant-warehouse` tells you how the tenant's stock location / fulfillment set / shipping
   options hang off its sales channel); `src/api/tenants/products/route.ts` and `orders/route.ts` (how the
   tenant's products/orders are read through `query.graph` on the links); `src/scripts/seed-tenants.ts`
   (a `medusa exec` script — the pattern for `src/scripts/tenant-export.ts`).
3. `apps/backend/node_modules/@medusajs/framework/dist` — `query.graph` (`ContainerRegistrationKeys.QUERY`),
   and the Admin's own product/order query configs in `@medusajs/medusa/dist/api/admin/{products,orders}/query-config.js`
   for the field lists that make a product/order complete (variants, options, prices, images, categories,
   collection, tags, type; order items, shipping methods, payment collections, fulfillments, customer).

## Bundle content (`format: "upready.tenant-bundle/v1"`)

Top level: `format`, `exported_at`, `source: { backend_version: <@medusajs/medusa version>, tenant_id }`,
`tenant` (id, handle, name, metadata), `admins` (id, email, first_name, last_name — never any password
hash), `sales_channel`, `api_key` (id, title, type, token — a publishable key is public), `warehouse`
(stock locations with addresses, fulfillment sets, service zones, shipping options + their prices and
the shipping profile ids), `products` (full graph incl. variants, options, prices, images, tags, type,
collection, categories), `inventory` (inventory items + levels for those variants), `categories` and
`collections` (those referenced by the products; the panel branch adds owner links for them — if a link
table `tenant_product_category` exists read it, if not, the referenced set is enough and you note it),
`customers` (customers of the tenant's orders, with addresses), `orders` (full graph, as history — items,
totals, shipping methods, payment collections, fulfillments), `regions` (the regions referenced by the
tenant's orders and prices, as reference data), `files` (from `listTenantFiles`), `manifest` (`counts` per
top-level array, `bytes` of the uncompressed JSON). Content pages / home config of the panel branch are
not on this branch: write a `pages: null` placeholder and say so in the format doc.

Nothing is invented: every array comes from a query against the real modules; empty is `[]` with a count
of 0.

## Deliverables (your owned paths)

- `apps/backend/src/workflows/tenant/export-tenant/index.ts` (+ `steps/*`): input `{ tenant_id }` or
  `{ handle }`; returns `{ bundle, manifest }`. Read-only, no compensation needed.
- `apps/backend/src/workflows/tenant/export-tenant/bundle.schema.json` — JSON Schema (draft 2020-12) of
  the bundle, validated in the seam test with `ajv` (already a devDependency; `ajv-formats` too).
- `docs/multitenancy/tenant-bundle-format.md` — the format, entity by entity, what is exported, what is
  reference data, what is missing tonight (pages/home config), and the measured numbers from the stand.
- `apps/backend/src/scripts/tenant-export.ts` — `medusa exec` script: args `<handle> <outDir>`; runs the
  workflow, writes `<outDir>/tenant-<handle>-<YYYY-MM-DD>.json.gz`, prints a counts table + bytes
  (compressed and uncompressed) + elapsed seconds.
- `apps/backend/scripts/tenant-export.mjs` — plain Node CLI: `node scripts/tenant-export.mjs <handle> [--out <dir>]`
  → spawns `npx medusa exec ./src/scripts/tenant-export.ts <handle> <outDir>` with cwd `apps/backend`,
  default out dir `apps/backend/.medusa/exports/` (git-ignored? check `.gitignore`; if not, use
  `artifacts/deliverables/tenant-exports/` and add nothing to git yourself).
- `apps/backend/src/api/admin/tenants/[id]/export/route.ts` — `POST`, runs the workflow, answers gzip
  with the headers of contract §3. No middleware change needed (W1 owns `middlewares.ts`; `/admin/*` is
  protected by the framework).
- `apps/backend/integration-tests/http/tenant-export.spec.ts` — register a tenant, create 2 products,
  place nothing (or one order if cheap using the pattern in `tenants.spec.ts`), run the workflow from the
  container, validate the bundle against the schema with ajv, assert `manifest.counts.products === 2`,
  and call `POST /admin/tenants/:id/export` (authenticated as an admin user — see how `tenants.spec.ts`
  or Medusa's own http tests mint an admin) → 200, `content-type: application/gzip`, gunzip → same counts.
- Measurement on the stand (acceptance of the task): from `apps/backend`, run
  `node scripts/tenant-export.mjs acme` against the stand DB (the `.env` of this worktree already points at
  `postgres://ivanprotsko@127.0.0.1:5433/upready_store_mt`; `medusa exec` reads it) and paste the printed
  counts, bytes and seconds into the format doc AND into your progress file. Stand tenants: `acme`,
  `globex`, `initech`. Read-only — the export writes no rows.

## Verification (report real output)

```bash
cd /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/apps/backend
npx tsc --noEmit
npx medusa lint
DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9033 corepack pnpm test:integration:http -- tenant-export > /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/.ai/w3-tests.log 2>&1; tail -40 /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/.ai/w3-tests.log
node scripts/tenant-export.mjs acme --out /Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/artifacts/deliverables/tenant-exports
```

Ports 9023 / 9024 / 5180 belong to other sessions — never touch them. Never write to the stand DB.

## Rules

- No git commit/push/add. No models/migrations in `src/modules/tenant`. Do not edit
  `src/api/middlewares.ts`, `src/api/admin/tenants/route.ts`, `[id]/route.ts` or anything of W1/W2.
- Do not ask; decide, record in `.ai/progress-w3.md`, continue.
- Progress: `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/.ai/progress-w3.md` +
  `node ~/upready/.ai/scripts/orchestrator.mjs emit --task plat-w3-tenant-export --kind progress|done|blocked --summary "…" --files "…"`.

## Return value (final message, under 25 lines)

```
STATUS: done | partial | blocked
FILES: <paths>
TSC: rc=<n>   LINT: rc=<n>   TESTS: <passed>/<total> (rc=<n>) log=.ai/w3-tests.log
STAND_EXPORT: tenant=acme counts={products:<n>,orders:<n>,…} bytes_json=<n> bytes_gz=<n> seconds=<s>
DECISIONS: <one line each>
OPEN: <what is not done and why>
```
