import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { getTenantScope } from "../tenant-scope";
import type { PutTenantAnalyticsBody } from "../validators";

/**
 * `GET`/`PUT /tenants/analytics` (t17-analytics) — the shop's own analytics
 * counters, saved into `tenant.metadata.analytics` the same way
 * `seo-verification` saves into `tenant.metadata.seo_verification`: merged
 * with whatever else already lives in `metadata` so this route never clobbers
 * a field it does not know about.
 *
 * Read by the storefront through `GET /storefront/by-host` (piece 9's public
 * resolver), never through this authenticated route — a storefront page has
 * no tenant session.
 */

type AnalyticsSettings = { yandex_metrica_id: string | null; ga4_measurement_id: string | null };

const readAnalytics = (metadata: Record<string, unknown>): AnalyticsSettings => {
  const current = (metadata.analytics ?? {}) as Partial<AnalyticsSettings>;
  return {
    yandex_metrica_id: current.yandex_metrica_id ?? null,
    ga4_measurement_id: current.ga4_measurement_id ?? null,
  };
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);
  const tenant = await tenantModuleService.retrieveTenant(scope.id);
  const metadata = (tenant.metadata ?? {}) as Record<string, unknown>;

  res.json({ analytics: readAnalytics(metadata) });
};

export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantAnalyticsBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const tenant = await tenantModuleService.retrieveTenant(scope.id);
  const metadata = (tenant.metadata ?? {}) as Record<string, unknown>;
  const current = readAnalytics(metadata);

  const yandex_metrica_id =
    req.validatedBody.yandex_metrica_id !== undefined
      ? req.validatedBody.yandex_metrica_id || null
      : current.yandex_metrica_id;
  const ga4_measurement_id =
    req.validatedBody.ga4_measurement_id !== undefined
      ? req.validatedBody.ga4_measurement_id || null
      : current.ga4_measurement_id;

  const updated = await tenantModuleService.updateTenants({
    id: scope.id,
    metadata: { ...metadata, analytics: { yandex_metrica_id, ga4_measurement_id } },
  });

  res.json({ analytics: readAnalytics(updated.metadata as Record<string, unknown>) });
};
