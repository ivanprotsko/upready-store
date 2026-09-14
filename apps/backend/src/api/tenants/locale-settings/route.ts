import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import upsertTenantLocaleSettingsWorkflow from "../../../workflows/tenant/upsert-tenant-locale-settings";
import { getTenantScope } from "../tenant-scope";
import type {
  PutTenantLocaleSettingsBodyType,
  TenantLocaleSettingsDocument,
} from "./validators";

/**
 * `GET`/`PUT /tenants/locale-settings` (t06-locale-currency) — the tenant's
 * default storefront locale, its enabled subset of the 36 shipped locales, and
 * the country its default prices in. One row per tenant in
 * `tenant_locale_settings`, written by the panel's «Язык и валюта» screen and
 * read by every storefront request through `GET /storefront/by-host`.
 *
 * Scope: the tenant behind the token, the same as `/tenants/home` — no id in
 * the URL, no foreign row to reach.
 */

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const [row] = await tenantModuleService.listTenantLocaleSettings({
    tenant_id: tenant.id,
  });

  if (!row) {
    res.json({ locale_settings: null });
    return;
  }

  const document: TenantLocaleSettingsDocument = {
    default_locale: row.default_locale,
    enabled_locales: row.enabled_locales as unknown as string[],
    default_country: row.default_country ?? null,
  };

  res.json({ locale_settings: document });
};

export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantLocaleSettingsBodyType>,
  res: MedusaResponse,
) => {
  const tenant = await getTenantScope(req);
  const body = req.validatedBody;

  const document: TenantLocaleSettingsDocument = {
    default_locale: body.default_locale,
    enabled_locales: body.enabled_locales,
    default_country: body.default_country ?? null,
  };

  await upsertTenantLocaleSettingsWorkflow(req.scope).run({
    input: { tenant_id: tenant.id, ...document },
  });

  res.json({ locale_settings: document });
};
