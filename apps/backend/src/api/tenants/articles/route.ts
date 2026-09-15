import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import { getTenantScope } from "../tenant-scope";
import type { PostTenantArticleBody } from "../validators";
import { byPublishedDesc, parseArticleLocale, toArticleDto } from "./article-helpers";

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
  const articles = rows.map(toArticleDto).sort(byPublishedDesc);

  res.json({ articles, count: articles.length });
};

/**
 * `POST /tenants/articles` — creates one empty, unpublished article row for
 * `(slug, locale)`. Two calls with the same slug and different locales are how
 * an article gets its second language; a second call with the same pair is
 * `INVALID_DATA`, read back before the insert so the panel gets one clear
 * message instead of a database constraint error.
 *
 * Nothing here writes body text: the articles are the owner's, and this
 * platform never generates them (t10-blog's own constraint).
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantArticleBody>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  const { slug, title, locale } = req.validatedBody;
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

  const created = await tenantModuleService.createTenantArticles({
    tenant_id: scope.id,
    slug,
    locale,
    title,
    excerpt: null,
    cover_url: null,
    body: "",
    published: false,
    published_at: null,
    tags: null,
    seo_title: null,
    seo_description: null,
  });

  const row = Array.isArray(created) ? created[0] : created;

  res.status(201).json({ article: toArticleDto(row) });
};
