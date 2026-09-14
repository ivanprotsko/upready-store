import { z } from "@medusajs/framework/zod";
import { REVIEW_STATUSES } from "../../../modules/product-review/models/product-review";

/**
 * `POST /tenants/reviews/:id` — the owner's moderation act. Every field is
 * optional and only what is sent is written, so publishing a review and
 * answering it are two independent calls from the panel rather than one
 * request that has to carry the whole row.
 *
 * `reply: null` (or an empty string) removes an answer already given. That is
 * why the field is nullable rather than merely optional: an omitted field and
 * a field set to null have to mean different things here.
 */
export const PostTenantReviewSchema = z.strictObject({
  status: z.enum(REVIEW_STATUSES).optional(),
  reply: z.string().max(5_000).nullable().optional(),
});

export type PostTenantReviewBody = z.infer<typeof PostTenantReviewSchema>;
