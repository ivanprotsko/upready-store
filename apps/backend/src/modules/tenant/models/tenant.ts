import { model } from "@medusajs/framework/utils";
import TenantAdmin from "./tenant-admin";

/**
 * One tenant = one storefront on the shared backend. The recipe this module
 * follows (docs.medusajs.com/resources/recipes/marketplace/examples/vendors)
 * calls it a vendor; here it is the store owner of one shop.
 *
 * The two Medusa handles a tenant owns, its sales channel and its publishable
 * API key, are module links rather than columns here
 * (`src/links/tenant-sales-channel.ts`, `src/links/tenant-api-key.ts`), written
 * by `createTenantWorkflow` right after the row. A link is what Medusa's own
 * workflows maintain: `deleteSalesChannelsWorkflow` removes it through
 * `removeRemoteLinkStep`, where a text column would keep a dead id. Products a
 * tenant creates go into that sales channel, the storefront calls the API with
 * that key, and an order placed through it carries the sales channel id, which
 * is how `linkOrderToTenantWorkflow` walks the link back to the owner.
 */
const Tenant = model.define("tenant", {
  id: model.id({ prefix: "ten" }).primaryKey(),
  handle: model.text().unique(),
  name: model.text(),
  metadata: model.json().nullable(),
  admins: model.hasMany(() => TenantAdmin, {
    mappedBy: "tenant",
  }),
});

export default Tenant;
