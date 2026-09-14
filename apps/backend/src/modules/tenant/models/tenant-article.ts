import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";

/**
 * One article of a tenant's journal (t10-blog). The shop this platform was
 * built for is a «магазин-журнал»: the articles are what brings search and AI
 * traffic to the catalog, so they are a first-class tenant entity rather than
 * a content page with a date on it.
 *
 * Shape follows `tenant-page.ts` deliberately — same module, same tenant
 * `belongsTo`, same `(tenant_id, …, locale)` unique index — because the panel,
 * the storefront loaders and the revalidation path all reuse that machinery.
 * What an article adds over a page: a cover, an excerpt, a publication date,
 * tags and its own SEO pair.
 *
 * ONE ROW PER LOCALE. `slug` is the article; `(slug, locale)` is its text in
 * one language. The storefront asks for a slug and gets the visitor's language
 * when that row exists, then the language part, then `en`, then whatever row
 * exists (`pickArticleForLocale`, the same chain `pickPageForLocale` uses) —
 * never a 404 for a slug that has text in some language.
 *
 * `published` is the draft/published state of ONE locale row: an owner may
 * publish the Russian text while the English translation is still a draft.
 * `published_at` is the date shown in the feed and in the `Article` JSON-LD;
 * the panel writes it when the article is first published and the import
 * script carries the source date over unchanged.
 */

/** Lowercase latin letters, digits and single hyphens, 2 to 96 characters. */
export const ARTICLE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isValidArticleSlug = (value: string): boolean =>
  value.length >= 2 && value.length <= 96 && ARTICLE_SLUG_PATTERN.test(value);

const TenantArticle = model
  .define("tenant_article", {
    id: model.id({ prefix: "tart" }).primaryKey(),
    slug: model.text(),
    locale: model.text().default("en"),
    title: model.text(),
    /** The feed's teaser. Never generated from the body: the owner's own words. */
    excerpt: model.text().nullable(),
    /** Absolute or site-relative URL of the cover, as the uploads route returned it. */
    cover_url: model.text().nullable(),
    /** Markdown, rendered by `@modules/content/components/markdown-content`. */
    body: model.text().default(""),
    published: model.boolean().default(false),
    published_at: model.dateTime().nullable(),
    /**
     * Free vocabulary, the owner's own. `model.array()` rather than
     * `model.json()`: the framework's own doc comment on `json()` points an
     * array of strings at `array()`, and `json()` types as
     * `Record<string, unknown>`, which no list of tags can satisfy.
     */
    tags: model.array().nullable(),
    seo_title: model.text().nullable(),
    seo_description: model.text().nullable(),
    tenant: model.belongsTo(() => Tenant, {
      mappedBy: "articles",
    }),
  })
  .indexes([
    {
      on: ["tenant_id", "slug", "locale"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      // The feed's own read: this tenant's published rows, newest first.
      on: ["tenant_id", "published", "published_at"],
      where: "deleted_at IS NULL",
    },
  ]);

export default TenantArticle;
