# Tenant Panel

A Vite app that logs a tenant admin in and renders three screens: an Overview, a Products list
(placeholder), and an Orders list (placeholder). It is built the same way the Medusa Admin is
built: most files under `src/` are copied file-for-file from `@medusajs/dashboard` 2.19.0
(`apps/backend/node_modules/@medusajs/dashboard/src`) so that later screens (product and order
list/detail/create) can be dropped in with minimal changes, and pointed at `/tenants/*` instead of
`/admin/*`.

## Running

```bash
corepack pnpm install   # from the repo root, once
corepack pnpm --filter @dtc/gorgo-medusa-tenant-panel dev
# or, from apps/tenant-panel:
corepack pnpm dev       # http://localhost:5180
```

The backend must already be running (`medusa develop`, default `http://localhost:9023`) with the
`/tenants/*` routes and at least one tenant admin seeded. Log in with a tenant admin's email and
password (see `docs/tenant-panel/api-contract.md` for the auth routes).

`corepack pnpm build` type-checks (`tsc --noEmit`) and builds; `corepack pnpm preview` serves the
build.

## Backend URL: proxy vs direct

Two ways to reach the backend, controlled by `.env` (copy `.env.template`):

- **Proxy (default).** The dev server proxies `/auth` and `/tenants` to
  `VITE_MEDUSA_BACKEND_URL` (default `http://localhost:9023`). The browser talks to one origin, so
  the session cookie set by `POST /auth/session` stays first-party. `lib/client` falls back to
  `window.location.origin` in this mode.
- **Direct.** Set `VITE_MEDUSA_BACKEND_DIRECT=true` to call `VITE_MEDUSA_BACKEND_URL` directly,
  cross-origin. Medusa's CORS middleware only covers `/admin`, `/store` and `/auth` today, so this
  mode needs a CORS middleware added to `/tenants/*` on the backend before it will work.

## Integration note

