import { z } from "@medusajs/framework/zod";

/**
 * `POST /store/wishlist` — the customer behind the token and the tenant behind
 * the publishable key are never in the body (the route reads both off the
 * request), only the product they are saving.
 */
export const PostStoreWishlistSchema = z.strictObject({
  product_id: z.string().min(1).max(120),
});

export type PostStoreWishlistBody = z.infer<typeof PostStoreWishlistSchema>;
