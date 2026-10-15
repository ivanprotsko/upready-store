import { z } from "@medusajs/framework/zod";
import { isValidHost, normalizeHost } from "../../storefront/by-host/hosts";
import { LOCALE_CODES } from "../locale-settings/validators";

/**
 * Body schemas for what the storefront shows and answers on. That covers custom
 * domains, the shop's address, redirects, search verification, analytics,
 * branding, buyer login methods, sister sites and the shop's Telegram bot.
 *
 * `../validators.ts` re-exports every schema of this folder, so callers import
 * from there (t-2026-10-14-55).
 */

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
 * previous value, the same convention `optionalSecret` uses in `payments.ts`.
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

const brandingHexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "a 6-digit hex color, e.g. #1a2b3c")
  .nullable()
  .optional();

/**
 * t-2026-10-03-61: the app-icon set `POST /tenants/branding/upload` answers for a `favicon`
 * upload (and refines for `favicon_maskable`/`favicon_mono`). Every field optional and nullable,
 * the same reasoning as `brandingUrl` above: an SVG master gives `icon_svg_url` and
 * `mask_icon_url`, a raster one gives neither, and the panel PUTs back the object the upload
 * answered.
 */
const brandingAppIconsSchema = z
  .strictObject({
    icon_svg_url: brandingUrl,
    favicon_ico_url: brandingUrl,
    apple_touch_icon_url: brandingUrl,
    icon_192_url: brandingUrl,
    icon_512_url: brandingUrl,
    icon_maskable_512_url: brandingUrl,
    mstile_150_url: brandingUrl,
    mstile_310_url: brandingUrl,
    mask_icon_url: brandingUrl,
    background_color: brandingHexColor,
    mark_color: brandingHexColor,
  })
  .nullable()
  .optional();

export const PutTenantBrandingSchema = z.strictObject({
  logo_light_url: brandingUrl,
  logo_dark_url: brandingUrl,
  favicon_url: brandingUrl,
  og_image_url: brandingUrl,
  primary_color: brandingHexColor,
  shop_name_short: z.string().max(60).nullable().optional(),
  footer_credit: z
    .strictObject({
      enabled: z.boolean(),
      text: z.string().max(200),
      href: z.string().max(2048).nullable().optional(),
    })
    .nullable()
    .optional(),
  app_icons: brandingAppIconsSchema,
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
 * `PUT /tenants/hreflang-sisters` (t-cherk-31) — the owner's override list of
 * sister sites that do not live in this database. The host is normalised and
 * shape-checked the same way `PostTenantDomainSchema` does its own `host`, so
 * a sister's domain is stored in the one spelling `GET /store/tenant/sites`
 * compares a group sibling's primary domain against when it merges the two
 * lists. Ten rows is generous for "the other sites of one client"; a real
 * excess is a sign something upstream is wrong, not a list to paginate.
 */
export const PutTenantHreflangSistersSchema = z.strictObject({
  sisters: z
    .array(
      z.strictObject({
        domain: z
          .string()
          .min(1)
          .max(253)
          .transform(normalizeHost)
          .refine(isValidHost, {
            message:
              "A host is at least two dot-separated labels of letters, digits and inner hyphens (for example `shop.example.com`).",
          }),
        locale: z.enum(LOCALE_CODES),
      }),
    )
    .max(10, "sisters must not list more than 10 sites."),
});

export type PutTenantHreflangSistersBody = z.infer<typeof PutTenantHreflangSistersSchema>;

/**
 * `PUT /tenants/telegram-bot` (t-2026-10-02-telegram-auth) — the shop's own
 * Telegram bot, for the Login Widget and the Mini App's `initData`.
 *
 * Both fields every time, no «keep» case, for the reason
 * `PutTenantApishipKeySchema` gives: a bot is being set or replaced as a pair,
 * never half-changed, so there is nothing to merge with a stored value. The
 * route itself calls Telegram's `getMe` with the typed token before writing —
 * a wrong token fails here, in the panel, not at a buyer's click.
 */
export const PutTenantTelegramBotSchema = z.strictObject({
  username: z
    .string()
    .trim()
    .min(1, "Введите имя пользователя бота (без @).")
    .max(64)
    .transform((value) => value.replace(/^@/, "")),
  token: z
    .string()
    .trim()
    .min(1, "Пустое значение не сохраняется: введите токен бота.")
    .max(200),
});
export type PutTenantTelegramBotBody = z.infer<typeof PutTenantTelegramBotSchema>;