`GET /tenants/store` (used for the sidebar's store-name header, `components/layout/main-layout`)
was still missing when this skeleton was built; the backend piece of the same task shipped it
(`docs/tenant-panel/api-contract.md`), and `Header` in `main-layout.tsx` keeps the Admin's
behaviour of throwing when the store cannot be loaded.

## Deviations from the copied `@medusajs/dashboard` files

Every changed copy carries a `// tenant-panel: ...` comment at the point of change. Summary, one
line per file:

- `providers/providers.tsx` — drops `ExtensionProvider` (no extensions).
- `providers/feature-flag-provider/index.tsx` — own module; every flag is `false`, nothing fetched.
- `components/authentication/protected-route/protected-route.tsx` — own file; no RBAC
  (`PermissionsProvider`/`useMePermissions` dropped), no `SearchProvider`.
- `components/layout-composer/*` (`layout-composer.tsx`, `types.ts`, `index.ts`) — own,
  drag-and-drop-, widget- and layout-preference-free version of the Admin's LayoutComposer;
  `entry.tsx` is the only file kept verbatim.
- `components/layout/main-layout/main-layout.tsx` — cut to three `NavItem`s (Overview, Products,
  Orders); drops the `PermissionGuard`, the search trigger, the settings nav item and the
  extension menu items; `Header` no longer throws on a `useStore()` error (see the gap above).
- `components/layout/shell/shell.tsx` — drops `LayoutCustomizerHostProvider`,
  `LayoutCustomizerSlot`, `CustomizerMenu` and the topbar's widget `LayoutComposer` zone
  (`Notifications`), none of which apply without extensions or widgets.
- `components/utilities/i18n/i18n.tsx` — resources come from the panel's own `i18n/translations`
  module instead of `useExtension().getI18nResources()`.
- `i18n/translations/index.ts`, `i18n/languages.ts` — trimmed from 34 locales to English and
  Russian.
- `routes/login/login.tsx` — drops extension widgets, `CloudAuthLogin`, `SsoLogin` and MFA state.
- `routes/login/components/email-pass-login.tsx` — default post-login redirect changed from
  `/orders` to `/`; adds a "Forgot password?" link to `routes/forgot-password`
  (f14-no-password-reset — the Admin's own version ships the reset-password link, this panel had
  dropped it entirely for wave 1 and never added it back).
- `routes/forgot-password/`, `routes/reset-password/` — own files, no direct Admin counterpart to
  copy from (the Admin ships this pair as a single two-step route); `hooks/api/auth.tsx` gained
  `useGenerateResetPasswordToken`, `useResetPasswordForEmailPass` and `useMailStatus` alongside them.
- `lib/client/client.ts` — `backendUrl` falls back to `window.location.origin` instead of `"/"`
  (the panel isn't always served from the backend's own origin the way the Admin at `/app` is).
- `components/common/required-permissions-section/required-permissions-section.tsx` — stub
  (renders `null`); no RBAC, so nothing to list.

Added by wave-2 piece 1 (product detail, `/products/:id/**`):

- `routes/products/product-detail/constants.ts` — `PRODUCT_DETAIL_FIELDS` is the literal field
  list. The Admin wraps it in `getLinkedFields("product", ...)`, which reads
  `virtual:medusa/links` to append `+<link>.*` for every plugin-registered module link; the panel
  has no plugin system and no virtual modules, so there is nothing to append.
- `routes/products/product-detail/components/product-general-section`,
  `.../product-variant-section` and
  `routes/product-variants/product-variant-detail/components/variant-general-section` — the
  "Manage translations" action is removed. It links to `/settings/translations/edit`, a screen the
  panel does not have, and `useFeatureFlag("translation")` already hid it.
- `routes/products/product-stock/product-stock.tsx` — `useRef<ReturnType<typeof setTimeout>>()`
  takes an explicit `undefined`; React 19 types have no zero-argument `useRef` overload.
- `routes/products/product-detail/loader.ts`, `routes/products/product-stock/loader.ts`,
  `routes/product-variants/product-variant-detail/loader.ts`,
  `routes/product-variants/product-variant-edit/loader.ts`,
  `routes/products/product-media/components/edit-product-media-form`,
  `routes/products/product-options-manage/components/product-options-manage-form`,
  `routes/products/product-organization/components/product-organization-form`,
  `routes/products/product-shipping-profile/components/product-organization-form`,
  `routes/products/product-create-variant/components/create-product-variant-form/inventory-kit-tab.tsx`
  and `routes/product-variants/product-variant-manage-inventory-items/components/manage-variant-inventory-items-form`
  — every `sdk.admin.<x>` call becomes `sdk.client.fetch("/tenants/<resource>", ...)`. The js-sdk's
  admin module hardcodes `/admin/...`, so the URL is the one thing that cannot be reused. The
  product-media upload is built by hand as a `FormData` against `POST /tenants/uploads`, the same
  helper shape `routes/products/product-create` already uses.
- `providers/extension-provider/index.ts` — gains `getDisplays`, a third constant empty array, for
  the product-detail sections that render plugin-contributed display components.
- `components/layout-composer/detail-page-defaults.tsx` — copied verbatim and re-exported from the
  barrel; it is the metadata/JSON/permissions trio every detail screen ends with and depends on
  nothing the panel dropped.
- `hooks/api/products.tsx` — extended with the Admin's update, variant and batch hooks, each
  against its `/tenants/products/*` route; `hooks/api/product-variants.tsx`, `hooks/api/inventory.tsx`
  and `hooks/api/stock-locations.tsx` are new, trimmed to what the copied screens read.
Wave 2, piece 2 (order detail) and piece 3 (orders export):

- `components/layout-composer/index.ts` — the barrel re-exports `detail-page-defaults` again
  (order-detail calls `detailPageDefaultEntries`); the file itself is the Admin's, copied verbatim.
- `hooks/table/query/index.ts` — the barrel names `use-order-table-query` (order-export imports it
  from the barrel; the order list imported it by path).
- `routes/orders/order-detail/loader.ts` — `sdk.admin.order.retrieve` swapped for
  `sdk.client.fetch("/tenants/orders/:id")`; a tenant token cannot reach `/admin/*`.
- `routes/orders/order-create-fulfillment/components/order-create-fulfillment-form/order-create-fulfillment-form.tsx`
  — same swap for `sdk.admin.stockLocation.list` → `/tenants/stock-locations`.
- `routes/orders/order-detail/components/order-summary-section/order-summary-section.tsx` —
  `AdminReservation` imported from `@medusajs/types` instead of `@medusajs/types/src/http`; the
  panel resolves the package's published `dist`, not the dashboard's source tree.
- `routes/orders/order-export/order-export.tsx` — the success handler opens the URL the tenant
  export returns. The Admin's export is asynchronous and arrives by notification; the tenant one
  builds the CSV synchronously and answers `{ url }`.

Everything else under `routes/orders/order-detail`, `order-create-fulfillment`,
`order-create-shipment`, `order-export` and `routes/orders/common` is byte-for-byte the Admin's file
at the same relative path.

Added by wave-2 piece 5 (categories, `/categories/**`):

- `routes/categories/**` — the Admin's whole category tree copied verbatim (list, create, detail,
  edit, products, organize, metadata, and the shared `common/`), 44 files, two of them changed.
