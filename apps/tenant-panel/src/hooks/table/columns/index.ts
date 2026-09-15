// tenant-panel: trimmed barrel. The Admin's index.ts re-exports one
// use-*-table-columns hook per resource with a table (~13); this panel only
// ships the products screens, so only the product one is copied. Not part of
// the Admin's file set at this path (own file), same pattern as
// hooks/api/index.ts.
export * from "./use-product-table-columns"
// tenant-panel: t13-customers-screen. Own hook, no Admin counterpart.
export * from "./use-customer-table-columns"
