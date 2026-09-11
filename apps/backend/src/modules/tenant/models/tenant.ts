import { model } from "@medusajs/framework/utils";
import TenantAdmin from "./tenant-admin";
import TenantDomain from "./tenant-domain";
import TenantHandleAlias from "./tenant-handle-alias";
import TenantHomeConfig from "./tenant-home-config";
import TenantPage from "./tenant-page";

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
  // Wave 2 of the tenant panel (t-2026-09-11-mt-panel-wave-2): content pages,
  // the home-page document and custom storefront hosts belong to the tenant.
  pages: model.hasMany(() => TenantPage, {
    mappedBy: "tenant",
  }),
  home_config: model.hasOne(() => TenantHomeConfig, {
    mappedBy: "tenant",
  }),
  domains: model.hasMany(() => TenantDomain, {
    mappedBy: "tenant",
  }),
  // Every handle this shop has ever answered on, kept for the 301s and reserved
  // for good (`tenant-handle-alias.ts`, specs/tenant-address/CANONICAL.md §1.2).
  handle_aliases: model.hasMany(() => TenantHandleAlias, {
    mappedBy: "tenant",
  }),
});

export default Tenant;
