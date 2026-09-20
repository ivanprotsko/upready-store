import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import {
  byPublishedDesc,
  isArticleVisible,
  normaliseCategory,
  oneRowPerSlug,
  requestedArticleLocale,
  toArticleSummary,
} from "../../../tenants/articles/article-helpers";
import { resolveTenantFromPublishableKey } from "../resolve-tenant";

/**
 * `GET /store/tenant/articles` — the published journal of the storefront's own
 * tenant: `{ articles: [...], count, limit, offset }`, newest first, one card
 * per article in the visitor's language (falling back language part → `en` →
 * any, so a shop whose Russian text is published and whose English translation
 * is still a draft is still readable on `/en/journal`).
 *
 * `count` is the number of ARTICLES, not of rows, because the feed shows one
 * card per article: paginating on the row count would leave a page short
 * wherever an article has two languages published.
 *
 * No body in the answer — a feed card needs a cover, a title, an excerpt and a
 * date, and shipping twelve kilobytes of markdown per card twenty times over
 * is the whole page weight for nothing.
 */
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 100;

const parsePositiveInt = (raw: unknown, fallback: number, max: number): number => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
};

export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const requested = requestedArticleLocale(req);
  const limit = parsePositiveInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const offset = parsePositiveInt(req.query.offset, 0, Number.MAX_SAFE_INTEGER);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  // b18-blog-full: the filter is not a column any more. `status` says what the
  // owner INTENDED and `isArticleVisible` says what a visitor sees right now —
  // a `scheduled` article goes public at its own minute, with no job having to
  // have run first. Rows are few per tenant (tens), so the date comparison
  // happens here rather than in four different query builders.
  const now = new Date();
  const rows = (
    await tenantModuleService.listTenantArticles({
      tenant_id: tenant.id,
      status: ["published", "scheduled"],
    })
  ).filter((row) => isArticleVisible(row, now));

  // `?category=` narrows the feed to one rubric. An unknown rubric answers an
  // empty feed rather than the whole journal: a visitor following a stale link
  // must not silently get «everything» and think that is the rubric.
  const category = normaliseCategory(
    Array.isArray(req.query.category) ? req.query.category[0] : req.query.category,
  );

  const articles = oneRowPerSlug(rows, requested)
    .map((row) => toArticleSummary(row, now))
    .filter((article) => !category || article.category === category)
    .sort(byPublishedDesc);

  res.json({
    articles: articles.slice(offset, offset + limit),
    count: articles.length,
    limit,
    offset,
    ...(category && { category }),
  });
};
