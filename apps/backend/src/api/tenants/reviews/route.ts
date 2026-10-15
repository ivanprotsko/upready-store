import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { PRODUCT_REVIEW_MODULE } from "../../../modules/product-review";
import type ProductReviewModuleService from "../../../modules/product-review/service";
import { REVIEW_STATUSES } from "../../../modules/product-review/models/product-review";
import { getTenantScope, listTenantProductIds, scopeIdFilter } from "../tenant-scope";
import {
  parseAnsweredFilter,
  parseRatingFilter,
  parseReviewOrder,
  parseSearch,
  parseSourceFilter,
  reviewListWhere,
} from "./list-query";
import { parseIdFilter, type ReviewRow } from "./review-helpers";
import { loadReviewProducts, toTenantReviewDto } from "./review-products";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const parsePositiveInt = (raw: unknown, fallback: number, max: number, field: string): number => {
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

const parseStatusFilter = (raw: unknown): string[] | null => {
  const values = parseIdFilter(raw);
  if (values === null) return null;
  const unknown = values.find(
    (value) => !(REVIEW_STATUSES as readonly string[]).includes(value),
  );
  if (unknown) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid request: 'status' must be one of ${REVIEW_STATUSES.join(", ")}`,
    );
  }
  return values;
};

/**
 * `GET /tenants/reviews` — the moderation list (t09-reviews). Every status,
 * newest first by the date the review was written, narrowed by `?status=` and
 * `?product_id=`, and since the G5 redesign (t-2026-10-14-01) also by
 * `?rating=`, `?source=`, `?answered=yes|no` and `?q=` (text, title or name),
 * sorted by `?order=` (`written_at` or `rating`, `-` for descending); the
 * parsing lives in `list-query.ts`.
 *
 * Scope is the tenant behind the token twice over: the `tenant_id` column is
 * always in the filter, and `product_id` is intersected with the products the
 * tenant owns (`listTenantProductIds`), so a `?product_id=` naming another
 * shop's product narrows the page to nothing instead of widening it. A tenant
 * with no products at all gets an empty page rather than an unfiltered one —
 * `id: undefined` in a Medusa filter is no filter at all.
 *
 * The product's own title travels with the row so the panel's list can name
 * what was reviewed without a second round trip per row.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const scope = await getTenantScope(req);
  const ownedProductIds = await listTenantProductIds(req);
  const requestedProductIds = parseIdFilter(req.query.product_id);
  const productIds =
    requestedProductIds === null
      ? ownedProductIds
      : scopeIdFilter(ownedProductIds, requestedProductIds);

  const limit = parsePositiveInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT, "limit");
  const offset = parsePositiveInt(req.query.offset, 0, 1_000_000, "offset");

  if (!productIds.length) {
    res.json({ reviews: [], count: 0, offset, limit });
    return;
  }

  const statuses = parseStatusFilter(req.query.status);
  const languages = parseIdFilter(req.query.language);
  const narrowing = reviewListWhere({
    ratings: parseRatingFilter(req.query.rating),
    sources: parseSourceFilter(req.query.source),
    answered: parseAnsweredFilter(req.query.answered),
    search: parseSearch(req.query.q),
  });
  const order = parseReviewOrder(req.query.order);

  const reviewService: ProductReviewModuleService = req.scope.resolve(PRODUCT_REVIEW_MODULE);
  const [rows, count] = await reviewService.listAndCountProductReviews(
    {
      tenant_id: scope.id,
      product_id: productIds,
      ...(statuses ? { status: statuses } : {}),
      ...(languages ? { language: languages } : {}),
      ...narrowing,
    },
    { skip: offset, take: limit, order },
  );

  const products = await loadReviewProducts(req, rows as ReviewRow[]);

  res.json({
    reviews: (rows as ReviewRow[]).map((row) => toTenantReviewDto(row, products)),
    count,
    offset,
    limit,
  });
};
