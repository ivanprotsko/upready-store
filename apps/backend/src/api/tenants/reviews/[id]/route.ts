import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { PRODUCT_REVIEW_MODULE } from "../../../../modules/product-review";
import type ProductReviewModuleService from "../../../../modules/product-review/service";
import { notifyStorefrontRevalidate } from "../../../../storefront-revalidate";
import { getTenantScope } from "../../tenant-scope";
import { toReviewDto, type ReviewRow } from "../review-helpers";
import { loadReviewProducts, toTenantReviewDto } from "../review-products";
import type { PostTenantReviewBody } from "../validators";

/**
 * The review by id, or a 404 worded like Medusa's own miss. A review of
 * another shop is a MISSING review here, never a forbidden one, so the answer
 * never tells one tenant that another tenant's row exists.
 */
const loadOwnedReview = async (
  req: AuthenticatedMedusaRequest,
  id: string,
): Promise<{ row: ReviewRow; handle: string }> => {
  const scope = await getTenantScope(req);
  const reviewService: ProductReviewModuleService = req.scope.resolve(PRODUCT_REVIEW_MODULE);
  const [row] = await reviewService.listProductReviews({ id, tenant_id: scope.id });

  if (!row) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Review with id "${id}" was not found`);
  }

  return { row: row as ReviewRow, handle: scope.handle };
};

/**
 * `GET /tenants/reviews/:id` — one review with its product, in the list's
 * shape (t-2026-10-14-01, G5): the panel opens a review in a drawer on its own
 * address, `/reviews/:id`, which a link or a reload reaches without the list
 * page that holds the row.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { row } = await loadOwnedReview(req, req.params.id);
  const products = await loadReviewProducts(req, [row]);
  res.json({ review: toTenantReviewDto(row, products) });
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
  const { row: existing, handle } = await loadOwnedReview(req, req.params.id);
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

  // Publishing, hiding or answering a review changes what the storefront shows
  // and what its average is, and that page is cached under the shared
  // `product-reviews` tag. Without this the owner's act stays invisible until
  // the cache ages out.
  await notifyStorefrontRevalidate({ type: "tenant.reviews", handle, id: existing.id });

  const [updated] = await reviewService.listProductReviews({ id: existing.id });
  res.json({ review: toReviewDto(updated as ReviewRow) });
};

/**
 * `DELETE /tenants/reviews/:id` — the owner removes a review for good. A soft
 * delete (the module's own `deleted_at`), so the unique index that makes the
 * import idempotent stops counting the row and a re-import may write it again.
 */
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { row: existing, handle } = await loadOwnedReview(req, req.params.id);
  const reviewService: ProductReviewModuleService = req.scope.resolve(PRODUCT_REVIEW_MODULE);

  await reviewService.softDeleteProductReviews([existing.id]);
  await notifyStorefrontRevalidate({ type: "tenant.reviews", handle, id: existing.id });

  res.json({ id: existing.id, object: "product_review", deleted: true });
};
