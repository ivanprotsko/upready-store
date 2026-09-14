// tenant-panel: trimmed barrel, same reason as hooks/table/columns/index.ts.
// `parseFilterParam` is generic (used by components/table/configurable-data-table
// via this barrel); `use-product-table-query` is the one resource hook this
// panel ships. Own file, not part of the Admin's file set at this path.
export * from "./parse-filter-param"
export * from "./use-product-table-query"
// tenant-panel: wave 2, piece 3. `use-order-table-query` was already in the
// tree for the order list, which imports it by path; the copied order-export
// screen imports it from this barrel, so the barrel names it too.
export * from "./use-order-table-query"
// tenant-panel: t13-customers-screen. Own hook, no Admin counterpart at this
// path — the Admin's customer list has no computed `orders_count` sort.
export * from "./use-customer-table-query"
