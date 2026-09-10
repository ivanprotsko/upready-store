# Piece 1: tenant panel skeleton (apps/tenant-panel)

Read `artifacts/prompts/2026-09-11-tenant-panel-common.md` in your worktree first, then
`docs/tenant-panel/api-contract.md`, then `AGENTS.md`.

Worktree: `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-panel-skeleton` (branch
`feat/mt-panel-skeleton`). Piece id for emit: `mt-panel-1`. Your dev server port: 5181
(`corepack pnpm exec vite --port 5181 --strictPort`, run from `apps/tenant-panel`, log to
`/tmp/mt-panel-1-vite.log`; it proxies `/auth` and `/tenants` to `http://localhost:9023`).

## Goal

`apps/tenant-panel` becomes a runnable Vite app that logs a tenant admin in, shows the Admin's
shell (sidebar, top bar, user menu) with exactly three sidebar items (Overview, Products, Orders),
an Overview page, placeholder Products/Orders pages, and provides every `hooks/api/*` module the
copied product and order screens will import (pieces 3 and 4 add those screens on top of your
work without touching the router or the hooks). The scaffold (package.json, vite config, tailwind,
tsconfig, `src/main.tsx`, placeholder `src/app.tsx`) already exists and builds; keep the configs.

Source of the copies: `apps/backend/node_modules/@medusajs/dashboard/src` (D below). Reference
for the Vite app shape: `/Users/ivanprotsko/upready/projects/medusa/packages/admin/dashboard` (read-only).

## What to build, in order

1. `src/app.tsx`: a `createBrowserRouter` + `RouterProvider` app wrapped in the panel's
   `Providers`. Routes (paths identical to the Admin so screenshots and URLs compare):
   - `/login` → `routes/login` (public layout, see D/dashboard-app/routes/get-route.map.tsx for how
     the Admin nests login under `PublicLayout`).
   - `/` → the panel's `ProtectedRoute` → `MainLayout` → children:
     - index → `routes/home` (Overview, yours, see 6).
     - `/products` → lazy import of `./routes/products/product-list` with a nested child route
       `create` → lazy `./routes/products/product-create` (copy the exact route objects the Admin
       uses for these two in get-route.map.tsx, including `loader`, `handle`, `Component` naming).
     - `/products/:id` → `routes/not-built`.
     - `/orders` → lazy `./routes/orders/order-list` (same treatment as products).
     - `/orders/:id` and `/orders/export` → `routes/not-built`.
     - `*` → `routes/no-match` copied verbatim.
   Create placeholder modules at `src/routes/products/product-list/index.ts`,
   `src/routes/products/product-create/index.ts`, `src/routes/orders/order-list/index.ts` that
   export the same names the Admin's `index.ts` files export (`Component`, `loader` where the
   Admin has one) and render `routes/not-built`; header comment `// tenant-panel: placeholder,
   replaced by piece 3/4`. Pieces 3 and 4 overwrite those directories.
2. `src/providers`: copy `providers.tsx`, `theme-provider`, `i18n-provider`, `sidebar-provider`,
   `keybind-provider` if the layout needs it. Drop `ExtensionProvider` (no extensions) and replace
   `feature-flag-provider` with your own module exposing the same exports (`FeatureFlagProvider`,
   `useFeatureFlag`, `useFeatureFlags`) where every flag is `false` and nothing is fetched. Keep
   the provider order of upstream.
3. `src/lib`: copy `client/` (then change `backendUrl` to `__BACKEND_URL__ || window.location.origin`,
   comment it), `query-client.ts`, `query-key-factory.ts`, and every `lib/*` module the copied files
   import. `src/components`: copy `layout/*` (except `notifications`, which needs `/admin/notifications`;
   remove its usage from `shell.tsx`/`main-layout.tsx` with a comment), `common/*`,
   `utilities/*`, and whatever else the copied files import, verbatim. `src/hooks`: copy
   `use-*` hooks and `hooks/table/*` that the layout and login import.
   In `main-layout.tsx` cut the sidebar to three `NavItem`s: Overview (`/`), Products
   (`/products`), Orders (`/orders`), with the Admin's own icons for products and orders; remove
   the search trigger and settings/extension sections. Keep the store name block at the top
   (`useStore().store.name`) and the user menu (`useMe`, `useLogout`) as upstream.
4. Write your own `src/components/layout-composer/index.ts` exporting `LayoutComposer` with the
   same props the Admin's `components/layout-composer/layout-composer.tsx` accepts
   (`widgetsZonePrefix`, `preferredLayoutId`, `hasOutlet`, `sections`, `showDetailsTitle`, …
   read `types.ts` and `core-layouts.tsx`) and `LayoutComposer.Entry` with its props. Rendering:
   `sections.main` inside `SingleColumnPage`-style markup (copy `components/layout/pages` and use
   it), `sections.sidebar` in a two-column layout when present, `<Outlet />` when `hasOutlet` is
   not `false`, no drag-and-drop, no widgets. Header comment explains the deviation.
