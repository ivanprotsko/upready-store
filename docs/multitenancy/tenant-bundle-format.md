# Tenant export bundle — `upready.tenant-bundle/v1`

Owner: W3 (platform night, 11→12.09.2026). Produced by `exportTenantWorkflow`
(`apps/backend/src/workflows/tenant/export-tenant/index.ts`), validated against
`bundle.schema.json` next to it (JSON Schema draft 2020-12, checked with `ajv`
in the seam test `integration-tests/http/tenant-export.spec.ts`). Consumed by:

- `POST /admin/tenants/:id/export` (`src/api/admin/tenants/[id]/export/route.ts`)
  — streams the bundle as gzip JSON, headers per
  `docs/multitenancy/admin-tenants-api-contract.md` §3/§6.
- `node scripts/tenant-export.mjs <handle> [--out <dir>]` — container access,
  no HTTP credentials, spawns `npx medusa exec ./src/scripts/tenant-export.ts
  <handle> <outDir>`.

It is the one artifact behind two later specs (detaching a tenant into a
standalone Medusa, and per-tenant backup), so every field here is either
copied straight from a `query.graph` result or explicitly `null`/`[]` when the
tenant has none — nothing in the bundle is invented.

## Top level

| Field | What it is |
|---|---|
| `format` | Always the literal `"upready.tenant-bundle/v1"`. |
| `exported_at` | ISO timestamp of the run, not of the data. |
| `source.backend_version` | `@medusajs/medusa` version of the backend that produced the bundle. |
| `source.tenant_id` | The tenant this bundle is for. |
| `tenant` | `{ id, handle, name, metadata }` — the tenant row itself. |
| `admins` | Tenant admins: `{ id, email, first_name, last_name }`. **Never a password hash** — the auth identity's provider data is not exported. |
| `sales_channel` | `{ id, name, is_disabled }` or `null` if the tenant's channel was deleted (the tenant row survives that, see contract §4). |
| `api_key` | `{ id, title, type, token }` or `null`. The token is a **publishable** key — public by design, not a secret (contract §6). |
| `warehouse.stock_locations` | The tenant's stock location(s) with address, fulfillment sets, service zones and shipping options (+ their prices and shipping profile id). One location per tenant on this branch (`provisionTenantWarehouseWorkflow`), but the shape is an array. |
| `products` | Full product graph: variants, options, prices, images, tags, type, collection, categories, and each variant's linked inventory items. |
| `inventory` | Inventory items (`id`, `sku`, `title`, `stocked_quantity`, `reserved_quantity`, `location_levels`) referenced by the tenant's variants, deduplicated by id. This is the same data embedded under `products[].variants[].inventory_items[].inventory`, pulled to the top level for a flat read. |
| `categories` | Product categories referenced by the tenant's products, deduplicated. **No owner link table exists on this branch** (`tenant_product_category` — the panel branch `feat/mt-panel-2` adds it); until then "referenced by the tenant's own products" is the tenant's category set, which is the same answer for a tenant whose categories are not shared with another tenant. |
| `collections` | Product collections referenced by the tenant's products, deduplicated. |
| `customers` | Customers of the tenant's orders, with addresses (`*addresses`), deduplicated by `order.customer_id`. A tenant with no orders has `[]`, not every registered auth identity. |
| `orders` | Full order graph, as history: items (+ tax lines, adjustments, variant), shipping address, billing address, shipping methods, payment collections (+ payments, refunds, captures), fulfillments. |
| `regions` | Regions referenced by the tenant's orders (`order.region_id`), as reference data — not scoped to the tenant, since a region is shared store-wide infrastructure the order merely points at. |
| `files` | `listTenantFiles(container, tenant_id)` from the shared helper `src/tenant-files/index.ts` (owner W2) — every object under `tenants/<tenant_id>/`. |
| `pages` | **Always `null` on this branch.** Content pages / home config live on the panel branch (`feat/mt-panel-2`), not `feat/mt-platform`. A future export version that merges both branches replaces this with the real array; the schema's `manifest.counts` has no `pages` key for the same reason. |
| `manifest.counts` | One integer per top-level array/warehouse field: `admins`, `products`, `inventory`, `categories`, `collections`, `customers`, `orders`, `regions`, `files`, `stock_locations`. |
| `manifest.bytes` | `Buffer.byteLength` of the bundle's JSON serialisation, uncompressed. |

## What "reference data" means here

Two sections are not filtered to rows the tenant *owns* the way products and
orders are, because nothing in the schema records tenant ownership of them:

- **`regions`** — a region is store-wide infrastructure (shared currency,
  countries, tax settings). The bundle exports the regions the tenant's own
  orders actually reference, not every region on the backend, but a region
  itself is not "the tenant's" the way a product is.
- **`categories`/`collections`** — same reasoning, narrowed to what the
  tenant's own products reference (see the table row above for the missing
  link table).

A restore or a detach reading this bundle treats these two sections as
reference data to look up or recreate on the target backend, not as rows to
re-parent to the tenant.

## Empty is `[]`, not missing

Every array field is present even when the tenant has zero rows of that kind:
a tenant with no orders yet gets `"orders": []`, `"customers": []`, not an
omitted key. `manifest.counts` follows the same rule — a `0` there is a real
count, not the absence of the section. This is what the schema's
`required` list on the top-level object enforces.

## Measured on the stand

`node scripts/tenant-export.mjs acme` against
`postgres://ivanprotsko@127.0.0.1:5433/upready_store_mt` (this worktree's
stand DB, tenants `acme`, `globex`, `initech`), read-only:

```
counts:
  admins                1
  products              9
  inventory             0
  categories            0
  collections            0
  customers              4
  orders                  6
  regions                 1
  files                   0
  stock_locations         1
bytes (uncompressed): 48886
bytes (gzip):         11433
elapsed:              0.34s
```

`inventory: 0` reflects the stand's own data, not a query bug: the tenant's
products were created through `POST /tenants/products` with
`manage_inventory: false` (the same default the seam test's `productBody`
uses), so no variant on this tenant has a linked inventory item to export.
`categories: 0` / `collections: 0` likewise — the acme catalog on this stand
was not assigned either. `files: 0` — no admin has uploaded a file under
`tenants/<acme id>/` yet. All five are correctly empty, not silently dropped:
each is still a real key in `manifest.counts`.
