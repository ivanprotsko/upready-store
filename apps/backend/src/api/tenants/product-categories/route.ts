/**
 * `GET /tenants/product-categories` — global reference data:
 * the catalog's category tree, offered as a combobox on the panel's
 * product form (organize section, `category-combobox` copied from the Admin).
 *
 * This is the Admin's own `GET /admin/product-categories` handler,
 * re-exported rather than copied, so the shape the panel reads cannot drift
 * from the Admin's. The query is parsed by the Admin's validator and query
 * config, wired for this matcher in `src/api/middlewares.ts`. Only `GET`
 * crosses over; the write verbs on the Admin route stay out of the tenant
 * namespace.
 */
export { GET } from "@medusajs/medusa/api/admin/product-categories/route";
