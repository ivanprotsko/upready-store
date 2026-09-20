import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type TenantModuleService from "../../modules/tenant/service";

/**
 * The storefront locales a tenant's redirect rows are minted for. Falls back
 * to `["en"]`, the same default a shop with no saved `tenant_locale_settings`
 * row gets everywhere else (t06-locale-currency): a rename before the owner
 * ever touches the locale screen still gets a working redirect for the one
 * language the shop answers in today.
 */
export const getTenantEnabledLocales = async (
  tenantModuleService: TenantModuleService,
  tenantId: string,
): Promise<string[]> => {
  const [settings] = await tenantModuleService.listTenantLocaleSettings({ tenant_id: tenantId });
  const locales = settings?.enabled_locales as unknown as string[] | undefined;
  return locales && locales.length > 0 ? locales : ["en"];
};

/**
 * `INVALID_DATA` if `handle` is already used by another product/category —
 * checked before the update workflow runs, so a collision is one clear
 * message rather than a database constraint error surfacing through
 * Medusa's own unique-handle enforcement (step 2 of t11-seo-redirects: "A
 * handle that collides with an existing one is rejected with a message, not
 * silently suffixed").
 */
export const assertHandleFree = async (
  req: AuthenticatedMedusaRequest,
  entity: "product" | "product_category",
  handle: string,
  excludingId: string,
): Promise<void> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data } = await query.graph({
    entity,
    fields: ["id"],
    filters: { handle: [handle] },
  });

  const collision = data.find((row) => row?.id && row.id !== excludingId);

  if (collision) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid request: the handle "${handle}" is already in use`,
    );
  }
};

/**
 * Writes (or moves) the 301 for a renamed product/category, one row per the
 * tenant's enabled locale: `/<locale>/<kind>/<oldHandle>` →
 * `/<locale>/<kind>/<newHandle>`.
 *
 * A rename BACK to a handle this same resource used before would otherwise
 * leave a stale row pointing the other way and turn the pair into a 2-hop
 * loop the moment it is re-applied — so the reverse row is dropped first. An
 * existing forward row (a second rename of the same resource before the first
 * one's redirect was ever visited) is updated in place rather than left as a
 * dead extra hop.
 */
export const recordSlugRedirect = async (
  tenantModuleService: TenantModuleService,
  tenantId: string,
  kind: "products" | "categories",
  oldHandle: string,
  newHandle: string,
  locales: string[],
): Promise<void> => {
  if (oldHandle === newHandle) {
    return;
  }

  for (const locale of locales) {
    const fromPath = `/${locale}/${kind}/${oldHandle}`;
    const toPath = `/${locale}/${kind}/${newHandle}`;

    if (fromPath === toPath) {
      continue;
    }

    const [reverse] = await tenantModuleService.listTenantRedirects({
      tenant_id: tenantId,
      from_path: toPath,
    });

    if (reverse && reverse.to_path === fromPath) {
      await tenantModuleService.deleteTenantRedirects([reverse.id]);
    }

    const [existing] = await tenantModuleService.listTenantRedirects({
      tenant_id: tenantId,
      from_path: fromPath,
    });

    if (existing) {
      await tenantModuleService.updateTenantRedirects({
        id: existing.id,
        to_path: toPath,
        status_code: 301,
      });
    } else {
      await tenantModuleService.createTenantRedirects({
        tenant_id: tenantId,
        from_path: fromPath,
        to_path: toPath,
        status_code: 301,
      });
    }
  }
};
