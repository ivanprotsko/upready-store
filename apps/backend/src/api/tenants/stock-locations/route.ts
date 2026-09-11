/**
 * `GET /tenants/stock-locations` — the Admin's own list handler, re-exported.
 * Read-only reference data: the order-detail fulfillment section and the
 * create-fulfillment form name the location a fulfillment ships from, and the
 * stands have one warehouse per tenant plus the shared default. Locations are
 * store configuration, not another tenant's rows, so the list is global, the
 * same way `/tenants/regions` and `/tenants/shipping-profiles` are
 * (docs/tenant-panel/api-contract.md, "read-only reference lists").
 *
 * Only `GET` crosses over; the Admin's write verbs stay out of the tenant
 * namespace. The route still sits behind the `/tenants/*` authentication.
 */
export { GET } from "@medusajs/medusa/api/admin/stock-locations/route";
