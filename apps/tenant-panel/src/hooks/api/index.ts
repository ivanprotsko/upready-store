// tenant-panel: barrel of the panel's own hooks/api modules, one per Admin
// module name the copied screens import from (see AGENTS.md and
// docs/tenant-panel/api-contract.md). Re-exports exactly the modules this
// piece implements; the Admin's barrel re-exports ~50, one per domain it has.
export * from "./auth"
export * from "./users"
export * from "./store"
export * from "./sales-channels"
export * from "./regions"
export * from "./price-preferences"
export * from "./product-types"
export * from "./tags"
export * from "./collections"
export * from "./shipping-profiles"
export * from "./products"
export * from "./product-options"
// t15-product-attributes: the shop's own product characteristics.
export * from "./product-attributes"
export * from "./orders"
// tenant-panel: added by piece 3, rewritten by wave-2 piece 5. See the comment
// atop categories.tsx: /tenants/product-categories is the tenant's own tree.
export * from "./categories"
// tenant-panel: added by piece 3. See the comment atop views.tsx: dead code,
// kept only so the feature-flagged-off ConfigurableProductListTable compiles.
export * from "./views"
// tenant-panel: added by wave-2 piece 1 (product detail). Variant, inventory
// and stock-location reads the copied product-detail screens make.
export * from "./product-variants"
export * from "./inventory"
export * from "./stock-locations"
// tenant-panel: added by wave 2, piece 2 (order detail) and piece 3 (orders
// export). `not-built` is intentionally NOT re-exported: it is a helper for the
// hook modules, not a hook.
export * from "./payments"
export * from "./payment-collections"
export * from "./shipping-options"
export * from "./reservations"
export * from "./customers"
export * from "./returns"
export * from "./claims"
export * from "./exchanges"
export * from "./order-edits"
export * from "./plugins"
// tenant-panel: added by wave 2, piece 7 (content pages). The panel's own
// module, no Admin counterpart.
export * from "./pages"
// tenant-panel: added by wave-2 piece 6 (promotions + campaigns). Both modules
// are the Admin's own hooks pointed at /tenants/promotions and /tenants/campaigns.
export * from "./promotions"
export * from "./campaigns"
// tenant-panel: added by wave 2, piece 8 (home page document).
export * from "./home"
export * from "./payment-settings"
