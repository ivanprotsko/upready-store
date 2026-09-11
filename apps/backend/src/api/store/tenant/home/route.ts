import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import type { TenantHomeDocument } from "../../../tenants/home/validators";
import { resolveTenantFromPublishableKey } from "../resolve-tenant";

/**
 * `GET /store/tenant/home` — the public read of one tenant's home-page document,
 * for its own storefront (`docs/tenant-panel/api-contract.md` "Piece 8").
 *
 * The tenant comes from the publishable key the framework already validated
 * (`resolveTenantFromPublishableKey`, shared with `/store/tenant/me` and
 * `/store/tenant/product-categories`), never from a query parameter, so one
 * storefront's key can never read another tenant's composition. A tenant that
 * never saved a document answers `{ home: null }`, which the storefront reads as
 * "fall back to the stand's own settings", not as an error.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const [row] = await tenantModuleService.listTenantHomeConfigs({ tenant_id: tenant.id });

  res.json({ home: (row?.config as unknown as TenantHomeDocument) ?? null });
};
