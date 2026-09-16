import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { getTenantScope } from "../tenant-scope";
import { collectCategories } from "../articles/article-helpers";

/**
 * `GET /tenants/article-categories` — the rubrics this shop actually uses,
 * with how many articles carry each: `{ categories: [{ category, count }] }`.
 *
 * b18-blog-full. Discovered from the rows rather than kept in a table of its
 * own, so an owner never has to manage a list before writing a first article;
 * the panel offers these as suggestions next to a free text field, which is
 * why an empty answer is normal and not an error.
 *
 * Its own path rather than `/tenants/articles/categories`: that one is inside
 * the `:slug` route's own space, and a rubric is not an article.
 *
 * Drafts count too — the owner's own screen shows the owner's own vocabulary.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const rows = await tenantModuleService.listTenantArticles({ tenant_id: scope.id });
  const categories = collectCategories(rows);

  res.json({ categories, count: categories.length });
};
