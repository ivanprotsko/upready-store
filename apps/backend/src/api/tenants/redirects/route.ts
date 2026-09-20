import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { getTenantScope } from "../tenant-scope";
import type { PostTenantRedirectBody } from "../validators";

/**
 * `GET /tenants/redirects` — every redirect row of the tenant behind the
 * token, newest first. No `count/offset/limit`: a shop's redirect table is a
 * few dozen rows at most (t11-seo-redirects imports 47 for one migration), not
 * a paginated resource.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const rows = await tenantModuleService.listTenantRedirects(
    { tenant_id: scope.id },
    { order: { created_at: "DESC" } },
  );

  res.json({
    redirects: rows.map((row) => ({
      id: row.id,
      from_path: row.from_path,
      to_path: row.to_path,
      status_code: row.status_code,
    })),
  });
};

/**
 * `POST /tenants/redirects` — adds one manual redirect. `from_path` must be
 * free for this tenant: two rules for the same source path would make the
 * outcome depend on read order, so a collision is `INVALID_DATA` with a
 * message rather than a silent overwrite or a raw constraint error.
 *
 * The storefront middleware polls its own redirect table on a short TTL
 * (`lib/tenant/redirects.ts`), the same pattern the region map already uses,
 * rather than a revalidate webhook — a new row is live within that window.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantRedirectBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const { from_path, to_path, status_code } = req.validatedBody;
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const [existing] = await tenantModuleService.listTenantRedirects({
    tenant_id: scope.id,
    from_path,
  });

  if (existing) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid request: a redirect from "${from_path}" already exists`,
    );
  }

  const created = await tenantModuleService.createTenantRedirects({
    tenant_id: scope.id,
    from_path,
    to_path,
    status_code: status_code ?? 301,
  });

  const row = Array.isArray(created) ? created[0] : created;

  res.status(201).json({
    redirect: {
      id: row.id,
      from_path: row.from_path,
      to_path: row.to_path,
      status_code: row.status_code,
    },
  });
};
