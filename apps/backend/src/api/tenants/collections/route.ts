/**
 * `GET /tenants/collections` — global reference data:
 * the catalog's product collections, offered as a combobox on the
 * panel's product form.
 *
 * This is the Admin's own `GET /admin/collections` handler, re-exported
 * rather than copied, so the shape the panel reads cannot drift from the
 * Admin's. The query is parsed by the Admin's validator and query config,
 * wired for this matcher in `src/api/middlewares.ts`. Only `GET` crosses
 * over; the write verbs on the Admin route stay out of the tenant namespace.
 */
export { GET } from "@medusajs/medusa/api/admin/collections/route";
