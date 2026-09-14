// tenant-panel: scoped barrel. The Admin's hooks/table/filters/index.ts
// re-exports thirteen domain filter hooks (collections, customers, customer
// groups, products, product tags/types, promotions, regions, shipping
// options, tax rates, ...); this panel has only the orders screen (piece 4)
// and the products screens (piece 3), so only those two hooks are exported.
// Add the sibling export here, verbatim, if a later piece copies another
// screen from the same barrel import.
export * from "./use-order-table-filters"
export * from "./use-product-table-filters"
