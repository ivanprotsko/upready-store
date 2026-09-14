import { z } from "@medusajs/framework/zod";
import { AdminGetProductOptionsParams } from "@medusajs/medusa/api/admin/product-options/validators";
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
});

export type PostTenantCreateBody = z.infer<typeof PostTenantCreateSchema>;

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
 * `POST /tenants/me/password` body. `new_password` shorter than 8 characters
 * is `INVALID_DATA` (zod raises before the route runs); a wrong
 * `current_password` is the route's own `401 UNAUTHORIZED`, never a zod issue,
 * because zod cannot see the stored hash.
 */
export const PostTenantUpdatePasswordSchema = z.strictObject({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

export type PostTenantUpdatePasswordBody = z.infer<typeof PostTenantUpdatePasswordSchema>;

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
 * `PUT /tenants/seo-verification` (t11-seo-redirects step 6) — the search
 * console ownership tags. Empty string clears a tag rather than leaving the
 * previous value, the same convention `optionalSecret` uses above.
 */
export const PutTenantSeoVerificationSchema = z.strictObject({
  yandex: z.string().max(200).nullable().optional(),
  google: z.string().max(200).nullable().optional(),
});

export type PutTenantSeoVerificationBody = z.infer<typeof PutTenantSeoVerificationSchema>;
