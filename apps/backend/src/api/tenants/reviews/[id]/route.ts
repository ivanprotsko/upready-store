import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { PRODUCT_REVIEW_MODULE } from "../../../../modules/product-review";
import type ProductReviewModuleService from "../../../../modules/product-review/service";
import { getTenantScope } from "../../tenant-scope";
import { toReviewDto, type ReviewRow } from "../review-helpers";
import type { PostTenantReviewBody } from "../validators";

/**
 * The review by id, or a 404 worded like Medusa's own miss. A review of
 * another shop is a MISSING review here, never a forbidden one, so the answer
 * never tells one tenant that another tenant's row exists.
 */
const loadOwnedReview = async (
  req: AuthenticatedMedusaRequest,
  id: string,
): Promise<ReviewRow> => {
  const scope = await getTenantScope(req);
  const reviewService: ProductReviewModuleService = req.scope.resolve(PRODUCT_REVIEW_MODULE);
  const [row] = await reviewService.listProductReviews({ id, tenant_id: scope.id });

  if (!row) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Review with id "${id}" was not found`);
  }

  return row as ReviewRow;
};

/**
 * `POST /tenants/reviews/:id` — publish, hide, or answer one review
 * (t09-reviews). Only the fields sent are written: the panel's «publish»
 * button and its reply box are two separate calls.
 *
 * `replied_at` is the server's clock, never the client's, and it is cleared
 * together with the reply so a removed answer does not leave a date behind.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostTenantReviewBody>,
  res: MedusaResponse,
) => {
  const existing = await loadOwnedReview(req, req.params.id);
  const { status, reply } = req.validatedBody;

  if (status === undefined && reply === undefined) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid request: send at least one of 'status' or 'reply'",
    );
  }

  const trimmedReply = typeof reply === "string" ? reply.trim() : reply;
  const reviewService: ProductReviewModuleService = req.scope.resolve(PRODUCT_REVIEW_MODULE);

  await reviewService.updateProductReviews({
    id: existing.id,
    ...(status === undefined ? {} : { status }),
    ...(reply === undefined
      ? {}
      : trimmedReply
        ? { reply: trimmedReply, replied_at: new Date() }
        : { reply: null, replied_at: null }),
  });

  const [updated] = await reviewService.listProductReviews({ id: existing.id });
  res.json({ review: toReviewDto(updated as ReviewRow) });
};

/**
 * `DELETE /tenants/reviews/:id` — the owner removes a review for good. A soft
 * delete (the module's own `deleted_at`), so the unique index that makes the
 * import idempotent stops counting the row and a re-import may write it again.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const existing = await loadOwnedReview(req, req.params.id);
  const reviewService: ProductReviewModuleService = req.scope.resolve(PRODUCT_REVIEW_MODULE);

  await reviewService.softDeleteProductReviews([existing.id]);

  res.json({ id: existing.id, object: "product_review", deleted: true });
};
