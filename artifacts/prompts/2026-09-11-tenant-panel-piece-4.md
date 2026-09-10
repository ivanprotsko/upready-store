# Piece 4: orders list, copied from the Admin

Read `artifacts/prompts/2026-09-11-tenant-panel-common.md` in your worktree first, then
`apps/tenant-panel/README.md` (piece 1's deviations), `docs/tenant-panel/api-contract.md`, `AGENTS.md`.

Worktree: `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-panel-orders` (branch
`feat/mt-panel-orders`). Piece id for emit: `mt-panel-4`. Dev server port 5184
(`corepack pnpm exec vite --port 5184 --strictPort` from `apps/tenant-panel`, log
`/tmp/mt-panel-4-vite.log`). The backend on 9023 already serves the contract routes.

## Goal

`/orders` in the panel is the Admin's `routes/orders/order-list` screen, copied file-for-file from
`apps/backend/node_modules/@medusajs/dashboard/src` into the same relative path under
`apps/tenant-panel/src`, replacing piece 1's placeholder. Everything it imports that is not yet in
`apps/tenant-panel/src` is copied verbatim too (`components/table`, `hooks/table/*` including
`hooks/table/filters/use-order-table-filters.tsx` and `hooks/table/columns/*`, `lib/*`,
`components/common/*`, …). Existing files from piece 1 (`src/hooks/api`, layout, providers, login,
home, `src/app.tsx`) are not rewritten; a missing hook module is added as a new file in
`src/hooks/api` following the existing pattern and exported from `index.ts`; a missing export on an
existing hook is added in place with a comment.

## Allowed changes inside the copied files (each marked with a `// tenant-panel:` comment)

- Direct `sdk.admin.*` calls, if any, → `sdk.client.fetch("/tenants/…")` per the contract.
- Feature flags stay on piece 1's static provider (all false), so `OrderListTable` renders;
  `ConfigurableOrderListTable` may be copied for import parity but must compile.
- Nothing else. Row click (leads to the panel's not-built page for `/orders/:id`), the Export
  button, filters (regions, sales channels, dates, status), pagination and search stay as upstream.

## Verification (return codes in the report)

- `corepack pnpm exec tsc --noEmit` rc 0 and `corepack pnpm exec vite build` rc 0.
- Live with Playwright (chromium installed; resolve `playwright` from the worktree root
  `node_modules`): log in as `admin@acme.test`, open `/orders`: the table lists Acme's orders
  (there is at least one placed on storefront :8000; count it with
  `GET http://localhost:9023/tenants/orders` using a bearer token and compare), statuses render as
  words through the Admin's status badge, totals show a currency; log in as `admin@globex.test`
  in a fresh context: none of Acme's display ids appear. Screenshots to `/tmp/mt-panel-4/*.png`:
  orders (acme), orders (globex), the status filter open. Report the script path and its output.
- Kill your vite before finishing.
