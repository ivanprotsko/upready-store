# Piece 5: product categories (`/categories/**`)

Piece id `mt2-piece-5`. Worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-panel-2-categories`
(branch `feat/mt-panel-2-categories`). Ports: backend 9030, panel 5185, seam PORT 9044. Read
`artifacts/prompts/2026-09-12-tenant-panel-common.md` first, then the contract section "Piece 5".

Build, checking `tsc` after each step:
1. Backend: `listTenantCategoryIds` + `assertOwnedCategory` in `tenants/tenant-scope.ts` (tenant-product-category
   link, `tenant.product_categories.id` — check the link's graph name with a query first and cite it);
   `GET /tenants/product-categories` becomes the scoped list (Admin `AdminProductCategoriesParams` +
   `listProductCategoryConfig`, `refetchEntities("product_category", …)`); `POST` (create + link,
   `parent_category_id` must be owned), `GET/POST/DELETE /tenants/product-categories/:id`,
   `POST …/:id/products` (add/remove must be owned products). Public
   `GET /store/tenant/product-categories` through the shared helper (EXISTS in trunk, use it, do not rewrite it)
   `api/store/tenant/resolve-tenant.ts` (publishable key context → sales channel → tenant via the
   tenant-sales-channel link; export `resolveTenantFromPublishableKey(req)`), Store validator
   `StoreProductCategoriesParams` + `listProductCategoryConfig` from
   `@medusajs/medusa/api/store/product-categories`. Matchers under `// ---- piece 5`.
2. Panel: copy `routes/categories/**` (category-list, category-create, category-detail,
   category-edit, category-products, category-organize, categories-metadata, common) and wire
   `/categories/**` at the piece-5 anchor like the Admin route map; rewrite `hooks/api/categories.tsx`
   to `/tenants/product-categories` (list, retrieve, create, update, delete, batch products).
3. Seam tests (`tenants-categories.spec.ts`): A creates a category → A lists 1, B lists 0; B GET/POST/
   DELETE on A's id → 404; A adds its own product → `products` in detail; A adding B's product → 400;
   `/store/tenant/product-categories` with A's key shows A's category only, with B's key none.
4. e2e: Acme creates a category "Night 2 cat", opens it, adds an Acme product, sees it in the list;
   Globex list does not show it.
5. Screenshot pairs: `categories`, `category-detail`, `category-create`.
Note: the product-create organize combobox already reads this route; after the change it shows only
the tenant's own categories — expected, say so in the report.
