import { defineLink } from "@medusajs/framework/utils";
import OrderModule from "@medusajs/medusa/order";
import TenantModule from "../modules/tenant";

/**
 * Which tenant an order belongs to. Written by `linkOrderToTenantWorkflow`
 * (from the `order.placed` subscriber) by matching the order's sales channel
 * to the tenant that owns it; read by `GET /tenants/orders`.
 */
export default defineLink(TenantModule.linkable.tenant, {
  linkable: OrderModule.linkable.order.id,
  isList: true,
});
