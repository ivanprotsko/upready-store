import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { getTenantScope } from "../tenant-scope";
import type { PutTenantBrandingBody } from "../validators";
import { brandingResponse, mergeAppIcons, readBranding, type TenantBranding } from "./branding";

/**
 * `GET/PUT /tenants/branding` (t16-owner-branding) — the owner's brand
 * identity, stored in `tenant.metadata.branding` and merged field by field on
 * every write, the same shape `PUT /tenants/seo-verification` already uses.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const tenant = await tenantModuleService.retrieveTenant(scope.id);

  res.json({
    branding: brandingResponse(readBranding(tenant.metadata as Record<string, unknown> | null)),
  });
};

export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantBrandingBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const tenant = await tenantModuleService.retrieveTenant(scope.id);
  const metadata = (tenant.metadata ?? {}) as Record<string, unknown>;
  const current = readBranding(metadata);
  const body = req.validatedBody;

  const next: TenantBranding = {
    logo_light_url: body.logo_light_url !== undefined ? body.logo_light_url : current.logo_light_url,
    logo_dark_url: body.logo_dark_url !== undefined ? body.logo_dark_url : current.logo_dark_url,
    favicon_url: body.favicon_url !== undefined ? body.favicon_url : current.favicon_url,
    og_image_url: body.og_image_url !== undefined ? body.og_image_url : current.og_image_url,
    primary_color: body.primary_color !== undefined ? body.primary_color : current.primary_color,
    shop_name_short:
      body.shop_name_short !== undefined ? body.shop_name_short : current.shop_name_short,
    footer_credit:
      body.footer_credit !== undefined
        ? body.footer_credit && {
            enabled: body.footer_credit.enabled,
            text: body.footer_credit.text,
            href: body.footer_credit.href ?? null,
          }
        : current.footer_credit,
    app_icons: mergeAppIcons(body, current),
  };

  const updated = await tenantModuleService.updateTenants({
    id: scope.id,
    metadata: { ...metadata, branding: next },
  });

  res.json({
    branding: brandingResponse(readBranding(updated.metadata as Record<string, unknown> | null)),
  });
};
