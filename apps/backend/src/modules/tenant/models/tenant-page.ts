import { model } from "@medusajs/framework/utils";
import Tenant from "./tenant";

/**
 * The five sections the panel always offered before t05-page-keys: contacts,
 * legal details, about the shop, privacy policy, public offer. They keep their
 * old meaning and their old key (footer, storefront routes, seam tests all
 * reference the literal string), but they are no longer the only pages a
 * tenant can have — `key` is a free slug now (`PAGE_SLUG_PATTERN`), and these
 * five are simply the slugs reserved for the panel's own labels and default
 * footer placement (`isReservedPageKey`).
 */
export const TENANT_PAGE_KEYS = ["contacts", "legal", "about", "privacy", "offer"] as const;
export type TenantPageKey = (typeof TENANT_PAGE_KEYS)[number];

export const isReservedPageKey = (key: string): key is TenantPageKey =>
  (TENANT_PAGE_KEYS as readonly string[]).includes(key);

/** Lowercase latin letters, digits and single hyphens, 2 to 48 characters. */
export const PAGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isValidPageSlug = (value: string): boolean =>
  value.length >= 2 && value.length <= 48 && PAGE_SLUG_PATTERN.test(value);

/**
 * One content page of a tenant, reserved or the owner's own. Storefront
 * renders a published one under `/<locale>/pages/<key>` and, when `in_footer`
 * is set, links it from the footer's Information column in `footer_order`
 * (nulls last, then title). One row per tenant × key × locale;
 * `published: false` keeps a draft off the storefront (`GET
 * /store/tenant/pages/:key` answers 404 for it). Body is markdown.
 */
const TenantPage = model
  .define("tenant_page", {
    id: model.id({ prefix: "tpage" }).primaryKey(),
    key: model.text(),
    locale: model.text().default("en"),
    title: model.text(),
    body: model.text(),
    published: model.boolean().default(false),
    in_footer: model.boolean().default(false),
    footer_order: model.number().nullable(),
    // t11-seo-redirects step 1: the owner's own `<title>`/meta description for
    // this page, falling back to `title` and the body's first sentence when
    // blank (`toPageDto` in `page-helpers.ts` never fabricates a fallback —
    // the storefront's `generateMetadata` does, the same split product and
    // category pages use).
    seo_title: model.text().nullable(),
    seo_description: model.text().nullable(),
    tenant: model.belongsTo(() => Tenant, {
      mappedBy: "pages",
    }),
  })
  .indexes([
    {
      on: ["tenant_id", "key", "locale"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

export default TenantPage;
