import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../../modules/tenant";
import type TenantModuleService from "../../../../modules/tenant/service";
import { getTenantScope } from "../../tenant-scope";
import type { PutTenantArticleBody } from "../../validators";
import { notifyStorefrontRevalidate } from "../../../../storefront-revalidate";
import {
  assertArticleSlug,
  byPublishedDesc,
  parseArticleLocale,
  toArticleDto,
} from "../article-helpers";

/**
 * `GET /tenants/articles/:slug` — the owner's own article. Without `?locale=`
 * it answers every language row of that slug (`{ articles: [...] }`), which is
 * what the edit screen opens on; with one it answers that language alone or
 * 404. A slug this tenant never created is a 404 either way, the same answer a
 * neighbour's slug gets — nothing here tells one tenant that another's article
 * exists.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const slug = assertArticleSlug(req.params.slug);
  const rawLocale = req.query.locale;
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const filters: Record<string, unknown> = { tenant_id: scope.id, slug };
  if (rawLocale !== undefined && rawLocale !== null && rawLocale !== "") {
    filters.locale = parseArticleLocale(rawLocale);
  }

  const rows = await tenantModuleService.listTenantArticles(filters);

  if (!rows.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Article with slug "${slug}" was not found`);
  }

  res.json({ articles: rows.map(toArticleDto).sort(byPublishedDesc) });
};

/**
 * `PUT /tenants/articles/:slug` — saves one language of one article. The row
 * is addressed by the triple (`tenant_id`, `slug`, `locale`) the model's unique
 * index is built on, and the tenant id comes from the token, so the update
 * branch can only ever touch a row that already carries this tenant's id.
 *
 * Unlike the pages route this is NOT an upsert: an article row must already
 * exist, created by `POST /tenants/articles` or by the import script. The
 * reason is the slug — a page key is either one of five reserved words or a
 * slug `POST` already vetted, while every article slug is free, and a PUT that
 * created rows would let a typo in the panel's URL bar silently mint an
 * article nobody meant to write.
 *
 * `published: true` with a blank title is `INVALID_DATA`: the title is the feed
 * card, the page heading and the `<title>` tag, and an empty one would ship a
 * nameless entry to readers and to search engines.
 *
 * `published_at` is stamped on the FIRST publish when the caller sends none, so
 * an owner who just flips the switch still gets a dated article, and left alone
 * on every later save — the date is the article's own, not the date of the last
 * typo fix. The import script sends the source date explicitly and this branch
 * never overwrites it.
 */
export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantArticleBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const slug = assertArticleSlug(req.params.slug);
  const body = req.validatedBody;
  const locale = parseArticleLocale(body.locale);
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  if (body.published && body.title.trim().length === 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid request: a published article needs a title",
    );
  }

  const [existing] = await tenantModuleService.listTenantArticles({
    tenant_id: scope.id,
    slug,
    locale,
  });

  if (!existing) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Article "${slug}" has no "${locale}" text; create it first`,
    );
  }

  const publishedAt =
    body.published_at !== undefined
      ? body.published_at === null
        ? null
        : new Date(body.published_at)
      : body.published && !existing.published_at
        ? new Date()
        : (existing.published_at ?? null);

  const saved = await tenantModuleService.updateTenantArticles({
    id: existing.id,
    title: body.title,
    excerpt: body.excerpt ?? null,
    cover_url: body.cover_url ?? null,
    body: body.body,
    published: body.published,
    published_at: publishedAt,
    tags: body.tags ?? null,
    seo_title: body.seo_title ?? null,
    seo_description: body.seo_description ?? null,
  });

  const row = Array.isArray(saved) ? saved[0] : saved;

  // The feed, the article page, the sitemap and the navigation's «has the shop
  // a journal at all» check all hang off the shared `tenant-articles` tag, so
  // an unsent notification leaves every one of them stale on the shop.
  await notifyStorefrontRevalidate({ type: "tenant.articles", handle: scope.handle });

  res.json({ article: toArticleDto(row) });
};

/**
 * `DELETE /tenants/articles/:slug` — removes the article. Without `?locale=`
 * that means every language row of the slug (deleting «the article» is what
 * the panel's delete button means); with one it removes that language alone and
 * leaves the others, which is how a bad translation is withdrawn without
 * taking the original down with it.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const slug = assertArticleSlug(req.params.slug);
  const rawLocale = req.query.locale;
  const tenantModuleService: TenantModuleService = req.scope.resolve(TENANT_MODULE);

  const filters: Record<string, unknown> = { tenant_id: scope.id, slug };
  if (rawLocale !== undefined && rawLocale !== null && rawLocale !== "") {
    filters.locale = parseArticleLocale(rawLocale);
  }

  const rows = await tenantModuleService.listTenantArticles(filters);

  if (!rows.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Article with slug "${slug}" was not found`);
  }

  await tenantModuleService.deleteTenantArticles(rows.map((row) => row.id));
  await notifyStorefrontRevalidate({ type: "tenant.articles", handle: scope.handle });

  res.json({ id: slug, object: "tenant_article", deleted: true, locales: rows.length });
};
