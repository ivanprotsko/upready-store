/**
 * `GET /tenants/price-preferences` — global reference data:
 * the tax-inclusivity preference per currency and region, which the
 * panel's price grid reads to label a price gross or net.
 *
 * This is the Admin's own `GET /admin/price-preferences` handler, re-exported
 * rather than copied, so the shape the panel reads cannot drift from the
 * Admin's. The query is parsed by the Admin's validator and query config,
 * wired for this matcher in `src/api/middlewares.ts`. Only `GET` crosses
 * over; the write verbs on the Admin route stay out of the tenant namespace.
 */
export { GET } from "@medusajs/medusa/api/admin/price-preferences/route";
