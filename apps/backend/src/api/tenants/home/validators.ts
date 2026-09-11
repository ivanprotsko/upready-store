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
  /** The dark version of `image_url`, the mode-image-pair axis
   *  (`specs/store-profiles/MODE-IMAGE-PAIRS.md`). Optional and defaulted the same way the
   *  base is, so a document saved before this field existed keeps validating and saving;
   *  absent means both modes show `image_url`. No v2 and no migration: the shape only
   *  grew a field nobody has to fill. */
  image_url_dark: z.string().max(1000).nullable().default(null),
  i18n: z
    .record(z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/), heroCopySchema)
    .optional(),
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

const contentSchema = z.object({
  hero: heroSchema,
  products: productsSchema,
  order: orderSchema,
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
      /** Absent on a document stored before the mode-image-pair axis existed; the reader
       *  treats absent and null alike ("no dark version"). */
      image_url_dark?: string | null;
      i18n?: Record<string, { title?: string; subtitle?: string; cta_label?: string }>;
    };
    products:
      | { source: "popular" }
      | { source: "category"; category_id: string; title: string };
    order: HomeBlock[];
  };
  updatedAt: string;
};

/** Re-exported so the route imports the forbidden-pair check from one place. */
export { isForbidden };
export type { ForbiddenRule };
