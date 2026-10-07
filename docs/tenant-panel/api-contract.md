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

---

# Wave 2 (2026-09-11/12, task `t-2026-09-11-mt-panel-wave-2` + `t-2026-09-12-mt-storefront-by-host`)

Written by the wave-2 architect (session_01477g3q3qsvgSsc4QHptDUh) BEFORE the code, from the brief
`docs/multitenancy/2026-09-11-night-2-panel-brief.md`. Ground rules above stay in force: Admin
validators/query-configs, `refetchEntities`, links decide scope, foreign id = 404, `allowed` without
`*` (or absent), list shape `{ <plural>, count, offset, limit }`. Every write verb re-checks ownership
through the link before calling the workflow. Skeleton commit 0fd518d holds the models
(`tenant_page`, `tenant_home_config`, `tenant_domain`, migration applied to the stand DB) and links
(`tenant-product-category`, `tenant-promotion`, `tenant-campaign`).

## Piece 4: profile

- `GET /tenants/me` unchanged. `POST /tenants/me` body `{ first_name?, last_name?, metadata? }` →
  `{ tenant_admin }` (same shape as GET). `metadata.language` is where the copied profile-edit stores
  the language choice (the Admin writes `user.metadata.language`).
- `POST /tenants/me/password` body `{ current_password, new_password }` → `{ ok: true }`. Verify the
  current password through the auth module (`Modules.AUTH` → `authenticate("emailpass", …)` with the
  actor's email) and then update the provider identity with the new password
  (`IAuthModuleService.updateProvider` / `updateAuthIdentities`, whichever 2.19.0 exposes for
  emailpass; the worker measures and cites the file). Wrong current password → `401 UNAUTHORIZED`
  (`MedusaError.Types.UNAUTHORIZED`), never 404. New password shorter than 8 → `INVALID_DATA`.
- Panel: `routes/profile/profile-detail` + `profile-edit` copied verbatim, reading `useMe()`; add
  a "Change password" section (own component, `// tenant-panel:`) with current/new/confirm fields.
  `useUpdateUser` → `POST /tenants/me`. The user-menu link `/settings/profile` opens it; back link
  returns to `location.state.from`.

## Piece 1: product detail

Backend, all under `/tenants/products/:id` and owned through the tenant-product link
(`assertOwnedProduct` in `tenants/products/helpers.ts`; a foreign `:id` is 404 on every verb):

- `GET /tenants/products/:id` (exists; fields via the Admin's `retrieveProductQueryConfig`).
- `POST /tenants/products/:id` body `AdminUpdateProduct` → `{ product }` via `updateProductsWorkflow`.
  `sales_channels` in the body is ignored and replaced by the tenant's channel.
- `POST /tenants/products/:id/variants` (`AdminCreateProductVariant`), `POST …/variants/:variant_id`
  (`AdminUpdateProductVariant`), `DELETE …/variants/:variant_id`, `POST …/variants/batch`
  (`AdminBatchProductVariants` — the price grid saves through it), `GET …/variants` and
  `GET …/variants/:variant_id` (Admin query configs `listVariantConfig` / `retrieveVariantConfig`).
- `GET /tenants/products/:id/options` → `{ product_options, count, offset, limit }` (Admin's
  `AdminGetProductOptionsParams` + `listOptionConfig`; the nested filter is `products: { id }`,
  because `product_option` is many-to-many with products in 2.19.0).
- `POST /tenants/products/:id/options/batch` (`AdminLinkProductOptions` →
  `createAndLinkProductOptionsToProductWorkflow`) → `{ product }`. IMPLEMENTATION NOTE, written by
  the piece-1 worker after reading `@medusajs/medusa/dist/api/admin/products/[id]/options/`: 2.19.0
  has NO `products/:id/options/:option_id` routes and no `POST products/:id/options`. An option is
  created, attached, re-attached and detached through this one batch, which is what the copied
  "manage options" drawer calls (`sdk.admin.product.linkOptions`). The `POST …/options`,
  `POST …/options/:option_id` and `DELETE …/options/:option_id` this contract asked for have no
  Admin counterpart to mirror and are not implemented.
- `POST /tenants/products/:id/variants/:variant_id/inventory-items`,
  `POST …/inventory-items/:inventory_item_id` and `DELETE …/inventory-items/:inventory_item_id`
  (manage-inventory-items dialog), plus `POST /tenants/products/:id/variants/inventory-items/batch`
  (`AdminBatchVariantInventoryItems` → `batchLinksWorkflow`, the one call the inventory-kit forms
  make). Ownership is checked on both sides: the variant belongs to the product in the URL, and the
  inventory item is already used by one of the tenant's own variants (the same set
  `GET /tenants/inventory-items` lists).
- `POST /tenants/products/:id/variants/:variant_id/images/batch` (`AdminBatchVariantImages`) and
  `POST /tenants/products/:id/images/:image_id/variants/batch` (`AdminBatchImageVariant`): the
  variant-media screen and the image-variants drawer. The image route proves the image belongs to
  the product in the URL and every variant id in the body belongs to the tenant, because both
  workflows address their subject by a bare id.
- `POST /tenants/inventory-items/location-levels/batch` (`AdminBatchInventoryItemLevels` →
  `batchInventoryItemLevelsWorkflow`): the one write the copied product-stock grid makes. `create`
  and `update` name the inventory item directly; `delete` names inventory LEVEL ids, each resolved
  to its item before the ownership check. Added by piece 1; the contract had no write route for
  stock.
- `GET /tenants/product-variants` → `{ variants, count, offset, limit }` scoped to own products
  (`product_id: ownIds` filter), Admin's `AdminGetProductVariantsParams`.
- Reference GETs already exist (types, tags, collections, categories, sales-channels, regions,
  price-preferences, shipping-profiles, inventory-items, store). `GET /tenants/stock-locations`
  (re-export of the Admin `GET`, read-only) IS needed and is implemented: the product-stock loader
  reads the location names to label the grid's columns.

Panel: copy `routes/products/product-detail/**`, `product-edit`, `product-media`,
`product-options-manage`, `product-create-variant`, `product-prices`, `product-organization`,
`product-attributes`, `product-metadata`, `product-shipping-profile`, `product-stock` (kept: it compiles and works
with the read-only `GET /tenants/stock-locations` plus the location-levels batch above, no
stock-location write route),
`product-sales-channels` (kept for parity; the backend ignores the choice), `routes/product-variants/**`
(variant detail/edit/media/metadata). Route tree under `/products/:id` mirrors the Admin route map
(`get-route.map.tsx`). Hooks: extend `hooks/api/products.tsx` (update, variants, options, batch) and
add `product-variants.tsx`. `/settings/translations/edit` action stays a dead link → remove that one
menu item with a `// tenant-panel:` comment (the panel has no translations screen).

## Piece 2: order detail (minimum actions: fulfill, ship, capture, cancel)

Backend, `/tenants/orders/:id` owned through the tenant-order link (`assertOwnedOrder`):

- `GET /tenants/orders/:id` → `{ order }` (Admin `retrieveTransformQueryConfig`; the detail screen
  sends its own `fields`, keep them). `GET …/preview` → `{ order }` (`previewOrderChangeStep` /
  `getOrderDetailWorkflow` as the Admin route does). `GET …/changes` → `{ order_changes }`.
  `GET …/line-items` → `{ order_items }` if the copied screen calls it.
- `POST /tenants/orders/:id/fulfillments` (`AdminCreateOrderFulfillment` → `createOrderFulfillmentWorkflow`),
  `POST …/fulfillments/:fulfillment_id/shipments` (`AdminCreateOrderShipment`),
  `POST …/fulfillments/:fulfillment_id/cancel`, `POST …/fulfillments/:fulfillment_id/mark-as-delivered`.
- `POST /tenants/orders/:id/cancel` → `cancelOrderWorkflow`.
- `POST /tenants/payments/:payment_id/capture` → `{ payment }` via `capturePaymentWorkflow`;
  ownership = the payment's collection belongs to an owned order (query `payment.payment_collection.order.id`
  and intersect; foreign → 404). `POST /tenants/payments/:id/refund` — optional, same rule.
