# Piece 6: promotions and campaigns (`/promotions/**`, `/campaigns/**`)

Piece id `mt2-piece-6`. Worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-panel-2-promotions`
(branch `feat/mt-panel-2-promotions`). Ports: backend 9032, panel 5186, seam PORT 9045. Read
`artifacts/prompts/2026-09-12-tenant-panel-common.md` first, then the contract section "Piece 6".

Build, checking `tsc` after each step:
1. Backend: `listTenantPromotionIds`/`assertOwnedPromotion` and the campaign twins in
   `tenants/tenant-scope.ts` (links tenant-promotion, tenant-campaign); routes under
   `api/tenants/promotions/**` and `api/tenants/campaigns/**` as the contract lists, mirroring
   `@medusajs/medusa/dist/api/admin/promotions/**` and `admin/campaigns/**` (validators/query-configs
   from `@medusajs/medusa/api/admin/promotions|campaigns`). The create route adds/forces the
   `sales_channel_id eq <tenant channel>` rule (measure first: `GET /admin/promotions/rule-attribute-options/rules`
   on your backend with the Admin token, cite the output line); `rules/batch` refuses to delete or
   alter it. `rule-value-options/rules/sales_channel` answers only the tenant's channel. Matchers under
   `// ---- piece 6`.
2. Panel: copy `routes/promotions/**` and `routes/campaigns/**` (+ `common`), wire both subtrees at the
   piece-6 anchor like the Admin route map; hooks `promotions.tsx`, `campaigns.tsx` to `/tenants/*`.
3. Seam tests (`tenants-promotions.spec.ts`): A creates a promotion → the response carries the
   sales_channel rule with A's channel; A lists 1, B lists 0; B on A's id → 404; a cart in A's channel
   with the code gets the discount, a cart in B's channel does not (use `/store/carts` with each key,
   `POST /store/carts/:id/promotions`); campaign create + add promotion; B cannot add A's promotion.
4. e2e: Acme creates a percentage promotion with a code from the panel, sees it in the list and in
   the detail with its rules; Globex does not see it.
5. Screenshot pairs: `promotions`, `promotion-create`, `promotion-detail`, `campaigns`.
