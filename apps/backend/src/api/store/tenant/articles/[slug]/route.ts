import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../../modules/tenant";
import type TenantModuleService from "../../../../../modules/tenant/service";
import {
  byPublishedDesc,
  isArticleVisible,
  oneRowPerSlug,
  pickArticleForLocale,
  requestedArticleLocale,
  toArticleDto,
  toArticleSummary,
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

  const now = new Date();
  const rows = (
    await tenantModuleService.listTenantArticles({
      tenant_id: tenant.id,
      slug,
      status: ["published", "scheduled"],
    })
  ).filter((candidate) => isArticleVisible(candidate, now));

  const row = pickArticleForLocale(rows, requested);

  if (!row) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Article with slug "${slug}" was not found`);
  }

  const article = toArticleDto(row, now);

  // b18-blog-full: «читайте также». Same rubric first, then anything else,
  // never the article itself and never more than three — an article page is
  // for reading the article, and a related strip that fills the screen is a
  // menu, not a suggestion.
  const siblings = (
    await tenantModuleService.listTenantArticles({
      tenant_id: tenant.id,
      status: ["published", "scheduled"],
    })
  ).filter((candidate) => isArticleVisible(candidate, now) && candidate.slug !== slug);

  const summaries = oneRowPerSlug(siblings, requested)
    .map((candidate) => toArticleSummary(candidate, now))
    .sort(byPublishedDesc);

  const related = [
    ...(article.category ? summaries.filter((s) => s.category === article.category) : []),
    ...summaries.filter((s) => !article.category || s.category !== article.category),
  ].slice(0, 3);

  res.json({ article, related });
};
