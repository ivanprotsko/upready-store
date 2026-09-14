/**
 * `GET /tenants/shipping-options` — the Admin's own list handler, re-exported.
 * Read-only reference data: the create-shipment form picks the shipping option
 * a fulfillment ships under. Options belong to the store's fulfillment sets,
 * not to a tenant.
 */
export { GET } from "@medusajs/medusa/api/admin/shipping-options/route";
