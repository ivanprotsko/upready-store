import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { isReservedPageKey } from "../../../modules/tenant/models/tenant-page";
import { getTenantScope } from "../tenant-scope";
import { listPagesForPanel, parsePageLocale, toPageDto } from "./page-helpers";
import type { PostTenantPageBody } from "../validators";

/**
 * `GET /tenants/pages` — the tenant's content pages: the five reserved
 * sections, always all five (`docs/tenant-panel/api-contract.md`, "Piece 7"),
 * so the panel's list screen renders one row per section without knowing the
 * key vocabulary itself, followed by whatever custom pages the tenant has
 * created (t05-page-keys). An unsaved reserved section comes back as
 * `{ id: null, title: "", body: "", published: false }`.
 *
 * Scope is the tenant from `getTenantScope`, read off the token, never a query
 * parameter: `tenant_id` is always in the filter, so this list can never widen
 * to another tenant's rows the way an `undefined` id filter would.
 *
 * Not an Admin-shaped list: there is no Admin counterpart to reuse a validator
 * or a query config from, and the response carries no `count/offset/limit`.
 * That is the contract's own shape for this route.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const locale = parsePageLocale(req.query.locale);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const rows = await tenantModuleService.listTenantPages({
    tenant_id: scope.id,
    locale,
  });

  res.json({ pages: listPagesForPanel(rows, locale) });
};

/**
 * `POST /tenants/pages` (t05-page-keys) — creates a custom page: a blank,
 * unpublished, footer-excluded draft with the given slug and title, in the
 * model's default locale. The slug's shape is `PostTenantPageSchema`'s job; a
 * reserved slug is `INVALID_DATA` here even though it is a syntactically valid
 * one, because the five already exist for every tenant and this route is only
 * for the owner's own pages. The tenant's own uniqueness is the model's unique
 * index on (`tenant_id`, `key`, `locale`) — a slug already used by this tenant
 * is `INVALID_DATA` too, read back before the insert so the panel gets one
 * clear message instead of a database constraint error.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantPageBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const { slug, title } = req.validatedBody;
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  if (isReservedPageKey(slug)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid request: "${slug}" is a reserved page key`,
    );
  }

  const [existing] = await tenantModuleService.listTenantPages({
    tenant_id: scope.id,
    key: slug,
    locale: "en",
  });

  if (existing) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid request: a page with slug "${slug}" already exists`,
    );
  }

  const created = await tenantModuleService.createTenantPages({
    tenant_id: scope.id,
    key: slug,
    title,
    body: "",
    published: false,
    in_footer: false,
    footer_order: null,
  });

  const row = Array.isArray(created) ? created[0] : created;

  res.status(201).json({ page: toPageDto(row) });
};
