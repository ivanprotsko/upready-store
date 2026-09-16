import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { getTenantScope } from "../tenant-scope";
import type { PostTenantArticleBody } from "../validators";
import {
  byPublishedDesc,
  normaliseCategory,
  parseArticleLocale,
  resolveArticlePublication,
  toArticleDto,
} from "./article-helpers";
import { notifyStorefrontRevalidate } from "../../../storefront-revalidate";

/**
 * `GET /tenants/articles` — every article row of the tenant behind the token,
 * every locale, drafts included: this is the owner's own journal screen, and
 * the panel groups the rows by slug itself so one row of the list is one
 * article with its languages beside it.
 *
 * Scope is the tenant from `getTenantScope`, read off the token and never from
 * a query parameter, so this list cannot widen to a neighbour's articles.
 *
 * `?locale=` narrows to one language when the panel asks for it; absent means
 * «every language», which is what the list screen wants. Note this differs
 * from `GET /tenants/pages`, where an absent locale means `en`: a page screen
 * edits one language at a time, a journal has to show that the English text of
 * an article is still missing.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const rawLocale = req.query.locale;
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const filters: Record<string, unknown> = { tenant_id: scope.id };
  if (rawLocale !== undefined && rawLocale !== null && rawLocale !== "") {
    // Same strict parse the pages screen uses: a typo must not silently edit
    // another language's rows.
    filters.locale = parseArticleLocale(rawLocale);
  }

  const rows = await tenantModuleService.listTenantArticles(filters);
  const articles = rows.map((row) => toArticleDto(row)).sort(byPublishedDesc);

  res.json({ articles, count: articles.length });
};

/**
 * `POST /tenants/articles` — creates one article row for `(slug, locale)`,
 * with as much of its text as the caller sent.
 *
 * t10-blog created an EMPTY row here and left the writing to a `PUT`, which is
 * what made the panel ask for a URL before it would show a page to write on
 * (see `artifacts/docs/b18-blog-full/diagnosis.md`). b18-blog-full accepts the
 * whole article, so the panel's «Новая статья» is one screen and one save; the
 * fields stay optional, so the old two-step call and the import script keep
 * working unchanged.
 *
 * Two calls with the same slug and different locales are how an article gets
 * its second language; a second call with the same pair is `INVALID_DATA`,
 * read back before the insert so the panel gets one clear message instead of a
 * database constraint error.
 *
 * Nothing here GENERATES body text: the articles are the owner's, and this
 * platform never writes them (t10-blog's own constraint).
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantArticleBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const body = req.validatedBody;
  const { slug, title, locale } = body;
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const [existing] = await tenantModuleService.listTenantArticles({
    tenant_id: scope.id,
    slug,
    locale,
  });

  if (existing) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid request: article "${slug}" already has a "${locale}" text`,
    );
  }

  const publication = resolveArticlePublication(body, null);

  if (publication.status !== "draft" && title.trim().length === 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid request: a published article needs a title",
    );
  }

  const created = await tenantModuleService.createTenantArticles({
    tenant_id: scope.id,
    slug,
    locale,
    title,
    excerpt: body.excerpt ?? null,
    cover_url: body.cover_url ?? null,
    body: body.body ?? "",
    status: publication.status,
    published_at: publication.published_at,
    category: normaliseCategory(body.category),
    author: body.author?.trim() || null,
    tags: body.tags ?? null,
    seo_title: body.seo_title ?? null,
    seo_description: body.seo_description ?? null,
  });

  const row = Array.isArray(created) ? created[0] : created;

  // An article born published is on the feed, the sitemap and the navigation
  // the same second, so the storefront caches for those must be cleared here
  // too — not only in PUT, which is where t10 put the only call.
  if (publication.status !== "draft") {
    await notifyStorefrontRevalidate({ type: "tenant.articles", handle: scope.handle });
  }

  res.status(201).json({ article: toArticleDto(row) });
};
