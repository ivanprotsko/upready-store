import { Module } from "@medusajs/framework/utils";
import TenantModuleService from "./service";

export const TENANT_MODULE = "tenant";

/**
 * The actor type tenant admins authenticate as: `/auth/tenant/emailpass/register`,
 * `/auth/tenant/emailpass`, and `authenticate("tenant", …)` on `/tenants/*`.
 */
export const TENANT_ACTOR_TYPE = "tenant";

export default Module(TENANT_MODULE, {
  service: TenantModuleService,
});
