import type { MedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { toReviewDto, type ReviewDto, type ReviewRow } from "./review-helpers";

/**
 * The product a review is about, as the panel names it: the list and the
 * review's own drawer (t-2026-10-14-01, G5) both show its title, so it
 * travels with the row instead of costing a second round trip per row.
 */
export type ReviewProductCard = {
  id: string;
  title: string;
  handle: string;
  thumbnail: string | null;
};

export type TenantReviewDto = ReviewDto & { product: ReviewProductCard | null };

/** The cards of the products these rows name, one query for the whole page. */
export const loadReviewProducts = async (
  req: MedusaRequest,
  rows: ReviewRow[],
): Promise<Map<string, ReviewProductCard>> => {
  const ids = [...new Set(rows.map((row) => row.product_id))];
  if (!ids.length) return new Map();

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "thumbnail"],
    filters: { id: ids },
  });

  return new Map(
    (data as unknown as ReviewProductCard[]).map((product) => [
      product.id,
      {
        id: product.id,
        title: product.title,
        handle: product.handle,
        thumbnail: product.thumbnail ?? null,
      },
    ]),
  );
};

/** A row with its product; `null` where the product is gone. */
export const toTenantReviewDto = (
  row: ReviewRow,
  products: Map<string, ReviewProductCard>,
): TenantReviewDto => ({
  ...toReviewDto(row),
  product: products.get(row.product_id) ?? null,
});
