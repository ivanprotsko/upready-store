import { z } from "@medusajs/framework/zod";
import { AdminGetProductOptionsParams } from "@medusajs/medusa/api/admin/product-options/validators";
import { UpdateProduct } from "@medusajs/medusa/api/admin/products/validators";
import { WithAdditionalData } from "@medusajs/medusa/api/utils/validators";
import { SiteScopeSchema } from "./products/site-scope";
import { isValidHost, normalizeHost } from "../storefront/by-host/hosts";

/**
 * A handle is the tenant's stable slug (subdomain-shaped): lowercase letters,
 * digits and single hyphens, 3 to 63 characters. Unlike the recipe it is
 * required, because it is the one identifier a human types.
 */
export const PostTenantCreateSchema = z.strictObject({
  name: z.string().min(1).max(200),
  handle: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens"),
  admin: z.strictObject({
    email: z.string().email(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }),
  /**
   * The tariff this tenant is created on (t-2026-09-27-05), the pricing
   * document's own tier id. The caller (the onboarding wizard's server route)
   * has already resolved it against `GET /platform/pricing`; this route trusts
   * that resolution, the same way it trusts `name`/`handle`.
   */
  plan_id: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens")
    .nullable()
    .optional(),
  /** The tariff's trial length in days, from the same resolved pricing document; absent or null for no trial. */
  plan_trial_days: z.number().int().min(1).max(365).nullable().optional(),
});

export type PostTenantCreateBody = z.infer<typeof PostTenantCreateSchema>;

/**
 * `POST /tenants/sites` (t-2026-09-24-n12): «Создать сайт», a copy of the
 * caller's current site. Same handle rule as `PostTenantCreateSchema`; the
 * admin is always the caller, so there is no `admin` field to name another.
 */
export const PostTenantSiteSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  handle: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens"),
  copy_pages: z.boolean().default(true),
  copy_shipping: z.boolean().default(true),
});

export type PostTenantSiteBody = z.infer<typeof PostTenantSiteSchema>;

/**
 * The Admin's product-option list params plus `product_id`, which the Admin's
 * own route does not take. `GET /tenants/product-options` is scoped to the
 * tenant's products, and the panel narrows it to one of them; without this
 * field zod would strip the parameter and the narrowing would silently do
 * nothing. Everything else, `q`, `id`, `title`, `is_exclusive`, the operator
 * maps and the pagination defaults, is the Admin's.
 */
export const TenantGetProductOptionsParams = AdminGetProductOptionsParams.extend({
  product_id: z.union([z.string(), z.array(z.string())]).optional(),
});

// ---- piece 4: profile (/tenants/me, /tenants/me/password)

/**
 * `POST /tenants/me` body. Same three fields the Admin's `AdminUpdateUser`
 * accepts (`first_name`, `last_name`, `metadata`), minus `avatar_url` (no
 * upload flow wired for the tenant admin's own avatar in this piece). The
 * copied `edit-profile-form` writes the language choice to
 * `metadata.language`, the panel's own equivalent of the Admin's
 * `user.metadata.language`.
 */
