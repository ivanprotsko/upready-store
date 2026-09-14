# Piece 1: product detail and its sub-screens (`/products/:id/**`)

Piece id `mt2-piece-1`. Worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-panel-2-product-detail`
(branch `feat/mt-panel-2-product-detail`). Ports: backend 9028, panel 5183, seam PORT 9042. Read
`artifacts/prompts/2026-09-12-tenant-panel-common.md` first, then the contract section "Piece 1".

Build, in this order, checking `tsc` after each step so the tree never drifts far from green:
1. Backend routes under `apps/backend/src/api/tenants/products/[id]/**` and
   `apps/backend/src/api/tenants/product-variants/route.ts` exactly as the contract lists them,
   mirroring `@medusajs/medusa/dist/api/admin/products/[id]/**/route.js` (read the compiled file for the
   workflow and the response remap); every route calls `assertOwnedProduct` (extend
   `tenants/products/helpers.ts`) first. Update ignores `sales_channels` and re-applies the tenant's
   channel. Matchers under `// ---- piece 1`.
2. Panel: copy `routes/products/product-detail/**` plus the sub-route directories the contract names,
   and `routes/product-variants/**`; wire the `/products/:id` subtree in `app.tsx` at the piece-1
   anchor with the same child paths as the Admin's `get-route.map.tsx` (edit, media, options/create,
   options/:option_id/edit, variants/create, variants/:variant_id/*, prices, organization,
   attributes, metadata, shipping-profile, sales-channels, stock when it compiles). Extend
   `hooks/api/products.tsx` and add `product-variants.tsx` (+ any hook module a copied widget imports:
   `inventory.tsx`, `stock-locations.tsx` read-only, `fulfillment-sets.tsx` if needed — trimmed).
   Remove the dead `/settings/translations/edit` action with a comment.
3. Seam tests (`tenants-products-detail.spec.ts`): update title → visible in GET; create option +
   variant → variants listed; batch price update; delete variant; tenant B gets 404 on every verb
   against A's product and its variants; `GET /tenants/product-variants` for B has `count: 0` while A
   has its own.
4. e2e: open an Acme product from the list, edit the title, add a variant with a price, see both on
   the detail screen; Globex opening Acme's product URL gets the 404 state, not the product.
5. Screenshot pairs: `product-detail`, `product-edit`, `product-variant-create`, `product-prices`
   (Admin at `/app/products/<id>...` vs panel `/products/<id>...`, same product state — use the same
   Acme product on both sides; the Admin sees every product, so pick one Acme owns).