- `routes/categories/category-detail/loader.ts` — `sdk.admin.productCategory.retrieve` becomes
  `sdk.client.fetch("/tenants/product-categories/:id")`. The js-sdk's admin module hardcodes
  `/admin/...`, which a tenant token cannot reach, so the loader answered 404 and the
  ErrorBoundary took the whole `/categories/:id` subtree with it.
- `routes/categories/category-organize/components/organize-category-form/organize-category-form.tsx`
  — the same substitution on `sdk.admin.productCategory.update`, which is how the ranking screen
  saves a drag.
- `components/table/table-cells/common/text-cell` — copied verbatim; the category list's Name and
  Handle columns are the only consumer in the panel so far.
- `hooks/api/categories.tsx` — rewritten from the piece-3 read-only stub to the Admin's own hook
  file against `/tenants/product-categories` (retrieve, list, create, update, delete, products
  batch). `useInfiniteCategories` is dropped: no copied screen calls it.
- `GET /tenants/product-categories` is tenant-scoped from this piece on, so the category combobox
  in product create and product organize offers the tenant's own categories only. Measured on the
  stand 2026-09-11: the same query answers 1 category on `/tenants/product-categories` and 4 on
  `/admin/product-categories`.

Added by wave-2 piece 6 (promotions and campaigns, `/promotions/**` and `/campaigns/**`):

- `hooks/api/promotions.tsx`, `hooks/api/campaigns.tsx` — the Admin's own hooks with every
  `sdk.admin.promotion.*` / `sdk.admin.campaign.*` call replaced by an `sdk.client.fetch` against
  the matching `/tenants/*` route. The js-sdk's admin module hardcodes the `/admin/...` prefix, so
  the URL is the one thing that cannot be reused; paths, bodies, query keys and invalidations are
  the Admin's, including the three rule mutations that share `:id/:ruleType/batch` and differ only
  in which key of the batch body they fill.
- `routes/promotions/promotion-list/loader.ts`, `routes/promotions/promotion-detail/loader.ts`,
  `routes/campaigns/campaign-detail/loader.ts`,
  `routes/promotions/common/edit-rules/components/rule-value-form-field/rule-value-form-field.tsx`
  and
  `routes/promotions/promotion-add-campaign/components/add-campaign-promotion-form/add-campaign-promotion-form.tsx`
  — the same swap at the five call sites that bypass the hooks. The last two matter for isolation
  as well as for the URL: the rule-value combobox and the campaign combobox would otherwise list
  every backend's channels, products and campaigns.