export const PostTenantUpdateMeSchema = z.strictObject({
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

export type PostTenantUpdateMeBody = z.infer<typeof PostTenantUpdateMeSchema>;

/**
 * `POST /tenants/me/password` body. `new_password` shorter than 12 characters
 * (46df A-22, ASVS L2 §2.1.1) is `INVALID_DATA` (zod raises before the route
 * runs) — an existing password already shorter than 12 is untouched, this
 * only gates a NEW one; a wrong `current_password` is the route's own
 * `401 UNAUTHORIZED`, never a zod issue, because zod cannot see the stored
 * hash.
 */
export const PostTenantUpdatePasswordSchema = z.strictObject({
  current_password: z.string().min(1),
  new_password: z.string().min(12, "New password must be at least 12 characters long."),
});

export type PostTenantUpdatePasswordBody = z.infer<typeof PostTenantUpdatePasswordSchema>;

/**
 * `POST /tenants/me/switch` body (o25-platform-admin-all-shops): `tenant_id`
 * is the TENANT's id (`GET /tenants/me/shops` names it `id`), never a
 * `tenant_admin` row id — the route resolves the caller's own row in that
 * tenant itself, from the token's email.
 */
/**
 * `POST /tenants/products/:id` body: the Admin's `AdminUpdateProduct` plus
 * `site_scope` (t-2026-09-24-n12), which sites of the client show the
 * product. `"all"` or `{ tenant_ids }`; absent leaves the sites as they are.
 */
export const PostTenantUpdateProductSchema = WithAdditionalData(
  UpdateProduct.extend({ site_scope: SiteScopeSchema.optional() }),
);

export const PostTenantSwitchShopSchema = z.strictObject({
  tenant_id: z.string().min(1),
});

export type PostTenantSwitchShopBody = z.infer<typeof PostTenantSwitchShopSchema>;

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

// ---- piece 9: storefront by host (/tenants/domains)

/**
 * `POST /tenants/domains` body. The host is NORMALISED by the schema itself —
 * lowercased, trimmed, the port cut off — so the route, the uniqueness check
 * and the stored row all see one spelling of a host, and `GET
 * /storefront/by-host` can compare a `Host` header against it byte for byte.
 * The shape check runs after the transform, for the same reason: `ACME.com:443`
 * is a valid host typed by a human and an invalid string to store.
 *
 * A single-label name (`localhost`) fails `isValidHost`: it belongs to no
 * tenant and would shadow the storefront's single-store fallback. Whether a
 * WELL-FORMED host may be stored (reserved technical shapes, already taken) is
 * the route's decision, not zod's, because it needs the database.
 */
export const PostTenantDomainSchema = z.strictObject({
  host: z
    .string()
    .min(1)
    .max(253)
    .transform(normalizeHost)
    .refine(isValidHost, {
      message:
        "A host is at least two dot-separated labels of letters, digits and inner hyphens (for example `shop.example.com`).",
    }),
});

export type PostTenantDomainBody = z.infer<typeof PostTenantDomainSchema>;

/**
 * `POST /tenants/handle` — the shop's new address, the `<handle>` part of
 * `<handle>.<platform domain>`. The same shape the two creation routes accept,
 * because it mints the same technical subdomain; whether this particular handle
 * is FREE is the route's decision, not zod's, because it needs the database and
 * the reservations (`specs/tenant-address/CANONICAL.md` §1.2).
 */
export const PostTenantHandleSchema = z.strictObject({
  handle: z
    .string()
    .min(3)
    .max(63)
    .transform((value) => value.trim().toLowerCase())
    .refine((value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), {
      message: "lowercase letters, digits and single hyphens",
    }),
});

export type PostTenantHandleBody = z.infer<typeof PostTenantHandleSchema>;

/**
 * `PUT /tenants/payment-settings` — the shop's Robokassa account
 * (t03-tenant-secrets-robokassa). A password left out or sent empty keeps the
 * stored value, so the owner can rotate one password without retyping four;
 * the first save has to carry every password of the pair its mode uses,
 * which the route checks against the merged result, not this schema.
 */
const optionalSecret = z
  .string()
  .max(200)
  .optional()
  .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined));

export const PutTenantPaymentSettingsSchema = z.strictObject({
  provider: z.literal("robokassa"),
  merchant_login: z.string().trim().min(1).max(100),
  hash_algorithm: z.enum(["md5", "sha256", "sha384", "sha512"]).optional(),
  is_test: z.boolean().optional(),
  is_enabled: z.boolean().optional(),
  password1: optionalSecret,
  password2: optionalSecret,
  test_password1: optionalSecret,
  test_password2: optionalSecret,
});
export type PutTenantPaymentSettingsBody = z.infer<typeof PutTenantPaymentSettingsSchema>;

/**
 * `PUT /tenants/payment-settings/manual` (olavka-payments) — the shop's two
 * offline ways to pay on `pp_system_default`: crypto wallets and «card via
 * manager». Each section is optional so a PUT changes only the section it
 * names; inside a section the whole section is replaced, because a wallet list
 * has no field-by-field merge that makes sense. An empty contact clears it, the
 * convention `PutTenantSeoVerificationSchema` above already uses.
 *
 * `whatsapp` is the number `https://wa.me/<number>` takes (digits, optional
 * leading `+`), `telegram` the username `https://t.me/<username>` takes (the
 * `@` is stripped). Neither is a default anywhere: an empty section is a
 * method the checkout does not offer.
 */
