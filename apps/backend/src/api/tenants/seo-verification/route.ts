import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { getTenantScope } from "../tenant-scope";
import type { PutTenantSeoVerificationBody } from "../validators";

/**
 * `PUT /tenants/seo-verification` — saves the Yandex/Google search console
 * verification tags into `tenant.metadata.seo_verification`, merged with
 * whatever else already lives in `metadata` (the attribution line included) so
 * this route never clobbers a field it does not know about.
 */
export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantSeoVerificationBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const tenant = await tenantModuleService.retrieveTenant(scope.id);
  const metadata = (tenant.metadata ?? {}) as Record<string, unknown>;
  const current = (metadata.seo_verification ?? {}) as { yandex?: string | null; google?: string | null };

  const yandex = req.validatedBody.yandex !== undefined ? req.validatedBody.yandex || null : current.yandex ?? null;
  const google = req.validatedBody.google !== undefined ? req.validatedBody.google || null : current.google ?? null;

  const updated = await tenantModuleService.updateTenants({
    id: scope.id,
    metadata: { ...metadata, seo_verification: { yandex, google } },
  });

  res.json({ seo_verification: (updated.metadata as Record<string, unknown>).seo_verification });
};