- `components/layout/main-layout/main-layout.tsx` — Campaigns hangs under Promotions as a nested
  nav item, which is where the Admin's own nav puts it. The nested list renders through the
  `LayoutEditContext` default (edit mode off, nothing hidden, order unchanged), so it needs no
  `LayoutEditProvider`.
- Copied verbatim, unchanged: `routes/promotions/**`, `routes/campaigns/**` (except the five files
  above), `components/table/table-cells/common/text-cell`, `.../common/code-cell`,
  `.../promotion/status-cell`, `.../sales-channel/name-cell`, `.../sales-channel/description-cell`,
  `hooks/table/columns/use-promotion-table-columns.tsx`, `.../use-campaign-table-columns.tsx`,
  `hooks/table/filters/use-promotion-table-filters.tsx`,
  `hooks/table/query/use-promotion-table-query.tsx` and `.../use-campaign-table-query.tsx`.
Added by wave-2 piece 8 (home page settings, `/home-settings`):

- `routes/home-settings/*` — own screen, no Admin counterpart: the Admin has no home-page
  document. Built from the panel's own copied primitives (`SingleColumnPage`, `Container`,
  the `@medusajs/ui` form controls, the `Combobox` the organize forms use). The pair it is
  compared against by screenshot is the Admin's `/app/settings/store`, the nearest screen in
  shape — one container of form rows saved in place — not in content.
- `routes/home-settings/composition.ts` — the composition vocabulary (six enums, the two
  FORBIDDEN pairs, the plain-language label and one-line "why" for every option) and the
  seven theme preset labels, hand-transcribed for the panel. The storefront keeps its own
  copy in `lib/theme/composition.ts` and the backend in
  `api/store/storefront-settings/validation.ts`; `pnpm-workspace.yaml` lists only `apps/**`,
  so there is no shared package the three could import one copy from. The English labels are
  the storefront catalog's own `Composition` namespace (`apps/storefront/messages/en.json`).
- `hooks/api/home.tsx` — `useTenantHome` / `useUpdateTenantHome` against `GET`/`PUT
  /tenants/home`. The response is one document or null, never a list, so there is no list
  query key and no `count/offset/limit`.
- Strings on this screen are `t(key, { defaultValue: "<English>" })`, the idiom
  `components/layout/main-layout` already uses for text the Admin's catalogs do not carry.
  The Russian half of the panel's trimmed catalogs therefore shows the English text on this
  screen until the keys are added; no catalog file was edited by this piece.

Own files, not copies (the Admin has nothing playing an equivalent role, or the prompt calls for a
from-scratch replacement):

- `app.tsx` — flat route tree for the panel's screens, replacing the Admin's
  plugin/virtual-module wiring (`DashboardApp`, `virtual:medusa/*`). Wave-2 piece 1 filled in the
  `/products/:id` subtree with the same child paths as the Admin's `get-route.map.tsx`, and
  wave-2 piece 5 the `/categories` subtree from the same map.
- `routes/home/*` — the Overview page (tenant name/handle, sales channel, publishable key with a
  copy button, links to Products/Orders).
- `routes/not-built/*` — placeholder for every route this piece stubs out.
- `routes/products/product-list`, `routes/products/product-create`,
  `routes/orders/order-list` — placeholders rendering `NotBuilt`; pieces 3 and 4 overwrite these
  directories. Export the same names the Admin's `index.ts` files export.
- `hooks/api/*` — tenant implementations of `auth`, `users`, `store`, `sales-channels`, `regions`,
  `price-preferences`, `product-types`, `tags`, `collections`, `shipping-profiles`, `products`,
  `product-options` and `orders`, calling `/tenants/*` per
  `docs/tenant-panel/api-contract.md` instead of `/admin/*`. Wave 2, piece 2 adds `payments`,
  `payment-collections`, `stock-locations`, `shipping-options`, `reservations`, `customers`,
  `returns`, `claims`, `exchanges`, `order-edits`, `plugins` and `not-built`, and extends `orders`
  with preview, changes, line items, fulfil, ship, cancel-fulfillment, mark-delivered, cancel and
  export.