const optionalContact = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .max(200)
    .regex(pattern, message)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

export const PutTenantManualPaymentSchema = z.strictObject({
  crypto: z
    .strictObject({
      enabled: z.boolean(),
      wallets: z
        .array(
          z.strictObject({
            network: z.string().trim().min(1).max(40),
            currency: z.string().trim().min(1).max(20),
            address: z.string().trim().min(1).max(200),
          }),
        )
        .max(10),
    })
    .optional(),
  manager: z
    .strictObject({
      enabled: z.boolean(),
      whatsapp: optionalContact(/^$|^\+?\d{7,15}$/, "a phone number in international format, digits only"),
      telegram: optionalContact(/^$|^@?[A-Za-z0-9_]{4,32}$/, "a Telegram username").transform(
        (value) => (value ? value.replace(/^@/, "") : null),
      ),
      email: optionalContact(/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, "an email address"),
      note: z
        .string()
        .trim()
        .max(500)
        .nullable()
        .optional()
        .transform((value) => (value ? value : null)),
    })
    .optional(),
});
export type PutTenantManualPaymentBody = z.infer<typeof PutTenantManualPaymentSchema>;

/**
 * `POST /tenants/redirects` (t11-seo-redirects) — a manual redirect row. Both
 * paths are exact pathnames: a leading slash, no host, no query string, so the
 * storefront middleware can compare them to `request.nextUrl.pathname` byte for
 * byte with no normalisation on either side.
 */
const redirectPath = z
  .string()
  .min(1)
  .max(2048)
  .regex(/^\/[^\s?#]*$/, "an absolute path starting with / and carrying no query string");

export const PostTenantRedirectSchema = z.strictObject({
  from_path: redirectPath,
  to_path: redirectPath,
  status_code: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).optional(),
});

export type PostTenantRedirectBody = z.infer<typeof PostTenantRedirectSchema>;

/**
 * `PUT /tenants/redirects/:id` (b10-panel-gaps) — the same three fields, every
 * one optional: a body names only what it changes, and the route keeps the rest
 * of the row as it stands.
 */
export const PutTenantRedirectSchema = z.strictObject({
  from_path: redirectPath.optional(),
  to_path: redirectPath.optional(),
  status_code: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).optional(),
});

export type PutTenantRedirectBody = z.infer<typeof PutTenantRedirectSchema>;

/**
 * `PUT /tenants/seo-verification` (t11-seo-redirects step 6) — the search
 * console ownership tags. Empty string clears a tag rather than leaving the
 * previous value, the same convention `optionalSecret` uses above.
 */
export const PutTenantSeoVerificationSchema = z.strictObject({
  yandex: z.string().max(200).nullable().optional(),
  google: z.string().max(200).nullable().optional(),
});

export type PutTenantSeoVerificationBody = z.infer<typeof PutTenantSeoVerificationSchema>;

/**
 * `PUT /tenants/analytics` (t17-analytics) — the shop's own counters. A
 * Yandex Metrica number is digits only (the counter id shown in its
 * dashboard); a GA4 measurement id is `G-` followed by alphanumerics. Empty
 * string clears a counter, the same convention `seo_verification` uses above.
 */
export const PutTenantAnalyticsSchema = z.strictObject({
  yandex_metrica_id: z
    .string()
    .trim()
    .regex(/^$|^\d{6,10}$/, "6 to 10 digits, the Metrica counter number")
    .nullable()
    .optional(),
  ga4_measurement_id: z
    .string()
    .trim()
    .regex(/^$|^G-[A-Z0-9]{6,12}$/, "a GA4 measurement id, e.g. G-XXXXXXXXXX")
    .nullable()
    .optional(),
});

export type PutTenantAnalyticsBody = z.infer<typeof PutTenantAnalyticsSchema>;

