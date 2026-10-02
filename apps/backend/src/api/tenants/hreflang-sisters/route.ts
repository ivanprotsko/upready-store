import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { getTenantScope } from "../tenant-scope";
import type { PutTenantHreflangSistersBody } from "../validators";
import { readHreflangSistersOverride } from "./hreflang-sisters";

/**
 * `GET`/`PUT /tenants/hreflang-sisters` (t-cherk-31) — the owner's override
 * list of sister sites that do NOT live in this database (Ivan's Р2 fork: `.ru`
 * and `.com` on different servers). Stored in `tenant.metadata.hreflang_sisters`,
 * replaced whole on every `PUT`, the same contract `PUT /tenants/branding`
 * already has for its own metadata document.
 *
 * A tenant whose sisters are all in THIS database needs no override at all —
 * `GET /store/tenant/sites` derives those from the group directly — so an empty
 * list here is the common case, not a tenant that forgot to configure anything.
 */

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const tenant = await tenantModuleService.retrieveTenant(scope.id);

  res.json({
    sisters: readHreflangSistersOverride(tenant.metadata as Record<string, unknown> | null),
  });
};

export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantHreflangSistersBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const tenant = await tenantModuleService.retrieveTenant(scope.id);
  const metadata = (tenant.metadata ?? {}) as Record<string, unknown>;
  const sisters = req.validatedBody.sisters;

  await tenantModuleService.updateTenants({
    id: scope.id,
    metadata: { ...metadata, hreflang_sisters: sisters },
  });

  res.json({ sisters });
};
