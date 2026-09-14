import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import type { PutTenantPageBody } from "../../validators";
import { getTenantScope } from "../../tenant-scope";
import { assertPageKey, blankPage, parsePageLocale, toPageDto } from "../page-helpers";

/**
 * `GET /tenants/pages/:key` — one section of the tenant behind the token. A key
 * outside the five is a 404 (`assertPageKey`); a key the tenant has not saved
 * yet answers the blank shape with `id: null`, so the panel's edit screen opens
 * on an empty form for every section instead of erroring on four of them.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const key = assertPageKey(req.params.key);
  const locale = parsePageLocale(req.query.locale);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const [row] = await tenantModuleService.listTenantPages({
    tenant_id: scope.id,
    key,
    locale,
  });

  res.json({ page: row ? toPageDto(row) : blankPage(key, locale) });
};

/**
 * `PUT /tenants/pages/:key` — upsert of one section. The tenant id comes from
 * the token through `getTenantScope`, the key from the path, and the row is
 * looked up by the triple (`tenant_id`, `key`, `locale`) the model's own unique
 * index is built on, which is what makes this an upsert rather than two
 * routes: the update branch only ever touches a row that already carries this
 * tenant's id, so there is no foreign row to check ownership on.
 *
 * `published: true` with a blank title is `INVALID_DATA`: the storefront's
 * footer link and the page heading are that title, and an empty one would ship
 * a nameless link to shoppers. A blank title on a draft is fine.
 */
export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantPageBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const key = assertPageKey(req.params.key);
  const body = req.validatedBody;
  const locale = parsePageLocale(body.locale);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  if (body.published && body.title.trim().length === 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid request: a published page needs a title",
    );
  }

  const [existing] = await tenantModuleService.listTenantPages({
    tenant_id: scope.id,
    key,
    locale,
  });

  const saved = existing
    ? await tenantModuleService.updateTenantPages({
        id: existing.id,
        title: body.title,
        body: body.body,
        published: body.published,
      })
    : await tenantModuleService.createTenantPages({
        tenant_id: scope.id,
        key,
        locale,
        title: body.title,
        body: body.body,
        published: body.published,
      });

  const row = Array.isArray(saved) ? saved[0] : saved;

  res.json({ page: toPageDto(row) });
};