/**
 * `PUT /tenants/branding` (t16-owner-branding) — logo, favicon, og image,
 * primary colour and the footer credit line. Every field is optional so a
 * PUT changes only what it names; `null` clears a field the same way
 * `PutTenantSeoVerificationSchema` above treats an empty string. URLs are
 * never validated as files here — that already happened at
 * `POST /tenants/branding/upload`, and this schema only bounds their length.
 */
const brandingUrl = z.string().min(1).max(2048).nullable().optional();

export const PutTenantBrandingSchema = z.strictObject({
  logo_light_url: brandingUrl,
  logo_dark_url: brandingUrl,
  favicon_url: brandingUrl,
  og_image_url: brandingUrl,
  primary_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "a 6-digit hex color, e.g. #1a2b3c")
    .nullable()
    .optional(),
  shop_name_short: z.string().max(60).nullable().optional(),
  footer_credit: z
    .strictObject({
      enabled: z.boolean(),
      text: z.string().max(200),
      href: z.string().max(2048).nullable().optional(),
    })
    .nullable()
    .optional(),
});

export type PutTenantBrandingBody = z.infer<typeof PutTenantBrandingSchema>;

/**
 * `PUT /tenants/login-settings` (o25-login-methods) — how this shop's buyers
 * sign in. One required field, not three optional booleans: a body always
 * names exactly one of the three methods, which is what keeps "zero methods
 * enabled" unrepresentable.
 */
export const PutTenantLoginSettingsSchema = z.strictObject({
  method: z.enum(["email", "yandex", "both"]),
});

export type PutTenantLoginSettingsBody = z.infer<typeof PutTenantLoginSettingsSchema>;

/**
 * `PUT /tenants/notification-settings` — the two fields the owner controls over
 * their customers' letters (t08-order-notifications). The `From` ADDRESS is
 * deliberately absent: the platform's SMTP account sends for every shop, and an
 * address a shop owner typed would be a domain we cannot sign for.
 *
 * An empty string is a legal value and means «clear it», which is why neither
 * field trims down to `undefined` the way a secret does.
 */
export const PutTenantNotificationSettingsSchema = z.strictObject({
  email_from_name: z.string().trim().max(100).optional(),
  email_reply_to: z
    .string()
    .trim()
    .max(200)
    .refine((value) => value === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), {
      message: "a valid e-mail address, or empty to clear it",
    })
    .optional(),
});
export type PutTenantNotificationSettingsBody = z.infer<
  typeof PutTenantNotificationSettingsSchema
>;

// ---- t12-legal-requisites: seller requisites (/tenants/requisites)

/**
 * `PUT /tenants/requisites` — every field optional and every field an empty
 * string means "clear it", the same convention as
 * `PutTenantNotificationSettingsSchema`: an owner has to be able to take a
 * value back out as easily as they put it in, and a field simply omitted from
 * the body must leave the stored value untouched (a partial save from a form
 * that only shows some fields at a time).
 *
 * `phone_confirmed` has no free-text shape to police, so it is the one boolean
 * here. Nothing here validates an ИНН/ОГРН checksum: this repository must not
 * invent or "correct" a registration number, only store what the owner typed
 * (step plan piece 4 and "What NOT to do").
 */
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const PutTenantRequisitesSchema = z.strictObject({
  legal_name: optionalText(200),
  inn: optionalText(20),
  ogrn: optionalText(20),
  legal_address: optionalText(500),
  return_address: optionalText(500),
  phone: optionalText(50),
  phone_confirmed: z.boolean().optional(),
  email: optionalText(200),
  dpo_email: optionalText(200),
  delivery_methods: optionalText(500),
  effective_date: optionalText(100),
  revision_date: optionalText(100),
  document_date: optionalText(100),
  rkn_notice_date: optionalText(100),
  rkn_reg_number: optionalText(100),
  newsletter_management_url: optionalText(500),
  bank_details: optionalText(1000),
});
export type PutTenantRequisitesBody = z.infer<typeof PutTenantRequisitesSchema>;

/**
 * `PUT /tenants/delivery-settings` (i02-apiship-cdek-shipping) — the shop's CDEK
 * account and what it ships with. A password absent from the body keeps the
 * stored one, the same rule the Robokassa form follows, so the panel can show a
 * masked value and save the rest of the form without re-typing it.
 */
