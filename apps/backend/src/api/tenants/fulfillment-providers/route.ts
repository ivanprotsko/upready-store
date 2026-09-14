/**
 * `GET /tenants/fulfillment-providers` — the Admin's own list handler,
 * re-exported. Read-only reference data: the create-fulfillment form shows
 * which provider will handle the shipment. Providers are backend
 * configuration, global by nature.
 */
export { GET } from "@medusajs/medusa/api/admin/fulfillment-providers/route";
