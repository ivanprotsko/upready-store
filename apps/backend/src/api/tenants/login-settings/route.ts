import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { getTenantScope } from "../tenant-scope";
import type { PutTenantLoginSettingsBody } from "../validators";
import { loginSettingsResponse, readBuyerLoginMethod } from "./login-settings";

/**
 * `GET/PUT /tenants/login-settings` (o25-login-methods) — how this shop's
 * buyers sign in: email and password, Yandex ID, or both. Stored in
 * `tenant.metadata.buyer_login_method`, the same shape `PUT /tenants/branding`
 * already uses for a scalar that needs no per-field merge.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const tenant = await tenantModuleService.retrieveTenant(scope.id);

  res.json({
    login_settings: loginSettingsResponse(readBuyerLoginMethod(tenant.metadata as Record<string, unknown> | null)),
  });
};

export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantLoginSettingsBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const tenant = await tenantModuleService.retrieveTenant(scope.id);
  const metadata = (tenant.metadata ?? {}) as Record<string, unknown>;

  const updated = await tenantModuleService.updateTenants({
    id: scope.id,
    metadata: { ...metadata, buyer_login_method: req.validatedBody.method },
  });

  res.json({
    login_settings: loginSettingsResponse(readBuyerLoginMethod(updated.metadata as Record<string, unknown> | null)),
  });
};
