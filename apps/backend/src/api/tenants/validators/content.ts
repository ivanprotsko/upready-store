import { z } from "@medusajs/framework/zod";

/**
 * Body schemas for the shop's content pages and journal articles.
 *
 * `../validators.ts` re-exports every schema of this folder, so callers import
 * from there (t-2026-10-14-55).
 */

// ---- piece 7: content pages (/tenants/pages/**)

/**
 * `PUT /tenants/pages/:key` body. The key is in the path, never in the body,
 * so a tenant cannot rename a page by posting a different key; `locale` is
 * optional and defaults to `en`, the model's own default, because the panel
 * edits one language today.
 *
 * `title` and `body` are accepted empty — that is how a tenant clears a draft
 * it has already saved — and the route, not zod, refuses `published: true`
 * with a blank title: the rule is about the PAIR of fields, and a MedusaError
 * raised in the route carries the same `invalid_data` type and 400 status the
 * validator would, without turning this schema into a refined one (only a
 * plain object schema survives `zodValidator`'s own `.strict()` call).
 *
 * `in_footer` and `footer_order` are t05-page-keys additions: whether the page
 * is linked from the storefront's footer, and where among the other
 * footer-linked pages (nulls sort last, then by title — the route never
 * assigns one on its own, so the panel is the only writer of an explicit
 * position). Both are optional so a caller written before this task (an
 * older panel build, a script) keeps its old behaviour: the route leaves an
 * omitted field at whatever it already was, or the reserved key's own default
 * the first time a row is created.
 */
export const PutTenantPageSchema = z.strictObject({
  title: z.string().max(200),
  body: z.string().max(50_000),
  published: z.boolean(),
  in_footer: z.boolean().optional(),
  footer_order: z.number().int().min(0).max(100_000).nullable().optional(),
  locale: z
    .string()
    .regex(/^[a-z]{2}(?:-[A-Za-z0-9]{2,8})?$/, "a BCP-47 language tag, e.g. en or pt-BR")
    .optional(),
  // t11-seo-redirects step 1: blank/omitted keeps (or leaves unset) the
  // storefront's own fallback to `title` and the body's first sentence.
  seo_title: z.string().max(70).nullable().optional(),
  seo_description: z.string().max(320).nullable().optional(),
});

export type PutTenantPageBody = z.infer<typeof PutTenantPageSchema>;

/**
 * `POST /tenants/pages` body — creates a custom page. `slug` is the free key
 * (`PAGE_SLUG_PATTERN` in the model: lowercase letters, digits and single
 * hyphens, 2 to 48 characters); the route itself checks it is not one of the
 * five reserved keys, because that check needs the model's own list, not just
 * a shape. `title` is required here (unlike the PUT body, which accepts a
 * blank one for a draft already on file) because a page is created from the
 * panel's own "new page" dialog, which asks for a name up front.
 */
export const PostTenantPageSchema = z.strictObject({
  slug: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens"),
  title: z.string().min(1).max(200),
});

export type PostTenantPageBody = z.infer<typeof PostTenantPageSchema>;

// ---- t10-blog: journal articles (/tenants/articles/**)

const ARTICLE_LOCALE = z
  .string()
  .regex(/^[a-z]{2}(?:-[A-Za-z0-9]{2,8})?$/, "a BCP-47 language tag, e.g. en or pt-BR");

const ARTICLE_SLUG = z
  .string()
  .min(2)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens");

/** b18-blog-full: the publication state, mirroring `ARTICLE_STATUSES`. */
const ARTICLE_STATUS = z.enum(["draft", "published", "scheduled"]);

const ARTICLE_COVER = z
  .string()
  .max(2_000)
  .regex(/^(https?:\/\/|\/)/, "an absolute http(s) URL or a site-relative path");

/**
 * The fields an article's text is made of, shared by POST and PUT so the two
 * cannot drift (rule 20). Every one of them is optional here; POST defaults the
 * lot to empty, PUT requires `title` and `body` on top of this.
 */
const ARTICLE_CONTENT = {
  excerpt: z.string().max(1_000).nullish(),
  cover_url: ARTICLE_COVER.nullish(),
  status: ARTICLE_STATUS.optional(),
  published_at: z.string().datetime({ offset: true }).nullish(),
  category: z.string().max(120).nullish(),
  author: z.string().max(160).nullish(),
  tags: z.array(z.string().min(1).max(60)).max(20).nullish(),
  seo_title: z.string().max(300).nullish(),
  seo_description: z.string().max(1_000).nullish(),
};

/**
 * `POST /tenants/articles` body — one language row of one article.
 *
 * t10-blog created an EMPTY row here and left the writing to a second call,
 * which is why the panel's only way into the journal was a form asking for a
 * URL (Ivan, 2026-09-16 08:31: «странный функционал с указанием адреса статей,
 * с отсутствием страниц на которые бы можно было бы добавить сами статьи»).
 * b18-blog-full accepts the WHOLE article here, so «Новая статья» is one
 * screen and one save; the fields stay optional, so the old two-step call and
 * the import script keep working unchanged.
 *
 * `locale` is required and has no default: an article exists per language, and
 * guessing `en` for a shop that writes in Russian is exactly the bug the pages
 * screen had before the Cherkashina migration.
 */
export const PostTenantArticleSchema = z.strictObject({
  slug: ARTICLE_SLUG,
  locale: ARTICLE_LOCALE,
  title: z.string().min(1).max(300),
  body: z.string().max(200_000).optional(),
  /** Deprecated alias for `status`, still sent by the import script. */
  published: z.boolean().optional(),
  ...ARTICLE_CONTENT,
});

export type PostTenantArticleBody = z.infer<typeof PostTenantArticleSchema>;

/**
 * `PUT /tenants/articles/:slug` body — the whole text of one language row.
 * `published_at` is an ISO-8601 instant; OMITTING it lets the route stamp the
 * first publish and keep the date on every later save, while sending `null`
 * clears it explicitly — the two are different intents and the route reads
 * them apart (`undefined` vs `null`), which is why this field is
 * `.nullish()` rather than `.nullable()`.
 *
 * `cover_url` is whatever `POST /tenants/uploads` answered for the image, so
 * it is checked as a URL or a site-relative path and nothing more: the file
 * lives under the tenant's own prefix and the upload route is what put it
 * there.
 */
export const PutTenantArticleSchema = z.strictObject({
  locale: ARTICLE_LOCALE.optional(),
  title: z.string().max(300),
  body: z.string().max(200_000),
  /**
   * The article's NEW address. Renaming moves EVERY language row of the
   * article, because the slug names the article and not one of its texts; the
   * route refuses a slug another article of this shop already uses. Absent
   * means «keep the address», which is what every ordinary save sends.
   */
  slug: ARTICLE_SLUG.optional(),
  /**
   * Deprecated alias for `status`, kept so the panel bundle deployed before
   * b18-blog-full does not start failing the moment the backend is updated:
   * `true` reads as `published`, `false` as `draft`, and an explicit `status`
   * always wins.
   */
  published: z.boolean().optional(),
  ...ARTICLE_CONTENT,
});

export type PutTenantArticleBody = z.infer<typeof PutTenantArticleSchema>;