- Read-only references the screen needs: `GET /tenants/stock-locations` and
  `GET /tenants/stock-locations/:id` (both re-export the Admin GET; the fulfillment section resolves
  a fulfillment's location name through the retrieve),
  `GET /tenants/fulfillment-providers`, `GET /tenants/shipping-options`, `GET /tenants/reservations`
  (scoped to own orders' line items or return empty page), `GET /tenants/customers/:id` (only when
  the customer has an owned order, else 404), `GET /tenants/returns`, `/tenants/claims`,
  `/tenants/exchanges` → empty pages (`count: 0`) with a `// tenant-panel:` note — RMA is view-only
  and nothing is created yet, `GET /tenants/order-edits` likewise. Panel timeline widgets must not
  crash on empty lists.
- The three reference lists that take a link-only filter carry the Admin's own `maybeApplyLinkFilter`
  in `middlewares.ts`, or the query throws: `stock-locations` on `sales_channel_id`
  (`sales_channel_location`), `fulfillment-providers` on `stock_location_id`
  (`location_fulfillment_provider`), `shipping-options` on `stock_location_id`
  (`location_fulfillment_set`, filtering by `service_zone.fulfillment_set_id`). The create-fulfillment
  form narrows the shipping options by the chosen warehouse, so without the last one the form can
  never configure itself and its submit stays disabled (measured live on :9029, 2026-09-11:
  "Trying to query by not existing property ShippingOption.stock_location_id", 500).

Panel: copy `routes/orders/order-detail/**`, `order-create-fulfillment`, `order-create-shipment`,
and the shared `routes/orders/common`. Actions menu: keep Cancel, Fulfill, Ship, Mark delivered,
Capture; the RMA/edit/transfer/address entries route to `routes/not-built` (comment each). Hooks:
extend `hooks/api/orders.tsx`, add `payments.tsx`, `fulfillment.tsx`, `stock-locations.tsx`,
`shipping-options.tsx`, `fulfillment-providers.tsx`, `reservations.tsx`, `customers.tsx`, `returns.tsx`,
`claims.tsx`, `exchanges.tsx`, `order-edits.tsx` (each trimmed to what the copied screen reads).

## Piece 3: orders export (same worker as piece 2)

The Admin's `routes/orders/order-export` posts to `POST /admin/orders/export` (a workflow that
writes a file and notifies). The tenant version: `POST /tenants/orders/export` takes the same filter
params the list accepts → `200 { url, filename, count }` where the CSV is produced synchronously for
the tenant's own orders (columns: display_id, created_at, status, payment_status, fulfillment_status,
email, currency, total, items count, sales channel) and stored through the file module
(`uploadFilesWorkflow`, like uploads). The copied screen shows the "started" toast; the panel then
opens `url`. Seam test: tenant B's export never contains an order of tenant A (parse the CSV).

