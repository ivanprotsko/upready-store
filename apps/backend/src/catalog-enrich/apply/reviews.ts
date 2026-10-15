import type { MedusaContainer } from "@medusajs/framework";
import { PRODUCT_REVIEW_MODULE } from "../../modules/product-review";
import type ProductReviewModuleService from "../../modules/product-review/service";
import type { DatasetProduct } from "../dataset";
import type { ApplyOptions, SectionCounters, LiveProduct } from "./live";

/**
 * The reviews section.
 *
 * `../apply.ts` runs the sections in order and re-exports what callers use
 * from here (t-2026-10-14-55).
 */

/** The language every WB review is written in; the cabinet is a Russian one. */
export const WB_REVIEW_LANGUAGE = "ru";

/**
 * The reviews of a card the shop does not hold yet.
 *
 * The key is WB's own feedback id plus the language, the pair
 * `product_review` already makes unique per product while the row is alive. A
 * review the owner later edited on the panel therefore keeps its edit: the
 * import fills an ABSENCE and never overwrites a row. Pure, so the dedupe can
 * be argued about without a database.
 */
export const reviewsToCreate = <T extends { source_key: string }>(
  existing: { source_key: string | null; language: string }[],
  reviews: T[],
): T[] => {
  const held = new Set(
    existing
      .filter((row) => row.source_key)
      .map((row) => `${row.source_key}:${row.language}`),
  );

  const out: T[] = [];
  for (const review of reviews) {
    const key = `${review.source_key}:${WB_REVIEW_LANGUAGE}`;
    // A card that lists the same feedback twice must still produce one row:
    // the unique index would refuse the second and take the batch with it.
    if (held.has(key)) {
      continue;
    }
    held.add(key);
    out.push(review);
  }

  return out;
};

/**
 * The card's reviews, as reviews of the shop.
 *
 * Idempotent on `source_key` — WB's own feedback id — which is the column
 * `product_review` already makes unique per (tenant, product, source_key,
 * language). A review whose text the owner edited on the panel is NOT
 * overwritten: only the absence of a row is filled. Status is `published`,
 * because these already stand published on the WB card.
 */
export const applyReviews = async (
  container: MedusaContainer,
  tenantId: string,
  product: LiveProduct,
  entry: DatasetProduct,
  options: ApplyOptions,
  counters: SectionCounters,
): Promise<void> => {
  if (!entry.reviews.length) {
    return;
  }

  const service = container.resolve<ProductReviewModuleService>(PRODUCT_REVIEW_MODULE);
  const existing = (await service.listProductReviews({
    tenant_id: tenantId,
    product_id: product.id,
  })) as unknown as { source_key: string | null; language: string }[];

  const toCreate = reviewsToCreate(existing, entry.reviews);
  counters.reviews_unchanged += entry.reviews.length - toCreate.length;

  if (!toCreate.length) {
    return;
  }

  counters.reviews_imported += toCreate.length;
  options.logger.info(`[enrich] ${product.handle}: ${toCreate.length} отзывов с карточки WB`);

  if (options.dryRun) {
    return;
  }

  await service.createProductReviews(
    toCreate.map((review) => ({
      tenant_id: tenantId,
      product_id: product.id,
      author_name: review.author_name,
      rating: review.rating,
      body: review.body,
      language: WB_REVIEW_LANGUAGE,
      status: "published" as const,
      source: "wb" as const,
      reply: review.reply,
      replied_at: review.reply ? new Date() : null,
      review_date: review.review_date ? new Date(review.review_date) : null,
      source_key: review.source_key,
    })),
  );
};