- `hooks/api/not-built.ts` — the rejection every out-of-scope mutation is wired to (RMA cancels,
  order-edit cancel and confirm, order transfer cancel, mark-a-payment-collection-paid, authorize a
  payment session). Those sections never render on a tenant order, because the tenant backend
  answers an empty page for returns, claims, exchanges and order changes; the hooks exist so the
  copied screens compile.
- `hooks/api/plugins.tsx` — resolves to the empty list without a request. The panel loads no
  extensions, so there is nothing for `GET /admin/plugins` to report and no tenant route for it.
- `hooks/api/users.tsx` `useUser` — resolves to `undefined` without a request. The order timeline's
  `UserLink` resolves staff-user ids; a tenant panel has no staff-user directory, so the timeline
  renders nothing for an action a staff member took.

Copied verbatim but not part of the Admin's own file set: none beyond what's listed above; every
other file under `src/components`, `src/providers`, `src/lib` and `src/routes/login` /
`src/routes/no-match` is byte-for-byte the Admin's file at its same relative path.

Not copied at all (no consumer in this piece's scope): `providers/extension-provider`,
`providers/search-provider`, `providers/permissions-provider`, `providers/layout-edit-provider`
(only its context file is kept, see below), `providers/customizer-host-provider`,
`components/layout/notifications`, `components/layout/settings-layout`,
`components/authentication/route-permission-guard`, `components/common/permission-guard`,
`components/common/user-link`, `hooks/table/*`, `hooks/use-layout-customizer-trigger-host.tsx`,
`hooks/use-layout-dnd.ts`, `hooks/use-layout-preference.ts`, `hooks/use-require-rbac-feature.tsx`,
`hooks/use-resource-permissions.tsx`, `hooks/use-view-configurations.tsx`, `lib/permissions`,
`lib/table/*` and `components/common/infinite-list` (the last two were copied, then found unused
and broken without files this piece deliberately excludes, and removed).

`providers/layout-edit-provider/layout-edit-context.tsx` and `hooks/use-layout-edit.tsx` are kept
verbatim, unmounted: `useLayoutEdit()` reads `useContext(LayoutEditContext)`, and the context's own
default value is already edit-mode-off, so `components/layout/nav-item` (which reads it for nested
list reordering, unused here since the panel's nav has no nested items) works without a
`LayoutEditProvider` anywhere in the tree.

Added by wave-2 piece 7 (content pages, `/pages` and `/pages/:key`):

- `routes/pages/**` and `hooks/api/pages.tsx` — the panel's own screens and hook module, with no
  Admin counterpart to copy: the native Admin has no per-store content pages. They are built from
  the same copied primitives every other screen here uses (`SingleColumnPage`, `Container`,
  `Table`, `StatusBadge`, `RouteFocusModal`, `Form`, `KeyboundForm`), so they sit in the Admin's
  shell unchanged, but the file-by-file diff Ivan's acceptance asks for has nothing to diff
  against — the screenshot pair is `panel-pages.png` against `admin-pages.png`
  (`/app/settings/store`, the nearest Admin screen of the same kind), and `panel-page-edit.png`
  stands alone.
- `routes/pages/page-sections.ts` — the five section labels ("Contacts", "Legal details", "About
  the shop", "Privacy policy", "Public offer") and the three status words (Published / Draft /
  Empty) are written here in plain English rather than pulled from the Admin's i18n catalogue,
  which has no string for any of them. The panel's own catalogue (`i18n/translations`) carries
  English and Russian; these strings are English-only, like the sidebar's own `defaultValue`
  labels for the wave-2 sections.
- A plain `Table` rather than the copied `DataTable`: the list is five fixed rows with no
  server-side filtering, sorting or pagination, which is DataTable's entire surface.
