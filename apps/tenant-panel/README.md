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
- `routes/login/login.tsx` — drops extension widgets, `CloudAuthLogin`, `SsoLogin`, MFA state and
  the reset-password link.
- `routes/login/components/email-pass-login.tsx` — default post-login redirect changed from
  `/orders` to `/`.
- `lib/client/client.ts` — `backendUrl` falls back to `window.location.origin` instead of `"/"`
  (the panel isn't always served from the backend's own origin the way the Admin at `/app` is).
- `components/common/required-permissions-section/required-permissions-section.tsx` — stub
  (renders `null`); no RBAC, so nothing to list.

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

Own files, not copies (the Admin has nothing playing an equivalent role, or the prompt calls for a
from-scratch replacement):

- `app.tsx` — flat route tree for the panel's three screens, replacing the Admin's
  plugin/virtual-module wiring (`DashboardApp`, `virtual:medusa/*`).
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
