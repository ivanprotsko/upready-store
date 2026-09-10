# Tenant Panel API Contract (`/tenants/*`)

Written 2026-09-11 by the night-wave architect for task `t-2026-09-11-mt-tenant-panel`.
Two consumers: the backend piece implements it (apps/backend/src/api/tenants), the panel's
`hooks/api/*` in apps/tenant-panel/src consume it. The shapes are the Medusa Admin's own, because
the panel renders the Admin's screen files unchanged and those screens read `count/offset/limit`
and the Admin field names.

## Ground rules

- Every route below sits under the existing `/tenants/*` middleware: `authenticate("tenant",
  ["session", "bearer"])` (apps/backend/src/api/middlewares.ts). No route is reachable without a
  tenant token; that invariant already has a seam test.
- Tenant scope is decided by module links, never by trusting the request: products through the
  tenant-product link, orders through the tenant-order link, the sales channel and publishable
  key through `tenant.sales_channel` / `tenant.api_key` (see GET /tenants/me).
- A tenant with zero linked rows gets an empty page, never "no filter". `id: undefined` in a
  Medusa filter is no filter at all (the bug the current orders route already guards against).
- Query parsing reuses the Admin's own validators and query configs from
  `@medusajs/medusa/api/admin/<resource>/validators` and `.../query-config`, wired with
  `validateAndTransformQuery(<Params>, <listQueryConfig>)` in middlewares.ts, exactly as
  `@medusajs/medusa/dist/api/admin/middlewares` does. Then the route reads `req.queryConfig`
  (fields, pagination) and `req.filterableFields` and adds the tenant's own `id` constraint.
  The read itself goes through `refetchEntities` from `@medusajs/framework/http`, which is the
  Admin's own thin wrapper around `query.graph` and returns `metadata.count/skip/take`.
- Pagination defaults are the Admin validators' own, and they differ per resource because
  `createFindParams` writes a zod default that the query config's `defaultLimit` never overrides:
  products 50, orders 15, most reference lists 20, collections 10.
- List responses: `{ <plural>: T[], count: number, offset: number, limit: number }`.
- Errors: Medusa's `MedusaError` (`NOT_FOUND` for a foreign or missing id, `INVALID_DATA` for a
  bad body). Never leak whether a foreign id exists: foreign = 404, same as missing.

## Routes

### Existing, unchanged

- `POST /tenants` (registration, `allowUnregistered`).
- `GET /tenants/me` → `{ tenant_admin: { id, email, first_name, last_name, tenant: { id, handle,
  name, metadata, sales_channel: { id, name, is_disabled } | null, api_key: { id, token, redacted,
  title, type } | null } } }`.
- `POST /tenants/products` body = `AdminCreateProduct`; the tenant's channel replaces whatever
  `sales_channels` the body carries. Response `{ product }` (status 201).

### Changed

