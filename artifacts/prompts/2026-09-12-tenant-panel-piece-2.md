# Pieces 2 + 3: order detail (fulfill / ship / capture / cancel) and orders CSV export

Piece id `mt2-piece-2`. Worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-panel-2-orders`
(branch `feat/mt-panel-2-orders`). Ports: backend 9029, panel 5184, seam PORT 9043. Read
`artifacts/prompts/2026-09-12-tenant-panel-common.md` first, then contract sections "Piece 2" and
"Piece 3".

Build, checking `tsc` after each step:
1. Backend: `assertOwnedOrder` helper (tenant-order link) in `tenants/orders/helpers.ts`; routes under
   `api/tenants/orders/[id]/**`, `api/tenants/orders/export`, `api/tenants/payments/[id]/capture`,
   and the read-only references the contract lists (stock-locations, fulfillment-providers,
   shipping-options, reservations, customers/:id, returns, claims, exchanges, order-edits — the last
   four as empty pages). Mirror `@medusajs/medusa/dist/api/admin/orders/[id]/**/route.js` for the
   workflows and the preview/changes shapes. Matchers under `// ---- piece 2` and `// ---- piece 3`.
2. Export: `POST /tenants/orders/export` builds the CSV synchronously for the tenant's own orders
   (columns in the contract) and stores it through `uploadFilesWorkflow`, answering `{ url }`. Note:
   the local file provider hands back a URL on port 9000 whatever port the backend uses (contract,
   uploads paragraph) — the panel opens the URL as given; report that fact, do not patch the provider.
3. Panel: copy `routes/orders/order-detail/**`, `order-create-fulfillment`, `order-create-shipment`,
   `order-export`, `routes/orders/common`; wire `/orders/:id/**` and `/orders/export` at the piece-2
   and piece-3 anchors. Hooks: extend `orders.tsx`, add the modules the contract names, each trimmed
   to what the screens call. Actions that are out of scope (returns, claims, exchanges, edits,
   transfer, address/email edits, refund) route to `routes/not-built`, each with a comment; the
   timeline and RMA sections render empty lists without crashing.
4. Seam tests (`tenants-orders-detail.spec.ts`): create an order for tenant A (helpers exist in
   `tenants.spec.ts`: region, `createOrdersWorkflow`, `linkOrderToTenantWorkflow`), GET detail as A →
   200, as B → 404; fulfillment create + shipment as A → statuses advance; cancel as B → 404;
   capture of A's payment by B → 404; export as B → CSV without A's order, as A → with it.
5. e2e: open Acme order #1 from the list, see items, totals and status words; create a fulfillment
   and mark it shipped from the panel; Globex opening the same URL sees the 404 state; export from
   the orders list produces a URL.
6. Screenshot pairs: `order-detail`, `order-fulfillment-create`, `order-export`.
