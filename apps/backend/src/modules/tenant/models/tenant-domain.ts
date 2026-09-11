import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";

/**
 * A custom host the tenant's storefront answers on (`vasya.com`). Unique across
 * tenants: two shops can never claim one host. The technical subdomain
 * `<handle>.upready.dev` (base domain `upready.dev`, Ivan 2026-09-11) is NOT a row here; it is derived from `tenant.handle`
 * and the platform's base domains at resolve time, so every tenant always has it
 * and nobody can delete it (`docs/multitenancy/storefront-by-host.md`).
 * Hosts are stored lowercase without a port.
 */
const TenantDomain = model.define("tenant_domain", {
  id: model.id({ prefix: "tdom" }).primaryKey(),
  host: model.text().unique(),
  /**
   * The shop's MAIN public address, the one `canonical`, `hreflang`, `sitemap`,
   * `robots`, `JSON-LD` and `og:url` all name; every other address of the shop
   * answers 301 to it (`specs/tenant-address/CANONICAL.md` §1.1).
   *
   * False by default on purpose: adding a domain is a claim, not a working
   * address. The owner marks it primary once it answers, and `POST
   * /tenants/domains/:id/primary` checks that before flipping — a canonical URL
   * pointing at a host that does not serve the shop is exactly the defect this
   * task was opened for.
   */
  is_primary: model.boolean().default(false),
  tenant: model.belongsTo(() => Tenant, {
    mappedBy: "domains",
  }),
});

export default TenantDomain;
