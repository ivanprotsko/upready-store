# Piece 3: products list + product create, copied from the Admin

Read `artifacts/prompts/2026-09-11-tenant-panel-common.md` in your worktree first, then
`apps/tenant-panel/README.md` (piece 1's deviations), `docs/tenant-panel/api-contract.md`, `AGENTS.md`.

Worktree: `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-panel-products` (branch
`feat/mt-panel-products`). Piece id for emit: `mt-panel-3`. Dev server port 5183
(`corepack pnpm exec vite --port 5183 --strictPort` from `apps/tenant-panel`, log
`/tmp/mt-panel-3-vite.log`). The backend on 9023 already serves the contract routes.

## Goal

`/products` and `/products/create` in the panel are the Admin's `routes/products/product-list`
and `routes/products/product-create` screens, copied file-for-file from
`apps/backend/node_modules/@medusajs/dashboard/src` into the same relative paths under
`apps/tenant-panel/src`, replacing piece 1's placeholders. Everything they import that is not yet
in `apps/tenant-panel/src` is copied verbatim too (`components/data-grid`, `components/table`,
`components/modals`, `components/forms`, `hooks/table/*`, `hooks/use-*`, `lib/*`, …). Existing
files in `src/hooks/api`, `src/components/layout*`, `src/providers`, `src/routes/login`,
`src/routes/home`, `src/app.tsx` are piece 1's: do not rewrite them. If a hook module you need is
missing, add a new file in `src/hooks/api` following the pattern of the existing ones and export it
from `index.ts`; if an existing hook lacks an export, add the export in place with a comment.

## Allowed changes inside the copied screen files (each marked with a `// tenant-panel:` comment)

- Direct `sdk.admin.<x>.list(params)` calls (organize section comboboxes for collections, types,
  tags, shipping profiles; the variant section's `productOption.list`; the inventory kit section's
  `inventoryItem.list`; `loader.ts`) → `sdk.client.fetch("/tenants/<resource>", { query: params })`
  with the plural response key the contract gives. `sdk.admin.upload.create` in
  `product-create-form.tsx` → `POST /tenants/uploads` (multipart via `sdk.client.fetch` with a
  `FormData` body and `headers: { "Content-Type": null }` the way the js-sdk's upload does; read
  `apps/backend/node_modules/@medusajs/js-sdk/dist/esm/admin/upload.js`).
- After a successful create, navigate to `/products` instead of `/products/<id>` (the panel has
  no product detail page).
- Feature flags stay on piece 1's static provider (all false), so `ProductListTable` renders, not
  the configurable one; `ConfigurableProductListTable` may still be copied for import parity but
  must compile.
- Nothing else. Row click, actions menu, filters, pagination, search, the create modal's tabs and
  the variants data grid stay as upstream.

## Verification (return codes in the report)

- `corepack pnpm exec tsc --noEmit` rc 0 and `corepack pnpm exec vite build` rc 0.
- Live with Playwright (chromium installed; resolve `playwright` from the worktree root
  `node_modules`): log in as `admin@acme.test`, open `/products`: the table shows 4 rows and the
  pagination says 4; the search box with an Acme title narrows to 1; log in as
  `admin@globex.test` in a fresh context: 2 rows, none of Acme's titles. Then as Acme open
  `/products/create`, fill title `Night wave test <HHMM>`, one option `Size` with value `M`, one
  variant with a EUR price, save and publish; the list now shows 5 rows; the storefront
  `http://localhost:8000/en/store` lists the new title within 60 s and `http://localhost:8001/en/store`
  and `:8002` do not (curl the pages, grep the title). Screenshots to `/tmp/mt-panel-3/*.png`:
  list (acme), list (globex), create modal (details tab), create modal (variants tab), list after
  create. Report the script path and its output. Leave the created product in place (the morning
  acceptance looks at it) and write its id into the report.
- Kill your vite before finishing.
