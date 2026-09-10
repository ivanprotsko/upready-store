// tenant-panel: trimmed barrel, same reason as hooks/table/columns/index.ts.
// `parseFilterParam` is generic (used by components/table/configurable-data-table
// via this barrel); `use-product-table-query` is the one resource hook this
// panel ships. Own file, not part of the Admin's file set at this path.
export * from "./parse-filter-param"
export * from "./use-product-table-query"
