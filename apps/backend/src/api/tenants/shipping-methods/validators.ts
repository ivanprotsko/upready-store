import { z } from "@medusajs/framework/zod";

/**
 * Bodies of `/tenants/shipping-methods/**`. Plain object schemas only:
 * `zodValidator` calls `.strict()` on the top level, which a refined schema
 * would not survive (see `validators.ts` of the pages routes). The tariff is
 * a discriminated union nested inside, which strict mode leaves alone.
 */

const amount = z.number().min(0).max(10_000_000);

export const TariffSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("flat"), amount }),
  z.object({
    kind: z.literal("per_kg"),
    base_amount: amount,
    per_kg_amount: amount,
    min_weight_g: z.number().int().min(0).max(1_000_000).nullable().optional(),
  }),
  z.object({ kind: z.literal("free_above"), amount, free_above_total: amount }),
]);

export const ZoneSchema = z
  .object({
    country_code: z.string().regex(/^[A-Za-z]{2}$/, "ISO-2 country code"),
    /** Region strings as `ru-regions.ts` spells them; empty = the whole country. */
    provinces: z.array(z.string().min(1).max(120)).max(120).default([]),
    /** Accepted so a client can round-trip a method it read; the route always rewrites it. */
    label: z.string().max(120).nullable().optional(),
  })
  .nullable();

/** `carriers.ts` key; a method the owner named herself carries none. */
const carrier = z.string().trim().min(1).max(40).nullable().optional();

export const PostTenantShippingMethodSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  delivery_hint: z.string().max(120).nullable().optional(),
  enabled: z.boolean().default(true),
  zone: ZoneSchema.default(null),
  carrier,
  tariff: TariffSchema,
});

export type PostTenantShippingMethodBody = z.infer<typeof PostTenantShippingMethodSchema>;

export const PostTenantShippingMethodUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  delivery_hint: z.string().max(120).nullable().optional(),
  enabled: z.boolean().optional(),
  zone: ZoneSchema.optional(),
  carrier,
  tariff: TariffSchema.optional(),
});

export type PostTenantShippingMethodUpdateBody = z.infer<typeof PostTenantShippingMethodUpdateSchema>;

export const PostTenantShippingMethodsReorderSchema = z.object({
  /** Every method id of the shop, in the order the owner wants them shown. */
  ids: z.array(z.string().min(1)).min(1).max(200),
});

export type PostTenantShippingMethodsReorderBody = z.infer<typeof PostTenantShippingMethodsReorderSchema>;

export const PostTenantShippingSettingsSchema = z.object({
  default_weight_g: z.number().int().min(1).max(100_000),
});

export type PostTenantShippingSettingsBody = z.infer<typeof PostTenantShippingSettingsSchema>;

export const GetShippingRegionsSchema = z.object({
  country_code: z.string().regex(/^[A-Za-z]{2}$/).default("ru"),
});

export type GetShippingRegionsQuery = z.infer<typeof GetShippingRegionsSchema>;

export const PostStoreShippingQuoteSchema = z.object({
  cart_id: z.string().min(1),
  shipping_option_id: z.string().min(1),
});

export type PostStoreShippingQuoteBody = z.infer<typeof PostStoreShippingQuoteSchema>;

/**
 * `POST /tenants/shipping-methods/zone-presets` — one delivery method per
 * chosen Russian zone, all on the same carrier and the same «base + per kg»
 * shape, priced per zone. Every zone the owner leaves out is simply not
 * created; a zone whose method already exists is skipped, not duplicated.
 */
export const PostTenantZonePresetsSchema = z.object({
  carrier: z.string().trim().min(1).max(40),
  /** Overrides the carrier's own method name; the zone name is appended to it. */
  name: z.string().trim().min(1).max(80).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  delivery_hint: z.string().max(120).nullable().optional(),
  enabled: z.boolean().default(true),
  zones: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(40),
        base_amount: amount,
        per_kg_amount: amount,
        min_weight_g: z.number().int().min(0).max(1_000_000).nullable().optional(),
      }),
    )
    .min(1)
    .max(40),
});

export type PostTenantZonePresetsBody = z.infer<typeof PostTenantZonePresetsSchema>;
