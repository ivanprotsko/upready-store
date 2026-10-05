import { z } from "@medusajs/framework/zod";
import {
  isForbidden,
  validateFields,
  type ForbiddenRule,
  type StorefrontSettingsInput,
} from "../../store/storefront-settings/validation";

/**
 * The tenant's home-page document, `upready.tenant-home/v1`
 * (`docs/tenant-panel/api-contract.md`, section "Piece 8"). Three parts:
 *
 * - `theme.preset` — one of the storefront's built presets;
 * - `settings` — the composition document `upready.storefront-settings/v1`
 *   VERBATIM, validated by `api/store/storefront-settings/validation.ts`'s own
 *   `validateFields`/`isForbidden` (reused, never re-transcribed here: that file
 *   is already the backend's single copy of the vocabulary and the FORBIDDEN
 *   pairs);
 * - `content` — the tenant's own text for the blocks that composition selects,
 *   which the storefront-settings document never had.
 *
 * `updatedAt` is stamped by the server on every PUT and is not accepted from
 * the client, the same rule `/store/storefront-settings` already follows.
 */

/**
 * `apps/storefront/src/lib/theme/presets.generated.ts` `THEME_IDS`,
 * hand-transcribed. Same reason the composition enums are transcribed in
 * `store/storefront-settings/validation.ts`: `pnpm-workspace.yaml` lists only
 * `apps/**`, so there is no shared package the two apps could import one copy
 * from, and the storefront file itself is generated from
 * `specs/design-system/themes/*.theme.json` by `scripts/build-themes.mjs`.
 * Keep in step with that generator's output by hand.
 */
export const THEME_PRESETS = [
  "electronics",
  "geist",
  "home-goods",
  "medusa",
  "sneakers",
  "supplements",
  "womens-fashion",
] as const;

export type ThemePreset = (typeof THEME_PRESETS)[number];

/** The three home blocks `content.order` may name, each at most once. */
export const HOME_BLOCKS = ["hero", "categories", "products"] as const;
export type HomeBlock = (typeof HOME_BLOCKS)[number];

export const TENANT_HOME_SCHEMA_ID = "upready.tenant-home/v1";

/** A storefront locale code as an `i18n` key: `ru`, `en`, `pt-BR`. */
const LOCALE_KEY = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** Per-locale overrides of the copy fields; the base fields stay the fallback. A
 *  storefront serves 36 locales over one document, so a Russian visitor of a shop
 *  whose owner wrote English copy otherwise reads that English under a Russian catalog
 *  (measured on acme/globex/initech `/ru`, 2026-09-12). Keys are storefront locale
 *  codes (`ru`, `en`, `pt-BR`). */
const heroCopySchema = z
  .object({
    title: z.string().max(200),
    subtitle: z.string().max(500),
    cta_label: z.string().max(100),
  })
  .partial();

const heroSchema = z.object({
  title: z.string().max(200).default(""),
  subtitle: z.string().max(500).default(""),
  cta_label: z.string().max(100).default(""),
  /** A path on the tenant's own storefront (`/store`) or an absolute URL; the
   *  storefront renders it as a link and never as markup, so no scheme check. */
  cta_href: z.string().max(500).default(""),
  image_url: z.string().max(1000).nullable().default(null),
  i18n: z.record(z.string().regex(LOCALE_KEY), heroCopySchema).optional(),
});

const productsSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("popular") }),
  z.object({
    source: z.literal("category"),
    /** Checked against the tenant-product-category link in the route: a
     *  category the tenant does not own is INVALID_DATA, never a silent write. */
    category_id: z.string().min(1),
    title: z.string().max(200).default(""),
  }),
]);

const orderSchema = z
  .array(z.enum(HOME_BLOCKS))
  .max(HOME_BLOCKS.length)
  .refine((blocks) => new Set(blocks).size === blocks.length, {
    message: "order may name each block at most once.",
  });

/**
 * Home banners (t-2026-09-24-n15, Ivan 2026-09-25: «в админке возможность
 * редактировать изображения и тексты во всех углах … кликабельным должен быть
 * весь баннер … ссылка на продукт или произвольный url»). One row per banner of
 * the storefront's HeroSliders block (Figma 238:17551): a picture, four corner
 * texts (kicker top-left, label top-right, title bottom-left, button
 * bottom-right) and ONE link the whole card carries. Texts are short by design —
 * they sit in rounded chips over the picture — hence the 60-character cap.
 *
 * `image.srcset` is the same list `scripts/media/make-image-variants.mjs` writes
 * for the course cover, so a fixture-cut picture reaches the storefront as a real
 * `srcset`; a panel upload has only `src`.
 *
 * The product link carries the handle the storefront links to; the route
 * re-reads it from the product at save time (ownership check + canonical
 * handle), so a renamed product cannot leave a stale handle behind.
 */
