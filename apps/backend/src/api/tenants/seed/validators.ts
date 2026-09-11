import { z } from "@medusajs/framework/zod";
import { THEME_PRESETS } from "../home/validators";

/**
 * `POST /tenants/seed` — fill an EMPTY shop with the starter catalog
 * (specs/catalog-taxonomy/ABSTRACT-DATASETS.md §4). `preset` is the theme the shop chose in the
 * wizard: it picks a theme-specific dataset when one exists and the universal one otherwise, so
 * a request without it is legal and gets the universal set.
 */
export const PostTenantSeedBody = z.object({
  preset: z.enum(THEME_PRESETS).optional(),
});

export type PostTenantSeedBodyType = z.infer<typeof PostTenantSeedBody>;