The filters arrive in the QUERY STRING, not the body, and are parsed by the Admin's own
`AdminGetOrdersParams` + `exportTransformQueryConfig`: the Admin's SDK method the copied screen
calls sends them there (`sdk.admin.order.export(query)` → `POST /admin/orders/export?<filters>`), and
the Admin's own matcher parses them the same way. `filename` and `count` are added beside `url` so
the seam test can assert the row count without reading the file.

## Piece 5: categories

Link `tenant-product-category` (exists). `GET /tenants/product-categories` CHANGES from the Admin
re-export to a scoped list: own ids through the link, then `refetchEntities("product_category", …)`
with the Admin's `AdminProductCategoriesParams` + `listProductCategoryConfig`. Tree filters
(`parent_category_id`, `include_descendants_tree`) keep working inside the owned set. Then:
`POST /tenants/product-categories` (`AdminCreateProductCategory` → `createProductCategoriesWorkflow`,
then link to the tenant; `parent_category_id` must be owned), `GET/POST/DELETE …/:id`,
`POST …/:id/products` (`AdminBatchProductCategoryProducts`: every id in `add`/`remove` must be an
owned product, else 400 `INVALID_DATA` naming nothing). Public read for the storefront:
`GET /store/tenant/product-categories` (publishable key → sales channel → tenant through the links,
same helper as the pages/home routes below; response shape = `/store/product-categories`, params
= the Store validator). Panel: copy `routes/categories/**` (list, create, detail, edit, products,
organize, metadata) + `hooks/api/categories.tsx` rewritten to `/tenants/product-categories`.

IMPLEMENTATION NOTES, written by the piece-5 worker after reading
`@medusajs/medusa/dist/api/admin/product-categories/` and measuring the stand:

- The body validator for `POST …/:id/products` is `createLinkBody()` from
  `@medusajs/medusa/api/utils/validators` (`{ add?: string[], remove?: string[] }`), which is what
  the Admin's own route uses. There is no `AdminBatchProductCategoryProducts` export in 2.19.0.
- `POST /tenants/product-categories` answers `200`, not `201`: the Admin's own create answers 200
  and the copied screen reads the body, not the status.
- The link's graph name is `tenant.product_categories` and its entry point is
  `tenant_product_category` (`tenant_id`, `product_category_id`), measured with `medusa exec` on
  the stand DB 2026-09-11.
- `DELETE …/:id` dismisses the link before running `deleteProductCategoriesWorkflow`. A link row
  outliving its category would make `listTenantCategoryIds` report an id whose row is gone, and
  every route here would then 404 on the tenant's own id.
- `parent_category_id` ownership is enforced on create AND on update, so a tenant cannot re-parent
  its tree onto another tenant's node either.
- `GET /store/tenant/product-categories` forces `is_active: true` / `is_internal: false` through
  the Store route's own `applyCategoryFilters` middleware, so an inactive category is not public
  even to its own storefront.

## Piece 6: promotions + campaigns

