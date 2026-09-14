import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";

/**
 * The tenant's home-page document: the site-wide block composition in the
 * vocabulary shared with `apps/storefront/src/lib/theme/composition.ts`
 * (`upready.storefront-settings/v1`: defaultMode, header, hero, tiles,
 * listing, footer), plus the tenant's own content for those blocks (hero
 * text/CTA/image, which products the listing shows, block order) and its
 * theme preset. Schema and validation: `docs/tenant-panel/api-contract.md`,
 * section "Home page document". One row per tenant.
 */
const TenantHomeConfig = model.define("tenant_home_config", {
  id: model.id({ prefix: "thome" }).primaryKey(),
  config: model.json(),
  tenant: model.belongsTo(() => Tenant, {
    mappedBy: "home_config",
  }),
});

export default TenantHomeConfig;
