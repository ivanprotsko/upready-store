import { z } from "@medusajs/framework/zod";
import { MARKETPLACE_IDS } from "../../../../../modules/marketplace/registry";

/**
 * `POST /tenants/marketplaces/catalog/links` — the owner ties ONE marketplace
 * card to ONE variant of her shop by hand (w14-mp-catalog-link).
 *
 * The marketplace comes from the registry rather than from a list spelled here,
 * so a third adapter is linkable the day it is registered and a removed one
 * stops being accepted the same day (rule 20).
 *
 * There is no `product_id` in the body on purpose: the product is the variant's
 * own parent and the server reads it there. Taking it from the client would let
 * a variant be filed under a product it does not belong to, and the row would
 * look perfectly well formed.
 */
export const PostTenantMpCatalogLinkBody = z.object({
  marketplace: z.enum(MARKETPLACE_IDS as unknown as [string, ...string[]]),
  external_id: z.string().min(1).max(200),
  variant_id: z.string().min(1).max(200),
});

export type PostTenantMpCatalogLinkBodyType = z.infer<typeof PostTenantMpCatalogLinkBody>;