`GET /tenants/products` → `{ products: AdminProduct[], count, offset, limit }`.
Params (Admin's `AdminGetProductsParams` + `listProductQueryConfig`): `limit` (default 50),
`offset`, `order`, `q`, `id`, `status`, `sales_channel_id`, `collection_id`, `category_id`,
`type_id`, `tag_id`, `is_giftcard`, `created_at`, `updated_at`, `fields` (Admin field syntax such
as `id,title,handle,status,*collection,*sales_channels,variants.id,thumbnail,-type,-options,-tags,-images,-variants`,
which is what the product list sends). `sales_channel_id` is turned into an id filter by
`maybeApplyLinkFilter` before the route runs, the way the Admin does it, because a product cannot
be filtered by that column directly. Implementation: read the tenant's product ids through the
link, intersect with any `id` filter, return the empty page when the intersection is empty,
otherwise `refetchEntities({ entity: "product", fields, idOrFilter: { ...filterableFields,
id: ownIds }, pagination })` and take `count` from `metadata.count`. The response rows go through
the Admin's `remapProductResponse`, so `variants[].prices` is where the panel expects it.

`GET /tenants/orders` → `{ orders: AdminOrder[], count, offset, limit }`.
Params (Admin's `AdminGetOrdersParams` + `listTransformQueryConfig` from
`@medusajs/medusa/api/admin/orders/query-config`): `limit` (default 15), `offset`, `order`, `q`, `id`,
`status`, `sales_channel_id`, `region_id`, `customer_id`, `created_at`, `updated_at`, `fields`.
The order list sends `fields` = `DEFAULT_FIELDS` from
`@medusajs/dashboard/src/routes/orders/order-list/const.ts`. Implementation: keep the current
`getOrdersListWorkflow` call, pass `fields` from `req.queryConfig.fields`, `filters` from
`req.filterableFields` plus `id: ownOrderIds`, and `skip/take/order` from
`req.queryConfig.pagination`; with pagination the workflow returns `{ rows, metadata: { count,
skip, take } }`. Mirror `@medusajs/medusa/dist/api/admin/orders/route.js` GET.

### New: tenant-scoped

- `GET /tenants/products/:id` → `{ product }` (fields via `retrieveProductQueryConfig`); 404 when
  the product is not linked to the tenant.
- `DELETE /tenants/products/:id` → `{ id, object: "product", deleted: true }` via
  `deleteProductsWorkflow`; 404 when not linked.
- `GET /tenants/sales-channels` → `{ sales_channels: [the tenant's channel], count: 1, offset: 0,
  limit }` (empty list, count 0, when the link is gone). `GET /tenants/sales-channels/:id` →
  `{ sales_channel }` only for that id, else 404.
- `GET /tenants/product-options` → `{ product_options, count, offset, limit }`: options of the
  tenant's own products. In 2.19.0 `product_option` is many-to-many with products, so the scope is
  the nested filter `products: { id: ownProductIds }`, not a `product_id` column. `product_id`
  stays the query parameter: the Admin's `AdminGetProductOptionsParams` does not declare it and zod
  strips what it does not declare, so `TenantGetProductOptionsParams` in
  `apps/backend/src/api/tenants/validators.ts` extends the Admin's schema with it. The `products`
  relation is dropped from the selected fields, because a non-exclusive option is shared by title
  across the catalog and its `products` would otherwise carry another tenant's rows. Params `q`,
  `id`, `title`, `is_exclusive`, `limit`, `offset`, `order`, `fields`, `product_id`.
- `GET /tenants/store` → `{ store }`: the store row, selected by the Admin's own
  `retrieveTransformQueryConfig` (`id`, `name`, `*supported_currencies`,
  `*supported_currencies.currency`, `*supported_locales` and `*supported_locales.locale` while the
  translation flag is on, `default_sales_channel_id`, `default_region_id`, `default_location_id`,
  `metadata`, `created_at`, `updated_at`), with `name` replaced by the tenant's name and
  `default_sales_channel_id` set to the tenant's channel id. There is no `default_currency_code`
  column in 2.19.0; the default currency is the `supported_currencies` entry whose `is_default` is
  true. The panel's sidebar shows `store.name`; the price grid reads `supported_currencies`.
- `POST /tenants/uploads` (multipart, field `files`, multer memory storage like the Admin's
  `POST /admin/uploads`) → `{ files: [{ id, url }] }` via `uploadFilesWorkflow`. The route
  re-exports the Admin's own `POST` handler, and `middlewares.ts` reuses the Admin's own middleware
  array for it: multer is a transitive dependency of `@medusajs/medusa` and is not resolvable from
  `apps/backend`, so importing it there would mean adding a dependency. On the stands the file
  module falls back to Medusa's local provider (S3 is wired only when `NODE_ENV=production` and
  `S3_BUCKET` are both set), which writes into `apps/backend/static` and hands back a URL on port
  9000 whatever port the backend listens on. A panel that renders that URL shows a broken image
  until the provider is configured; that is a stand configuration gap, not a route gap.
- `GET /tenants/inventory-items` → `{ inventory_items, count, offset, limit }`, restricted to the
  inventory items of the tenant's own variants (own products through the tenant-product link, then
  their variants' `inventory_items.inventory_item_id`). The create form only calls it when the
  "inventory kit" toggle is on. Params are the Admin's `AdminGetInventoryItemsParams`.

### New: read-only reference lists (global data, not tenant-scoped)

Same validators and query configs as the Admin, same response shape, no write verbs:

- `GET /tenants/regions` → `{ regions, count, offset, limit }`
- `GET /tenants/price-preferences` → `{ price_preferences, count, offset, limit }`
- `GET /tenants/product-types` → `{ product_types, count, offset, limit }`
- `GET /tenants/product-categories` → `{ product_categories, count, offset, limit }` (added at integration 2026-09-11: the organize section category combobox, copied from the Admin, reads it)
- `GET /tenants/product-tags` → `{ product_tags, count, offset, limit }`
- `GET /tenants/collections` → `{ collections, count, offset, limit }`
- `GET /tenants/shipping-profiles` → `{ shipping_profiles, count, offset, limit }`

Each route file re-exports the Admin's own `GET` handler
(`export { GET } from "@medusajs/medusa/api/admin/<resource>/route"`) rather than reimplementing
it, so the shape cannot drift; only `GET` crosses over, and the Admin's write verbs stay out of the
tenant namespace. They still sit behind the `/tenants/*` authentication, so an anonymous call is a
401.

These exist because the copied product-create form fills its comboboxes from them. They expose
catalog taxonomy and store configuration that every storefront already shows publicly; nothing in
them belongs to another tenant.

## Auth (already in place, listed for the panel)

- `POST /auth/tenant/emailpass` `{ email, password }` → `{ token }`; the panel logs in with
  `sdk.auth.login("tenant", "emailpass", …)`, and the js-sdk in session mode then calls
  `POST /auth/session` to turn the token into the cookie every `/tenants/*` call rides on.
- `GET /auth/tenant/providers` is Medusa's generic `[actor_type]/providers` route.
- `DELETE /auth/session` logs out.

## Seam tests

Backend tests live in `apps/backend/integration-tests/http/tenants.spec.ts` (run with
`cd apps/backend && DB_HOST=localhost DB_PORT=5433 DB_USERNAME=ivanprotsko PORT=9031 npm run
test:integration:http`). Every route above that is new or changed gets at least one `it` in the
same commit: the happy path in Admin shape (`count/offset/limit` present, `limit` honoured), and
the isolation path (tenant B sees `count: 0` and a 404 on tenant A's ids).
