import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../../../modules/tenant";
import type TenantModuleService from "../../../../../modules/tenant/service";
import { getTenantScope } from "../../../tenant-scope";
import { loadOwnImport } from "../../csv-context";
import { toImportDto } from "../import-helpers";

/**
 * `GET /tenants/products/import/:import_id` — the stored dry run
 * (t14-product-import, step 7: «a page reload must not lose the report»). This
 * is the route the panel's import screen loads from, so the owner can close the
 * tab, come back, and still be looking at the same hundred-line report.
 *
 * An id belonging to another tenant answers 404, the same as an id that does
 * not exist (`loadOwnImport`).
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const row = await loadOwnImport(req, req.params.import_id, tenant.id);

  res.status(200).json({ product_import: toImportDto(row) });
};

/**
 * `DELETE /tenants/products/import/:import_id` — the owner drops an upload they
 * decided against. The row goes (Medusa's module delete is a soft delete, so
 * the record survives for support), and with it the plan: a dropped upload can
 * no longer be confirmed, because `confirm` reads the row.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const row = await loadOwnImport(req, req.params.import_id, tenant.id);
  const tenantModule: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  await tenantModule.deleteTenantProductImports([String(row.id)]);

  res.status(200).json({
    id: String(row.id),
    object: "product_import",
    deleted: true,
  });
};