Links `tenant-promotion`, `tenant-campaign` (exist). Routes mirror the Admin: `GET/POST /tenants/promotions`,
`GET/POST/DELETE …/:id`, `POST …/:id/rules/batch`, `POST …/:id/target-rules/batch`,
`POST …/:id/buy-rules/batch`, `GET …/:id/:rule_type` (rules listing the edit screens read),
`GET /tenants/promotions/rule-attribute-options/:rule_type`, `GET …/rule-value-options/:rule_type/:rule_attribute_id`
(reference, re-export Admin GET — but the `sales_channel` attribute's value options must be filtered
to the tenant's own channel), `GET/POST /tenants/campaigns`, `GET/POST/DELETE …/:id`,
`POST …/:id/promotions` (batch add/remove, promotions must be owned). Create rule: after
`createPromotionsWorkflow`, the route guarantees a rule `{ attribute: "sales_channel_id", operator: "eq",
values: [tenant channel id] }` on the promotion (add it if the body did not, replace it if the body
named another channel), verified live 2026-09-11 08:4x: `GET /admin/promotions/rule-attribute-options/rules`
on :9023 lists `sales_channel` → `sales_channel_id`. `rules/batch` may never remove or alter that
rule (400). Panel: copy `routes/promotions/**` and `routes/campaigns/**`, hooks `promotions.tsx`,
`campaigns.tsx`.

IMPLEMENTATION NOTES, written by the piece-6 worker after building and measuring it:

- The attribute was re-measured on this piece's own backend (`GET /admin/promotions/rule-attribute-options/rules`
  on :9032, 2026-09-11): `sales_channel -> value "sales_channel_id"`, field type `multiselect`,
  alongside `customer_group`, `region`, `country` and `currency_code`. `sales_channel` is the
  `rule_attribute_id` path segment; `sales_channel_id` is what goes into a rule's `attribute`.
- `POST /tenants/promotions` answers `400 NOT_ALLOWED` when the tenant has no sales channel. There is
  nothing to confine the promotion to in that state, and a promotion with no channel rule discounts
  every cart on the backend, other tenants' storefronts included.
- `POST /tenants/promotions/:id/rules/batch` refuses three things with `400 INVALID_DATA`: deleting
  the `sales_channel_id` rule, updating it, and creating a second one. The third matters as much as
  the first two, because two channel rules widen the promotion instead of moving it. `target-rules`
  and `buy-rules` are NOT guarded: they choose line items inside a cart that already passed the
  promotion's own rules, so they cannot reach another tenant's channel.
- `GET /tenants/promotions/:id` accepts a code in the `:id` position, as the Admin's route does.
  Ownership is therefore decided after the lookup: a code another tenant owns resolves to a promotion
  outside the owned set and answers 404, identical to a code that does not exist.
- `GET /tenants/promotions/rule-value-options/:rule_type/:rule_attribute_id` scopes TWO attributes,
  not one. `sales_channel` answers the tenant's own channel, as this contract asked. `product` is
  scoped to the tenant's own products as well, through the tenant-product link: the target-rule and
  buy-rule builders pick products by title, and the Admin's handler would have listed every tenant's
  catalog in that combobox. Every other attribute (region, country, currency, collection, tag, type,
  customer group) keeps the Admin's own handler, because it is the same global reference data the
  `/tenants/*` reference lists already expose.
- `deletePromotionsWorkflow` and `deleteCampaignsWorkflow` carry no `removeRemoteLinkStep`, unlike
  `deleteProductsWorkflow`. The tenant-promotion and tenant-campaign rows therefore outlive the row
  they point at, and `tenant.promotions` keeps feeding a dead id to every list. The DELETE verbs go
  through `deleteTenantPromotionWorkflow` / `deleteTenantCampaignWorkflow`, which add that step.
  Creation goes through `createTenantPromotionWorkflow` / `createTenantCampaignWorkflow` for the
  mirror reason: the link is a workflow step, so a promotion whose link fails to write is rolled back
  rather than left live in the channel and invisible in the panel.
- The Admin's `CreateCampaign` body is `.strict()` and declares no `promotions` key, so a campaign is
  always created empty and filled through `POST /tenants/campaigns/:id/promotions`. A promotion body
  may still create its campaign inline (`campaign` instead of `campaign_id`); that campaign becomes
  the tenant's own and gets the tenant-campaign link in the same workflow. A `campaign_id` naming
  another tenant's campaign is a 404.

## Piece 7: content pages

Model `tenant_page` (key ∈ contacts | legal | about | privacy | offer; locale default `en`; title;
markdown body; published). Routes:

