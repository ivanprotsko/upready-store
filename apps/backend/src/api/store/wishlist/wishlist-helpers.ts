export type WishlistItemRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  product_id: string;
  created_at: Date | string;
};

export type WishlistProductSummary = {
  id: string;
  title: string;
  handle: string | null;
  thumbnail: string | null;
  variant_ids: string[];
};

export type WishlistItemDto = {
  product_id: string;
  created_at: string;
  /** Null when the product was deleted after it was saved (the same shape `product_review` and courses use — rule 20a: a stale row is shown as "the product is gone", never dropped silently). */
  product: WishlistProductSummary | null;
};

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export const toWishlistItemDto = (
  row: WishlistItemRow,
  productsById: Map<string, WishlistProductSummary>,
): WishlistItemDto => ({
  product_id: row.product_id,
  created_at: iso(row.created_at),
  product: productsById.get(row.product_id) ?? null,
});

/** Newest first, so a heart tapped a moment ago shows up at the top of `/account/wishlist`. */
export const sortWishlistNewestFirst = <T extends { created_at: Date | string }>(
  rows: T[],
): T[] =>
  [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
