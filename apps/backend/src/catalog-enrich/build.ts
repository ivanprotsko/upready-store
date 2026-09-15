import type { MedusaContainer } from "@medusajs/framework";
import { WB_MODULE } from "../modules/wb";
import type WbModuleService from "../modules/wb/service";
import { loadLiveProducts, tenantProductIds } from "./apply";
import { DATASET_VERSION, type DatasetProduct, type EnrichDataset } from "./dataset";
import { matchCatalog, type CatalogProduct, type MirrorCard } from "./match";
import {
  buyerPrice,
  cardCharacteristics,
  cardPhotos,
  priceCurrency,
  reviewFromFeedback,
  reviewSkipReason,
  type MirrorFeedbackRow,
  type MirrorPriceRow,
  type MirrorProductRow,
} from "./wb-source";

/**
 * Building the dataset out of the WB mirror and this shop's catalog
 * (w07-tenant-catalog-enrich).
 *
 * This is the half that needs the mirror, and therefore the half the live host
 * cannot run: there the dataset arrives as a file and only `applyDataset`
 * runs. Nothing here writes.
 */

export type BuildResult = {
  dataset: EnrichDataset;
  /** Products of the shop nothing in the cabinet matches; already inside the dataset too. */
  unmatched_products: { handle: string; title: string; sku: string | null }[];
  /** Feedbacks that could not become reviews, by the reason they could not. */
  reviews_skipped: { no_text: number; no_rating: number };
};

export const buildDataset = async (
  container: MedusaContainer,
  tenant: { id: string; handle: string },
  now: Date,
): Promise<BuildResult> => {
  const wb = container.resolve<WbModuleService>(WB_MODULE);

  const cards = (await wb.listWbProducts({ tenant_id: tenant.id })) as unknown as (MirrorProductRow & {
    fetched_at: Date | string | null;
  })[];
  const prices = (await wb.listWbPrices({ tenant_id: tenant.id })) as unknown as MirrorPriceRow[];
  const feedbacks = (await wb.listWbFeedbacks({
    tenant_id: tenant.id,
  })) as unknown as MirrorFeedbackRow[];

  const productIds = await tenantProductIds(container, tenant.id);
  const live = await loadLiveProducts(container, productIds);

  const catalog: CatalogProduct[] = [...live.values()].map((product) => ({
    id: product.id,
    title: product.title,
    handle: product.handle,
    variants: product.variants.map((variant) => ({ id: variant.id, sku: variant.sku })),
    metadata: product.metadata,
  }));

  const mirrorCards: MirrorCard[] = cards.map((card) => ({
    nm_id: card.nm_id,
    vendor_code: card.vendor_code,
    title: card.title,
  }));

  const match = matchCatalog(catalog, mirrorCards);

  const cardByNmId = new Map(cards.map((card) => [card.nm_id, card]));
  const priceByNmId = new Map(prices.map((price) => [price.nm_id, price]));

  const feedbacksByNmId = new Map<string, MirrorFeedbackRow[]>();
  for (const feedback of feedbacks) {
    if (!feedback.nm_id) {
      continue;
    }
    const list = feedbacksByNmId.get(feedback.nm_id) ?? [];
    list.push(feedback);
    feedbacksByNmId.set(feedback.nm_id, list);
  }

  const reviewsSkipped = { no_text: 0, no_rating: 0 };

  const products: DatasetProduct[] = match.matched.map((one) => {
    const card = cardByNmId.get(one.nm_id);
    const price = priceByNmId.get(one.nm_id) ?? null;
    const currency = priceCurrency(price);
    const amount = buyerPrice(price);

    const reviews = (feedbacksByNmId.get(one.nm_id) ?? [])
      .map((feedback) => {
        const skipped = reviewSkipReason(feedback);
        if (skipped) {
          reviewsSkipped[skipped] += 1;
          return null;
        }
        return reviewFromFeedback(feedback);
      })
      .filter((review): review is NonNullable<typeof review> => review !== null)
      // Oldest first, so the storefront's own ordering is the only thing that
      // decides what a visitor sees first.
      .sort((left, right) => String(left.review_date).localeCompare(String(right.review_date)));

    return {
      product_handle: one.product_handle,
      product_id: one.product_id,
      variant_sku: one.variant_sku,
      nm_id: one.nm_id,
      vendor_code: one.vendor_code,
      matched_by: one.matched_by,
      title: card?.title ?? null,
      price: amount !== null && currency ? { amount, currency } : null,
      characteristics: cardCharacteristics(card?.raw),
      reviews,
      images: cardPhotos(card?.photos).map((photo) => ({ index: photo.index, url: photo.url })),
    };
  });

  const fetchedAt = cards
    .map((card) => (card.fetched_at ? new Date(card.fetched_at).toISOString() : null))
    .filter((value): value is string => Boolean(value))
    .sort()
    .pop();

  const dataset: EnrichDataset = {
    version: DATASET_VERSION,
    generated_at: now.toISOString(),
    tenant_handle: tenant.handle,
    marketplace: "wb",
    source: {
      cards: cards.length,
      prices: prices.length,
      feedbacks: feedbacks.length,
      mirror_fetched_at: fetchedAt ?? null,
    },
    products,
    unmatched_products: match.unmatched_products.map((product) => ({
      handle: product.handle,
      title: product.title,
      sku: product.sku,
    })),
    unmatched_cards: match.unmatched_cards.length,
  };

  return {
    dataset,
    unmatched_products: dataset.unmatched_products,
    reviews_skipped: reviewsSkipped,
  };
};
