/**
 * `GET /tenants/promotions/rule-attribute-options/:rule_type` — the attributes a
 * promotion rule may be written against, for the rule-builder comboboxes.
 *
 * The Admin's own handler, re-exported: the answer is a static map
 * (`getRuleAttributesMap`, keyed by promotion type and application method), it
 * touches no tenant data, and the panel's copied forms read its exact shape.
 * Measured on this backend for `rules` (2026-09-11, :9032):
 *
 *   customer_group -> "customer.groups.id"       region -> "region.id"
 *   country -> "shipping_address.country_code"   sales_channel -> "sales_channel_id"
 *   currency_code -> "currency_code"
 *
 * `sales_channel -> sales_channel_id` is the attribute `POST /tenants/promotions`
 * forces onto every promotion it creates.
 */
export { GET } from "@medusajs/medusa/api/admin/promotions/rule-attribute-options/[rule_type]/route";
