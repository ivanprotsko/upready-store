import { model } from "@medusajs/framework/utils";
import TenantAdmin from "./tenant-admin";

/**
 * One tenant = one storefront on the shared backend. The recipe this module
 * follows (docs.medusajs.com/resources/recipes/marketplace/examples/vendors)
 * calls it a vendor; here it is the store owner of one shop.
 *
 * `sales_channel_id` and `publishable_api_key_id` are the two Medusa handles a
 * tenant owns: `createTenantWorkflow` mints both before the tenant row exists,
 * so neither is nullable. Products a tenant creates are attached to that sales
 * channel, the storefront calls the API with that key, and an order placed
 * through it carries the sales channel id, which is how
 * `linkOrderToTenantWorkflow` finds the owner.
 */
const Tenant = model.define("tenant", {
  id: model.id({ prefix: "ten" }).primaryKey(),
  handle: model.text().unique(),
  name: model.text(),
  sales_channel_id: model.text().unique(),
  publishable_api_key_id: model.text().unique(),
  metadata: model.json().nullable(),
  admins: model.hasMany(() => TenantAdmin, {
    mappedBy: "tenant",
  }),
});

export default Tenant;