5. Write your own `src/components/authentication/protected-route/protected-route.tsx`: same
   behaviour as the Admin's (spinner while `useMe` loads, redirect to `/login` with `state.from`
   when there is no user, `SidebarProvider` around the outlet), without RBAC and without
   `SearchProvider`.
6. `src/routes/home`: Overview page, the panel's own. Use `SingleColumnPage` and the Admin's
   `Container`/`Heading`/`Text` primitives from `@medusajs/ui`: tenant name and handle, sales
   channel name, publishable key (redacted form plus a copy button using `components/common/copy`),
   and two `Link`s to `/products` and `/orders`. Data from `useMe()` (the tenant is inside).
7. `src/routes/login`: copy the directory, then in `login.tsx` remove `useExtension`/widgets,
   `CloudAuthLogin`, `SsoLogin`, MFA state and `MfaChallengeCard`, the reset-password link;
   change the default `from` to `/`. Keep `EmailPassLogin` and its `onMfaChallenge` prop
   (pass a no-op). `email-pass-login.tsx` stays verbatim except the import path if needed.
8. `src/hooks/api/*`: write the tenant implementations, one module per Admin module name, export
   names and signatures identical to the Admin's (read each upstream module first; copy its
   query-key factory lines and type imports, replace `sdk.admin.<x>.<y>(…)` with
   `sdk.client.fetch<HttpTypes.…>("/tenants/…", { method, query, body })`):
   - `auth.tsx`: `useSignInWithEmailPass` → `sdk.auth.login("tenant", "emailpass", payload)`;
     `useLogout`; `useAuthProviders` → `sdk.auth.listProviders("tenant")`; keep
     `provisionAuthUser`, `useResetPasswordForEmailPass`, `useUpdateProviderForEmailPass` only if
     something you copied imports them.
   - `users.tsx`: `useMe` → `GET /tenants/me`, returned as `{ user: { id, email, first_name,
     last_name, tenant }, … }` so the layout's `user.first_name` reads work.
   - `store.tsx`: `useStore` → `GET /tenants/store`.
   - `sales-channels.tsx`: `useSalesChannels`, `useSalesChannel`, `salesChannelsQueryKeys`.
   - `regions.tsx`: `useRegions`, `regionsQueryKeys`. `price-preferences.tsx`: `usePricePreferences`.
   - `product-types.tsx`, `tags.tsx`, `collections.tsx`, `shipping-profiles.tsx`: the `use<X>s`
     list hooks and the `<x>QueryKeys` factories.
   - `products.tsx`: `productsQueryKeys`, `variantsQueryKeys`, `useProducts`, `useProduct`,
     `useCreateProduct` (POST `/tenants/products`, invalidate `productsQueryKeys.lists()`),
     `useDeleteProduct` (DELETE `/tenants/products/:id`). `product-options.tsx`:
     `productOptionsQueryKeys`, `useProductOptions` → `GET /tenants/product-options`.
   - `orders.tsx`: `ordersQueryKeys`, `useOrders` (GET `/tenants/orders`), `useOrder`.
   - `index.ts`: a barrel that re-exports exactly these modules.
   Response and param types: `HttpTypes.Admin*` from `@medusajs/types`, as upstream.
9. i18n: copy `i18n/` structure with `translations/en.json` and `translations/ru.json` only;
   rewrite `translations/index.ts` and `languages.ts` for the two locales. Copy
   `components/utilities/i18n` if `providers.tsx` needs it.
10. `README.md` in `apps/tenant-panel`: what it is, how to run (`corepack pnpm dev` → port 5180),
    the proxy vs direct mode, the list of deviations from upstream files (one line each).

## Verification (all from `apps/tenant-panel`, all reported with return codes)

- `corepack pnpm exec tsc --noEmit` → rc 0.
- `corepack pnpm exec vite build` → rc 0.
- Live: start vite on 5181; with Playwright from the workspace
  (`node -e` script using `require('playwright')` resolved from the worktree root
  `node_modules`, chromium is installed) open `http://localhost:5181/login`, log in as
  `admin@acme.test` / `supersecret`, assert the URL becomes `/` and the Overview shows the tenant
  name `Acme`, click Products and Orders in the sidebar (placeholders render inside the layout),
  open the user menu and log out (back on `/login`). Save screenshots to
  `/tmp/mt-panel-1/{login,overview,products,orders}.png`. Report the script path and its output.
- `curl -s -o /dev/null -w '%{http_code}' http://localhost:5181/tenants/me` → 401 (proxy works,
  unauthenticated).
- Kill your vite before finishing.
