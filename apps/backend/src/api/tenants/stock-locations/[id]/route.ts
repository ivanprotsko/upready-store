/**
 * `GET /tenants/stock-locations/:id` — the Admin's own retrieve handler,
 * re-exported. Read-only reference data, same reasoning as the list route next
 * to it: the order-detail fulfillment section resolves a fulfillment's
 * location name through it. No write verbs cross over.
 */
export { GET } from "@medusajs/medusa/api/admin/stock-locations/[id]/route";
