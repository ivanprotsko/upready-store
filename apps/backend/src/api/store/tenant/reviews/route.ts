import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { PRODUCT_REVIEW_MODULE } from "../../../../modules/product-review";
import type ProductReviewModuleService from "../../../../modules/product-review/service";
import {
  parseIdFilter,
  pickReviewsForLocale,
  requestedReviewLocale,
  sortReviewsNewestFirst,
  summarizeReviews,
  toReviewDto,
  type ReviewRow,
} from "../../../tenants/reviews/review-helpers";
import { resolveTenantFromPublishableKey } from "../resolve-tenant";
import type { PostStoreReviewBody } from "./validators";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const parseLimit = (raw: unknown, fallback: number, max: number, field: string): number => {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid request: '${field}' must be a whole number between 0 and ${max}`,
    );
  }
  return value;
};

/**
 * `GET /store/tenant/reviews?product_id=…` — the published reviews of one
 * product of the storefront's own tenant, plus the count and the average the
 * product page shows near the title.
 *
 * Three things this route will not do:
 *
 * - It never answers a `pending` or a `hidden` row. A review a customer has
 *   just left is invisible until the owner publishes it in the panel.
 * - It never answers another tenant's review, because the tenant comes from
 *   the publishable key and is always in the filter. A `product_id` belonging
 *   to another shop simply matches nothing.
 * - It never averages an empty set: `summary.average` is `null` when the
 *   product has no published review, so the page has nothing to round up into
 *   a rating nobody gave (rule 20a).
 *
 * A review translated into several languages is one review here: the rows are
 * grouped by `source_key` and one is picked for the visitor's language, so the
 * count and the average are counts of REVIEWS and not of rows.
 *
 * Pagination is applied after that grouping, which is why the whole set of the
 * product's published rows is read: a product carries tens of reviews, not
 * thousands, and paginating in SQL before the grouping would hand out pages of
 * uneven size.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const productIds = parseIdFilter(req.query.product_id);

  if (!productIds || !productIds.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid request: 'product_id' is required",
    );
  }

  const limit = parseLimit(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT, "limit");
  const offset = parseLimit(req.query.offset, 0, 1_000_000, "offset");
  const requested = requestedReviewLocale(req);

  const reviewService: ProductReviewModuleService = req.scope.resolve(PRODUCT_REVIEW_MODULE);
  const rows = (await reviewService.listProductReviews({
    tenant_id: tenant.id,
    product_id: productIds,
    status: "published",
  })) as ReviewRow[];

  const picked = sortReviewsNewestFirst(pickReviewsForLocale(rows, requested));
  const summary = summarizeReviews(picked);

  res.json({
    reviews: picked.slice(offset, offset + limit).map(toReviewDto),
    count: picked.length,
    summary,
    offset,
    limit,
  });
};

/**
 * The customer's most recent order that carries this product, or null. It is
 * the purchase the review is attached to, and the panel shows it as the
 * difference between «a customer of this shop» and «somebody who typed a
 * name». A review without one is still accepted: the owner moderates every
 * review anyway, and refusing the form to a customer whose order is in another
 * account would cost more truth than it buys.
 */
const findProvingOrderId = async (
  req: AuthenticatedMedusaRequest,
  customerId: string,
  productId: string,
): Promise<string | null> => {
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "created_at", "items.product_id"],
      filters: { customer_id: customerId },
    });
    const hit = orders
      .filter((order) =>
        (order.items ?? []).some(
          (item: { product_id?: string | null } | null) => item?.product_id === productId,
        ),
      )
      .sort(
        (a, b) =>
          new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime(),
      )[0];
    return (hit?.id as string | undefined) ?? null;
  } catch (error) {
    // The proof is a nicety, not the review. A failure to look it up must not
    // lose the text the customer just typed — but it is not swallowed either
    // (rule 20a: tolerating is not hiding).
    console.error("POST /store/tenant/reviews: could not look up the proving order", error);
    return null;
  }
};

/**
 * `POST /store/tenant/reviews` — a logged-in customer leaves a review.
 *
 * It arrives as `pending` and stays invisible on the storefront until the owner
 * publishes it in the panel. The status is not a field of this request and
 * cannot be sent; neither can the tenant, the customer or the date.
 *
 * The product must belong to the storefront's own tenant, checked through the
 * tenant-product link, so this route cannot be used to write a review onto a
 * neighbouring shop's product.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<PostStoreReviewBody>,
  res: MedusaResponse,
) => {
  const tenant = await resolveTenantFromPublishableKey(req as unknown as MedusaStoreRequest);
  const customerId = req.auth_context?.actor_id;

  if (!customerId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "You must be logged in to leave a review.",
    );
  }

  const { product_id, rating, title, body, author_name, language } = req.validatedBody;

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [owner],
  } = await query.graph({
    entity: "tenant",
    fields: ["id", "products.id"],
    filters: { id: [tenant.id] },
  });

  const owns = (owner?.products ?? []).some(
    (product: { id?: string } | null) => product?.id === product_id,
  );

  if (!owns) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product with id "${product_id}" was not found`,
    );
  }

  const orderId = await findProvingOrderId(req, customerId, product_id);
  const reviewService: ProductReviewModuleService = req.scope.resolve(PRODUCT_REVIEW_MODULE);

  const created = await reviewService.createProductReviews({
    tenant_id: tenant.id,
    product_id,
    author_name: author_name.trim(),
    rating,
    title: title?.trim() || null,
    body: body.trim(),
    language: language ?? "en",
    status: "pending",
    source: "shop",
    customer_id: customerId,
    order_id: orderId,
    review_date: new Date(),
    source_key: null,
  });

  const row = Array.isArray(created) ? created[0] : created;

  res.status(201).json({ review: toReviewDto(row as ReviewRow) });
};