export const HOME_BANNER_TEXT_MAX = 60;
export const HOME_BANNERS_MAX = 10;

/** `http(s)://…` or a site-relative path (`/ru/store`); never a scheme the
 *  storefront would render as script, never a protocol-relative `//host`. */
export const isAllowedBannerHref = (href: string): boolean =>
  /^https?:\/\/[^\s]+$/i.test(href) || (/^\/[^\s]*$/.test(href) && !href.startsWith("//"));

const bannerImageSchema = z.object({
  src: z.string().min(1).max(1000),
  alt: z.string().max(200).default(""),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  srcset: z
    .array(z.object({ w: z.number().int().positive(), url: z.string().min(1).max(1000) }))
    .max(10)
    .optional(),
});

const bannerLinkSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("product"),
    product_id: z.string().min(1),
    handle: z.string().max(200).default(""),
  }),
  z.object({
    type: z.literal("url"),
    href: z
      .string()
      .min(1)
      .max(1000)
      .refine(isAllowedBannerHref, {
        message: "href must be http(s)://… or a site path starting with /.",
      }),
  }),
]);

const bannerTextSchema = z.string().max(HOME_BANNER_TEXT_MAX).default("");

/** A banner's texts in one more language, keyed by storefront locale code like
 *  `hero.i18n`: the base texts are the shop's default language, and the
 *  storefront falls back to them for a locale or a text this leaves out
 *  (`localizedBanner`). Without it cherkashino.com/ru, whose default is English,
 *  showed «OCTOBER 10 · COURSE» over a Russian interface (2026-10-05). */
const bannerCopySchema = z
  .object({
    kicker: z.string().max(HOME_BANNER_TEXT_MAX),
    label: z.string().max(HOME_BANNER_TEXT_MAX),
    title: z.string().max(HOME_BANNER_TEXT_MAX),
    button: z.string().max(HOME_BANNER_TEXT_MAX),
    alt: z.string().max(200),
  })
  .partial();

export const HomeBannerSchema = z.object({
  id: z.string().min(1).max(64),
  image: bannerImageSchema,
  kicker: bannerTextSchema,
  label: bannerTextSchema,
  title: bannerTextSchema,
  button: bannerTextSchema,
  link: bannerLinkSchema,
  sort: z.number().int().min(0).max(1000).default(0),
  i18n: z.record(z.string().regex(LOCALE_KEY), bannerCopySchema).optional(),
});

const bannersSchema = z
  .array(HomeBannerSchema)
  .max(HOME_BANNERS_MAX)
  .default([])
  .refine((banners) => new Set(banners.map((b) => b.id)).size === banners.length, {
    message: "banners must have distinct ids.",
  });

const contentSchema = z.object({
  hero: heroSchema,
  products: productsSchema,
  order: orderSchema,
  banners: bannersSchema,
});

/**
 * `settings` is deliberately typed as a bare object here and validated by
 * `validateFields()` below rather than by a second zod transcription of the six
 * enums: the contract calls `store/storefront-settings/validation.ts` the one
 * copy on this side, and a zod duplicate would be a second one to keep in step.
 * A field-level failure is reported through zod so it lands as the framework's
 * own 400; the FORBIDDEN-pair check stays in the route, which answers 422.
 */
const settingsSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, ctx) => {
    for (const error of validateFields(value)) {
      ctx.addIssue({
        code: "custom",
        path: [error.field],
        message: error.message,
      });
    }
  });

export const PutTenantHomeBody = z.object({
  schema: z.literal(TENANT_HOME_SCHEMA_ID).optional(),
  theme: z.object({ preset: z.enum(THEME_PRESETS) }),
  settings: settingsSchema,
  content: contentSchema,
});

export type PutTenantHomeBodyType = z.infer<typeof PutTenantHomeBody>;

/** The stored document: the validated body plus the server's own stamp. */
export type TenantHomeDocument = {
  schema: typeof TENANT_HOME_SCHEMA_ID;
  theme: { preset: ThemePreset };
  settings: StorefrontSettingsInput;
  content: {
    hero: {
      title: string;
      subtitle: string;
      cta_label: string;
      cta_href: string;
      image_url: string | null;
      i18n?: Record<string, { title?: string; subtitle?: string; cta_label?: string }>;
    };
    products:
      | { source: "popular" }
      | { source: "category"; category_id: string; title: string };
    order: HomeBlock[];
    /** Absent on documents saved before t-2026-09-24-n15; the storefront reads it as `[]`. */
    banners?: HomeBanner[];
  };
  updatedAt: string;
};

export type HomeBanner = z.infer<typeof HomeBannerSchema>;

/** Re-exported so the route imports the forbidden-pair check from one place. */
export { isForbidden };
export type { ForbiddenRule };
