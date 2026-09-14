import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../../modules/tenant";
import type TenantModuleService from "../../../../../modules/tenant/service";
import {
  pickArticleForLocale,
  requestedArticleLocale,
  toArticleDto,
} from "../../../../tenants/articles/article-helpers";
import { resolveTenantFromPublishableKey } from "../../resolve-tenant";

/**
 * `GET /store/tenant/articles/:slug` — one published article of the
 * storefront's own tenant, in the visitor's language when that row is
 * published, otherwise per the fallback chain (language part → `en` → any).
 *
 * A draft, an unwritten slug and another tenant's article are all the same
 * 404, so a visitor cannot probe a shop's unpublished drafts by guessing
 * slugs.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const slug = req.params.slug;
  const requested = requestedArticleLocale(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const rows = await tenantModuleService.listTenantArticles({
    tenant_id: tenant.id,
    slug,
    published: true,
  });

  const row = pickArticleForLocale(rows, requested);

  if (!row) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Article with slug "${slug}" was not found`);
  }

  res.json({ article: toArticleDto(row) });
};
