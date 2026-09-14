import { z } from "@medusajs/framework/zod";
import { MAX_RATING, MIN_RATING } from "../../../../modules/product-review/models/product-review";

/**
 * `POST /store/tenant/reviews` — the form on the product page (t09-reviews).
 *
 * The author's name is the only identity field the visitor types; the customer
 * behind the token is taken from `req.auth_context`, never from the body, and
 * so is the tenant (from the publishable key) and the review's status
 * (`pending`, always). `product_id` is checked against the storefront's own
 * tenant by the route.
 */
export const PostStoreReviewSchema = z.strictObject({
  product_id: z.string().min(1).max(120),
  rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
  title: z.string().max(200).optional(),
  body: z.string().min(1).max(5_000),
  author_name: z.string().min(1).max(120),
  language: z
    .string()
    .regex(/^[a-z]{2}(?:-[A-Za-z0-9]{2,8})?$/, "a BCP-47 language tag, e.g. en or pt-BR")
    .optional(),
});

export type PostStoreReviewBody = z.infer<typeof PostStoreReviewSchema>;
