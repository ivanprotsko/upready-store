import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import {
  collectCategories,
  isArticleVisible,
} from "../../../tenants/articles/article-helpers";
import { resolveTenantFromPublishableKey } from "../resolve-tenant";

/**
 * `GET /store/tenant/article-categories` — the rubrics a VISITOR can browse:
 * only those carried by an article that is public right now, counted over
 * articles rather than over locale rows.
 *
 * b18-blog-full. A rubric whose only article is a draft is absent here on
 * purpose: a chip leading to an empty feed is worse than no chip.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const now = new Date();
  const rows = (
    await tenantModuleService.listTenantArticles({
      tenant_id: tenant.id,
      status: ["published", "scheduled"],
    })
  ).filter((row) => isArticleVisible(row, now));

  const categories = collectCategories(rows);

  res.json({ categories, count: categories.length });
};
