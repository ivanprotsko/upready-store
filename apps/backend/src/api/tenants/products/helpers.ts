import type { ProductDTO } from "@medusajs/framework/types";
import { remapProductResponse } from "@medusajs/medusa/api/admin/products/helpers";

/**
 * The Admin's own product response remapper, behind one cast.
 *
 * `query.graph` types a product row from the entity map Medusa generates into
 * `.medusa/types` while it runs, where every relation is `Maybe<T>`; the
 * Admin's remapper is written against `ProductDTO`, where the same relations
 * are `T | null`. It is the same row either way. Doing the remap ourselves
 * would be the alternative, and the remap is not cosmetic: the graph nests
 * prices under `variant.price_set.prices` and every Admin screen reads them as
 * `variant.prices`, so this keeps that translation in the Admin's hands.
 */
export const remapTenantProduct = (product: unknown) =>
  remapProductResponse(product as ProductDTO);
