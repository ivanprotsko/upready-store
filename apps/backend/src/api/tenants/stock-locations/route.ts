/**
 * `GET /tenants/stock-locations` — read-only reference list, the Admin's own
 * handler behind the `/tenants/*` authentication. The copied product-stock
 * loader needs the location names to label the stock grid's columns.
 *
 * Stock locations are installation-wide configuration, like regions and
 * shipping profiles, and carry no tenant data; only `GET` crosses over, so the
 * Admin's write verbs stay out of the tenant namespace.
 */
export { GET } from "@medusajs/medusa/api/admin/stock-locations/route";