export const PutTenantDeliverySettingsSchema = z.strictObject({
  provider: z.literal("cdek"),
  is_test: z.boolean().optional(),
  is_enabled: z.boolean().optional(),
  account: z.string().trim().max(200).optional(),
  test_account: z.string().trim().max(200).optional(),
  password: optionalSecret,
  test_password: optionalSecret,
  sender_mode: z.enum(["door", "warehouse"]).optional(),
  sender_city_code: z.number().int().positive().nullable().optional(),
  sender_city_name: optionalText(200),
  sender_address: optionalText(500),
  sender_name: optionalText(200),
  sender_phone: optionalText(50),
  shipment_point: optionalText(50),
  /** Which delivery kinds the shop offers; an empty list switches CDEK off at the checkout. */
  kinds: z.array(z.enum(["courier", "pickup", "postamat"])).max(3).optional(),
  markup_amount: z.number().min(0).max(1_000_000).optional(),
  markup_percent: z.number().min(0).max(100).optional(),
  free_above_total: z.number().min(0).max(100_000_000).nullable().optional(),
});
export type PutTenantDeliverySettingsBody = z.infer<typeof PutTenantDeliverySettingsSchema>;

/**
 * `PUT /tenants/apiship/key` (p01-settings-integrations-restructure) — the
 * shop's ApiShip token.
 *
 * ONE field, because ApiShip authenticates with a bare `Authorization: <token>`
 * header and nothing else (measured 2026-09-16, `src/apiship/client.ts`).
 *
 * `min(1)` after `trim()` for the reason the marketplace key schema gives: an
 * empty string is not «keep the stored value», it is a value of the same
 * quantity that would overwrite a working token with nothing (rule 20a). This
 * route has no «keep» case at all — a token is either being replaced or the row
 * is being deleted — so an empty body is refused rather than silently ignored.
 */
export const PutTenantApishipKeySchema = z.strictObject({
  token: z
    .string()
    .trim()
    .min(1, "Пустое значение не сохраняется: введите токен ApiShip.")
    .max(500),
  is_enabled: z.boolean().optional(),
});
export type PutTenantApishipKeyBody = z.infer<typeof PutTenantApishipKeySchema>;

/**
 * `PUT /tenants/pochta` (46df-pochta) — the shop's Russian Post «Отправка»
 * access and the two settings a quote needs.
 *
 * A secret absent from the body keeps the stored one, so the panel can show a
 * masked value and save the rest of the form without re-typing it.
 * `clear_user_key` is the one way to remove the user key: an empty string is
 * never «delete», for the reason `PutTenantApishipKeySchema` gives.
 */
export const PutTenantPochtaSchema = z.strictObject({
  token: z.string().max(500).optional().transform((value) => (value && value.trim() ? value.trim() : undefined)),
  user_key: z.string().max(500).optional().transform((value) => (value && value.trim() ? value.trim() : undefined)),
  clear_user_key: z.boolean().optional(),
  sender_index: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Индекс отделения — шесть цифр.")
    .optional(),
  default_weight_g: z.number().int().min(1).max(50_000).optional(),
  is_enabled: z.boolean().optional(),
});
export type PutTenantPochtaBody = z.infer<typeof PutTenantPochtaSchema>;

/**
 * `PUT /tenants/tribute` (t-cherk-22) — the shop's Tribute Shop API key.
 *
 * ONE secret, unlike Robokassa's two password pairs: the same key both calls
 * `POST /shop/orders` and signs the webhook body. Absent `api_key` keeps the
 * stored one, same "re-save without re-typing" rule as every other slot.
 */
export const PutTenantTributeSchema = z.strictObject({
  api_key: z.string().max(500).optional().transform((value) => (value && value.trim() ? value.trim() : undefined)),
  shop_id: z.string().max(128).optional().transform((value) => (value && value.trim() ? value.trim() : undefined)),
  is_enabled: z.boolean().optional(),
});
export type PutTenantTributeBody = z.infer<typeof PutTenantTributeSchema>;