- `GET /tenants/pages` → `{ pages: TenantPage[] }` — always five entries, one per key, unsaved keys
  as `{ key, title: "", body: "", published: false, id: null }` so the panel lists all sections.
- `GET /tenants/pages/:key` → `{ page }` (404 for an unknown key, `INVALID_DATA`).
- `PUT /tenants/pages/:key` body `{ title, body, published, locale? }` → `{ page }` (upsert).
- Public: `GET /store/tenant/pages` → `{ pages: [{ key, title }] }` of published pages (footer
  links); `GET /store/tenant/pages/:key` → `{ page }` (404 when unpublished/absent). Tenant from the
  publishable key: `req.publishable_key_context.sales_channel_ids[0]` → tenant through the
  tenant-sales-channel link (shared helper `api/store/tenant/resolve-tenant.ts`, reused by piece 8
  and the by-host resolver).

Panel: own screens (no Admin counterpart) built from the copied Admin primitives
(`components/common`, `RouteFocusModal`, `Container`, `Heading`, `Form`): `/pages` = table of the
five sections with status words (Published / Draft / Empty); `/pages/:key` = title + markdown
textarea + Published switch + Save. Storefront: `app/[locale]/(main)/pages/[key]/page.tsx` renders
the page (markdown → HTML; the storefront already depends on nothing for markdown, so a small
sanitised renderer or plain paragraphs — the worker checks `package.json` and does not add a
dependency); the footer lists the published pages from `GET /store/tenant/pages` (every footer
variant that shows link columns). Cache tags `tenant-pages`; `POST /api/revalidate` with
`{ type: "tenant.pages" }` clears them.

## Piece 8: home page document

Model `tenant_home_config.config` (JSON). Schema `upready.tenant-home/v1`:

```
{
  "schema": "upready.tenant-home/v1",
  "theme": { "preset": ThemeId },                    // apps/storefront/src/lib/theme/presets.generated.ts THEME_IDS
  "settings": StorefrontSettingsInput,               // VERBATIM apps/storefront/src/lib/theme/composition.ts:
                                                     // { defaultMode, header, hero, tiles, listing, footer }, FORBIDDEN pairs enforced
  "content": {
    "hero": { "title": string, "subtitle": string, "cta_label": string, "cta_href": string, "image_url": string|null },
    "products": { "source": "popular" } | { "source": "category", "category_id": string, "title": string },
    "order": ("hero"|"categories"|"products")[]      // each at most once; a block absent here is not rendered
  },
  "updatedAt": ISO 8601 (server-stamped)
}
```

This is the ONE composition schema of the project: `settings` is the `feat/stands-composition`
document (`upready.storefront-settings/v1`) unchanged, `content` is the tenant's text for those
blocks (that document never had content fields — recorded as the resolution of the acceptance item
"one schema"). Routes: `GET /tenants/home` → `{ home }` (null when unsaved), `PUT /tenants/home`
body = the document without `updatedAt` → `{ home }`, validation = the backend's own
`api/store/storefront-settings/validation.ts` for `settings` (reuse it, do not copy) + a zod schema
for `theme`/`content` (`category_id` must be an owned category). Public `GET /store/tenant/home` →
`{ home }`. Panel: own screen `/home-settings` — theme preset select (labels from
`THEME_LABELS`), the six composition selects (plain-language labels, forbidden pairs greyed as the
storefront popover does), hero fields, products source, block order (up/down), Save. Storefront:
`(main)/page.tsx` reads `getTenantHome()` (cache tag `tenant-home`, revalidate type `tenant.home`)
and, when present, uses `home.settings` instead of `getStorefrontSettings()`, feeds
`content.hero` into the chosen hero variant (title/subtitle/CTA/image props — add optional props to
the K hero and to the G/H variants that show a headline), renders blocks in `content.order`, and
the listing variant reads `content.products` (popular = the existing lead-collection logic; category
= `listProducts({ category_id })`). `app/layout.tsx` takes `data-theme`/`data-mode` from
`home.theme.preset` / `home.settings.defaultMode` when a tenant home exists.

IMPLEMENTATION NOTES, written by the piece-8 worker after building the routes and measuring
them on the stand (backend :9034, 2026-09-11):

- A forbidden composition pair answers **422** with the body `/store/storefront-settings`
  already uses (`error: "forbidden_combination"`, `field`, `value`, `against`, `againstValue`,
  `reason`) plus a `message` field carrying the same reason. The 422 is written with
  `res.status(422)`, not thrown as a `MedusaError`: the framework's error handler maps no
  MedusaError type to 422 except `DUPLICATE_ERROR` and `PAYMENT_AUTHORIZATION_ERROR`
  (`@medusajs/framework/dist/http/middlewares/error-handler.js`), and neither describes this.
  `message` is not in the storefront-settings body; it is added because the js-sdk's
  `FetchError` carries only `message` (falling back to the status text), so without it the
  panel would show "Unprocessable Entity" instead of the reason.
