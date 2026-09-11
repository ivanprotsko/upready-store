# Source
https://docs.medusajs.com/resources/commerce-modules/order

# Fetched
2026-09-11 (WebFetch)

# Topic
Whether Medusa's Order module documents any bulk/historical order import.

# Facts
- "there is no mention of bulk order import capability, CSV import, or migration tools" for historical
  orders anywhere on this documentation page.
- The only documented order-creation path is single-order creation via
  `orderModuleService.createOrders()`, used for draft orders created on a customer's behalf and later
  transformed to regular orders — not a bulk/CSV path.
- No batch/bulk order creation API, no CSV or file-based import, no migration tool, no scheduled bulk
  import documented.
- Cross-checked against `node_modules/.pnpm/@medusajs+core-flows@2.19.0.../dist/order/workflows`
  (2026-09-11): the directory has `export-orders.js` (export) and `create-order.js` (single order) but
  **no `import-orders*` file** — the same absence the docs page shows, from the installed package
  itself, not from memory.

# Used for
`docs/multitenancy/detach-spec.md` §3 (заказы — no native order import, CSV/DB-copy alternative) and
`docs/multitenancy/backup-spec.md` §4 (restore path for orders is the same limitation).
