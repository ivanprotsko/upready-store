/**
 * `GET /tenants/shipping-profiles` — global reference data:
 * the store's shipping profiles; a product needs one, and the panel's
 * product form picks the default.
 *
 * This is the Admin's own `GET /admin/shipping-profiles` handler, re-exported
 * rather than copied, so the shape the panel reads cannot drift from the
 * Admin's. The query is parsed by the Admin's validator and query config,
 * wired for this matcher in `src/api/middlewares.ts`. Only `GET` crosses
 * over; the write verbs on the Admin route stay out of the tenant namespace.
 */
export { GET } from "@medusajs/medusa/api/admin/shipping-profiles/route";