- A `category_id` the tenant does not own is **400 `INVALID_DATA`**, not 404: the id is a
  field of the document being written, not the resource being addressed. The message names no
  category, so the answer still says nothing about whether a foreign id exists.
- Field-level validation of `settings` reuses `validateFields()` from
  `api/store/storefront-settings/validation.ts` inside the zod schema
  (`api/tenants/home/validators.ts`, a `superRefine`), so the six enums exist once on this
  side; the FORBIDDEN check stays in the route because its answer is a 422, not a 400.
- `theme.preset` is validated against the seven ids of the storefront's generated
  `presets.generated.ts`, hand-transcribed in the same validators file for the same reason the
  composition enums are transcribed.
- `content.order` may name each block at most once; a block missing from it is not rendered.
  The panel's screen can drop a block and add it back.
- The write goes through a one-step workflow (`workflows/tenant/upsert-tenant-home`) whose
  step is the module-service upsert, with compensation back to the previous document. A bare
  service call from the route also trips this repo's own lint rule
  `@medusajs/no-service-mutations-in-api-route`.
- Storefront: the document is read by ONE helper, `lib/data/tenant-home.ts`
  (`getTenantHome`, `getEffectiveSettings`, `getTenantThemePreset`), which the root layout,
  `(main)/layout.tsx`, the nav, the footer and `(main)/page.tsx` all go through, so piece 9's
  swap to request headers touches that file alone. `getEffectiveSettings()` prefers the tenant
  document and falls back to `getStorefrontSettings()`, so a stand with no tenant behind its
  key is unchanged.
- `data-theme` takes the document's preset only when it is one of the generated `THEME_IDS`;
  anything else falls back to the build profile's own theme. Measured on the stand: with a
  document naming `geist`/`light` the page answered `data-theme="geist" data-mode="light"`
  while the build profile is `sneakers`/`dark`, which is the proof the document wins — with
  the preset `sneakers` the two are indistinguishable.

## Piece 9: storefront by host (`t-2026-09-12-mt-storefront-by-host`)

Design doc: `docs/multitenancy/storefront-by-host.md` (written before the code). Summary:

- Model `tenant_domain` (custom hosts, unique, lowercase, no port). Technical host
  `<handle>.upready.dev` is derived from the handle (base domains from
  `TENANT_BASE_DOMAINS`, default `upready.dev,localhost`), never stored, never deletable.
- `GET /storefront/by-host?host=<host>` (NOT under `/store/*`: measured 2026-09-11 08:4x, the global
  publishable-key gate answers 400 to any `/store/*` call without a key, so a resolver there cannot
  bootstrap the key) → `{ tenant: { id, handle, name }, publishable_key: string, theme, settings,
  home }` (theme/settings/home from the home document or `null`s); unknown host → 404. Port stripped
  server-side too. No auth; the publishable key is not a secret (it is in every storefront HTML).
