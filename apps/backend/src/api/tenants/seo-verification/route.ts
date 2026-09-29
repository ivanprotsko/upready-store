import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { notifyStorefrontRevalidate } from "../../../storefront-revalidate";
import { getTenantScope } from "../tenant-scope";
import type { PutTenantSeoVerificationBody } from "../validators";

type SeoVerification = { yandex: string | null; google: string | null };

const readSeoVerification = (metadata: Record<string, unknown>): SeoVerification => {
  const current = (metadata.seo_verification ?? {}) as Partial<SeoVerification>;
  return { yandex: current.yandex ?? null, google: current.google ?? null };
};

/**
 * `GET /tenants/seo-verification` (b10-panel-gaps) — the tags as they stand,
 * so the panel's field opens filled in. Added next to the `PUT` t11-seo-redirects
 * shipped, for the same reason `/tenants/analytics` has both halves: a form
 * that can only write is a form whose owner never learns what is saved.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const tenant = await tenantModuleService.retrieveTenant(scope.id);

  res.json({ seo_verification: readSeoVerification((tenant.metadata ?? {}) as Record<string, unknown>) });
};

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

  // A-18 (46df audit): the shop's own head previously stayed on whatever tags
  // it had at build time — a webmaster verifying ownership got no confirmation
  // the tag was live without a manual reload well past the storefront's own
  // caches. `tenant.home` is the existing, tested clearing (`tenants/home/route.ts`
  // sends the same type for the same reason) rather than a new one — no
  // storefront-side change to add it.
  await notifyStorefrontRevalidate({ type: "tenant.home", handle: updated.handle });

  res.json({ seo_verification: (updated.metadata as Record<string, unknown>).seo_verification });
};
