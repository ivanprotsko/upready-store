import { model } from "@medusajs/framework/utils";

/**
 * Where the review came from. `shop` is a review a customer left on the
 * storefront; `imported` is one carried over from a shop the owner ran before
 * this platform (t09-reviews imports the Cherkashina corpus). The marker is
 * shown in the panel and decides nothing else: an imported review is moderated
 * with the same three statuses as any other.
 */
export const REVIEW_SOURCES = ["shop", "imported"] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

/**
 * `pending` is what the storefront writes and the only status the visitor
 * cannot see; `published` is on the product page; `hidden` is a published
 * review the owner took down without deleting it, which keeps the moderation
 * decision on file.
 */
export const REVIEW_STATUSES = ["pending", "published", "hidden"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const MIN_RATING = 1;
export const MAX_RATING = 5;

/**
 * One product review of one shop.
 *
 * Scope is the pair of columns `tenant_id` + `product_id`, never a field from
 * the request: every tenant-side route filters by the tenant behind the token
 * and every storefront read filters by the tenant behind the publishable key.
 * There is no `src/links/tenant-product-review.ts`: a link table would be a
 * second record of the fact `tenant_id` already holds (rule 20a), and every
 * write checks the product against `assertOwnedProduct`, so the column cannot
 * drift away from the product's own tenant.
 *
 * `language` is the language the review is WRITTEN in, one row per language.
 * An imported review that exists in two languages is two rows sharing one
 * `source_key`; the storefront picks one row per `source_key` for the visitor's
 * locale (`pickReviewForLocale`) so a translated review is never counted twice
 * in the average.
 *
 * `source_key` is also what makes the import idempotent: unique per
 * (tenant, product, source_key, language) while the row is alive, and null for
 * a review a customer left on the storefront.
 *
 * `review_date` is when the review was WRITTEN, which for an imported one is
 * its date in the old shop and not the day it was copied over. A review left on
 * the storefront leaves it null and is dated by `created_at`.
 */
const ProductReview = model
  .define("product_review", {
    id: model.id({ prefix: "prev" }).primaryKey(),
    tenant_id: model.text(),
    product_id: model.text(),
    author_name: model.text(),
    rating: model.number(),
    title: model.text().nullable(),
    body: model.text(),
    language: model.text().default("en"),
    status: model.enum([...REVIEW_STATUSES]).default("pending"),
    source: model.enum([...REVIEW_SOURCES]).default("shop"),
    /** The logged-in customer who left it, when there was one. */
    customer_id: model.text().nullable(),
    /** The order that proves the purchase, when the storefront could name one. */
    order_id: model.text().nullable(),
    /** The owner's public answer, rendered under the review. */
    reply: model.text().nullable(),
    replied_at: model.dateTime().nullable(),
    review_date: model.dateTime().nullable(),
    source_key: model.text().nullable(),
  })
  .indexes([
    {
      on: ["tenant_id", "product_id", "status"],
      where: "deleted_at IS NULL",
    },
    {
      on: ["tenant_id", "product_id", "source_key", "language"],
      unique: true,
      where: "deleted_at IS NULL AND source_key IS NOT NULL",
    },
  ]);

export default ProductReview;