- `GET /tenants/domains` → `{ domains: [{ id, host }], technical: ["<handle>.upready.dev"] }`,
  `POST /tenants/domains` `{ host }` → `{ domain }` (409 `DUPLICATE_ERROR` when another tenant holds
  it or it equals another tenant's technical host), `DELETE /tenants/domains/:id`.
- Storefront: `middleware.ts` resolves the tenant from `request.headers.host` through the resolver
  (in-memory cache 60 s per host), sets `x-tenant-key`, `x-tenant-handle`, `x-tenant-theme`,
  `x-tenant-mode` and `x-tenant-origin` (the request's own `scheme://host`, the base of every
  absolute URL the page emits) request headers; `lib/config.ts` stops passing the env key to the SDK and instead
  every fetch takes `x-publishable-api-key` from the request headers (`headers()` in server code;
  `fetchWithoutLocale` included); `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` remains only the fallback when
  the resolver answers 404 (single-store mode). Cache tags gain the tenant handle suffix so two
  tenants never share a cached catalog page. `app/layout.tsx` reads theme/mode from the headers.
  Acceptance: `acme.localhost:8010` and `globex.localhost:8010` on ONE `next dev` show 9 and 3 cards
  on `/en/store` and different presets (seed: acme → `sneakers` dark, globex → `home-goods` light
  through `PUT /tenants/home`), screenshots of both; a tenant created through the API opens on its
  host without a restart.

## Piece 10: catalogue spreadsheet (`t14-product-import`)

Design doc = this section, written against measurements on the stand (2026-09-15).
Screens: `routes/products/product-export` and `routes/products/product-import`; hooks in
`hooks/api/product-csv.tsx`; the file machinery in `apps/backend/src/product-csv/`.

- `GET /tenants/products/export` → the CSV ITSELF (`text/csv; charset=utf-8`,
  `content-disposition: attachment`, plus `x-product-count`). Not `{ url }` like the
  orders export: this file is the import's contract, so a round trip has to be one request
  each, and the file module's local provider answers URLs on port 9000 whatever port the
  backend listens on (see the note in `api/tenants/orders/export/route.ts`).
- `POST /tenants/products/import` — multipart, field `files`, parsed by the Admin's own
  multer array (the same reuse `POST /tenants/uploads` documents). Answers
  `200 { product_import }` with a per-row DRY RUN. WRITES NOTHING.
- `GET /tenants/products/import` → `{ product_imports, limits }`, newest first, no file
  bodies. `GET /tenants/products/import/:id` → one stored report (this is what makes the
  report survive a page reload). `DELETE /tenants/products/import/:id` drops it.
- `POST /tenants/products/import/:id/confirm` — the ONLY route that writes. It re-parses
  the stored file and RE-PLANS against the catalogue as it stands at that moment, so a
  product edited in the panel in between cannot be overwritten by a stale diff. A rejected
  or already-applied upload answers 400/409 rather than importing twice.
- Model `tenant_product_import` (tenant module): `filename`, `bytes`, `status`,
  `delimiter`, `source` (the normalised file), `report` (JSON), `confirmed_at`.

### The column contract

One row per VARIANT; product-level columns repeat on every row of a handle and are read
from its FIRST row. Headers are Russian, with technical aliases accepted
(`src/product-csv/columns.ts`): `Код товара` (handle), `Название`, `Подзаголовок`,
`Описание`, `Статус`, `Категория` (`A / B` path), `Вариант`, `SKU`, `Остаток`, `Вес, г`,
`Длина, мм`, `Ширина, мм`, `Высота, мм`, `Цена, <CUR>`, `Метаданные: <ключ>`, `Картинки`.

Decisions worth knowing before changing any of this, each one measured:

- **An empty cell means «no change».** Uniformly. Clearing a field stays the panel's job;
  the alternative reading turns one careless Ctrl+A into a nameless, priceless catalogue.
- **One price column: the shop's own currency**, from `tenant_locale_settings.
  default_country` → region → currency, else the store default. A seeded stand prices a
  variant in 118 currencies (`select count(distinct currency_code) from price`), so «a
  column per currency found» would be unusable. The import accepts a column for any
  currency the STORE prices in.
- **An update resends EVERY unscoped price of the variant by id.** `updatePriceSets`
  deletes every price of the set whose id is absent from the update
  (`@medusajs/pricing`, `updatePriceSets_`: `pricesToDelete` = existing minus incoming),
  so a one-column price list would otherwise wipe the other 117 currencies. Price-list
  prices are left out of the payload: that listing filters `price_list_id: null`, so they
  are not candidates for deletion. See `pricePayload` in `product-csv/apply.ts`.
- **Variants are written through `batchProductVariantsWorkflow`, never through
  `updateProductsWorkflow`'s `variants` array** — the latter DELETES variants missing from
  the array, which for a file carrying one row of a multi-variant product is data loss.
- **`handle` and `sku` are unique platform-wide**, not per tenant
  (`IDX_product_handle_unique`, `IDX_product_variant_sku_unique`). `product-csv/uniqueness.ts`
  checks them during the dry run: a code the owner TYPED and somebody else holds is a
  rejected row; a code generated from the name gets a `-2` suffix and says so.
- **`1,234` is refused, not guessed.** A Russian Excel means 1.234, an American one 1234,
  and the difference lands on a live price tag.
- **New products are created as `draft`**, whatever the file's `Статус` says.
- **Encoding is decided, not assumed**: UTF-8 is tried strictly, and a file that is not
  valid UTF-8 is read as Windows-1251 — Excel's two CSV menu entries produce exactly those
  two, and the owner cannot tell them apart.
- **Limits**: 10 MB and 5 000 rows, answered by `GET /tenants/products/import` and shown
  in the panel BEFORE the upload. Mind `client_max_body_size 25m` in the panel's nginx.
- **Images by URL** are fetched by the backend, so: only http(s), no credentials in the
  URL, every resolved address must be public (loopback, RFC 1918, link-local and the
  metadata address are refused), redirects followed by hand with a 3-hop limit and
  re-checked at each hop, 8 MB cap enforced while reading the body, and an allowlist of
  image content types. A URL already on the product is kept, not re-downloaded.
- **Not transactional, and said so out loud.** Everything is validated first and nothing is
  written until the whole file passes; on an unexpected failure mid-write the import stops,
  records `stopped_at_line` and marks every row it had already applied.
- **XLSX is not read.** A ZIP/OLE magic number answers «сохраните как CSV UTF-8» instead of
  a parse error.

Seam test: `integration-tests/http/tenants-product-csv.spec.ts` (round trip unchanged,
price change applied only on confirm, duplicate row rejects the file whole, report readable
by id, one shop's export never carries another's product, XLSX refused).

---

# Roles and staff (t-2026-10-07-11)

A login (`tenant_admin`) has a `role` in its shop: `owner`, `manager` or `operator`. The role is the
row's, so one person can be an owner of one shop and an operator of another. Every login that existed
before the migration is an `owner`.

## Who decides

One file, `apps/backend/src/api/tenants/permissions.ts`, holds both tables: role → permissions, and
route with method → the one permission it needs. The panel holds neither: it reads `role` and
`permissions` from `GET /tenants/me` and shows what they open.

| Role | Permissions |
|---|---|
| `owner` | `orders`, `customers`, `reviews`, `catalog`, `storefront`, `marketing`, `marketplaces`, `settings`, `staff` |
| `manager` | `orders`, `customers`, `reviews`, `catalog`, `storefront`, `marketing`, `marketplaces` |
| `operator` | `orders`, `customers` |

- A route with no row in the table is open to the owner only. `__tests__/permissions.unit.spec.ts`
  walks the route files and fails on a route or a method without a row, so a new route cannot ship
  without that decision.
- Reference reads (`any` in the table) are open to every role: the caller's own profile and shops,
  `GET` of the shop, regions, sales channels, stock locations, shipping options, fulfillment
  providers, the shop's languages, its addresses (`GET /tenants/domains`) and its look
  (`GET /tenants/branding`), products and variants. Their writes keep their own permission.
- Reads that carry settings or keys (payment, marketplace and delivery keys, integrations) need
  `settings` for `GET` as well. The gates of writing to Wildberries (`/tenants/wb/write-settings`)
  are read with `marketplaces` and switched with `settings`.

## The gate

`guardTenantAdmin` (`tenants/tenant-admin-gate.ts`) runs on `/tenants/*` right after `authenticate`.
One read of the caller's row answers, in this order:

1. the row is gone → `401 { message: "Unauthorized" }`, on every route;
2. the shop is archived → `401 { message: "Tenant is archived" }`;
3. the role may not call the route → `403 { type: "not_allowed", message, permission }`, where
   `permission` is what the role lacks, or `null` for a route with no row.

The role is read from the table on every request and never from the token, so a changed role is in
force on the caller's next request.

## Routes

- `GET /tenants/me`, `POST /tenants/me` → `tenant_admin` also carries `role` and `permissions`.
  `tenant.metadata` is in the answer only for a caller with `settings`: it is where the shop's
  settings are kept, and the routes that answer them are closed for reading without that permission.
- `GET /tenants/staff` → `{ staff: [{ id, email, first_name, last_name, role, created_at, updated_at,
  is_self }], roles: [{ role, permissions }] }`. The platform's own row is not listed. `roles` is
  every role with what it opens, in the order owner, manager, operator: the panel words «what this
  role sees» from it and keeps no text of its own about a role.
- `POST /tenants/staff` body `{ email, password, role, first_name?, last_name? }` → `201 { staff_member }`.
  `400` when the email already has a login in this shop, and `400` when the email already has ANY
  account on the platform (another shop's login, a platform user, a buyer, an identity registered in
  advance): the owner cannot set a password for an account that is not hers to set one for.
- `POST /tenants/staff/:id` body `{ role?, first_name?, last_name?, password? }` → `{ staff_member }`.
  `400` for the caller's own role, for taking `owner` away from the last owner, and for a new
  password on a login that is also used outside this shop.
- `DELETE /tenants/staff/:id` → `{ id, object: "tenant_admin", deleted: true }`. `400` for the
  caller's own login and for the last owner.
- On both `:id` routes the platform's row and another shop's login answer `404`, like a missing id.
- `POST /tenants/me/switch` into a sister site the caller has no row in creates that row only for an
  `owner`, as an owner's row. A manager or an operator gets the `403` of a foreign shop, and
  `GET /tenants/me/shops` does not offer her such a site.
- The texts of the seven refusals of the staff routes are `STAFF_REFUSALS` in
  `tenants/staff/staff-refusals.ts`, a file with no imports: the panel recognises a refusal by its
  text and translates it.

Seam test: `integration-tests/http/tenants-staff-roles.spec.ts`.
