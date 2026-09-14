import { defineLink } from "@medusajs/framework/utils";
import PromotionModule from "@medusajs/medusa/promotion";
import TenantModule from "../modules/tenant";

/**
 * Which tenant created a promotion. Ownership for `/tenants/promotions*`; the
 * promotion itself is confined to the tenant's carts by a `sales_channel_id`
 * rule the create route adds (verified on the live backend 2026-09-11:
 * `GET /admin/promotions/rule-attribute-options/rules` lists
 * `sales_channel` → `sales_channel_id`).
 */
export default defineLink(TenantModule.linkable.tenant, {
  linkable: PromotionModule.linkable.promotion.id,
  isList: true,
});
