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
  tenant: model.belongsTo(() => Tenant, {
    mappedBy: "domains",
  }),
});

export default TenantDomain;
