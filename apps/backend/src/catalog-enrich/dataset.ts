import type { MatchKind } from "../modules/marketplace-link/models/product-marketplace-link";
import type { CardReview } from "./wb-source";

/**
 * The portable form of one enrichment (w07-tenant-catalog-enrich).
 *
 * The WB key belongs to the shop and lives on ONE stand at a time, so the live
 * host cannot read the cabinet: `--export` writes this file here, where the
 * mirror is, and `--import` replays it there, where it is not. Everything in it
 * is public data off a WB card — a title, a price, characteristics, reviews and
 * photo URLs — and NOTHING is a credential: the file carries no key, no token
 * and no cabinet identifier, which is what lets it be committed next to the
 * report.
 *
 * A product is addressed by its `handle`, never by its id: ids are per stand,
 * handles are the shop's own and identical on both.
 */
export const DATASET_VERSION = 1 as const;

export type DatasetProduct = {
  /** The shop's own address for the product; the same string on every stand. */
  product_handle: string;
  /** This stand's id, for the report only. An import never dereferences it. */
  product_id: string | null;
  variant_sku: string | null;
  nm_id: string;
  vendor_code: string | null;
  matched_by: MatchKind;
  /** The card's title, or null when WB has none. */
  title: string | null;
  /** What a WB buyer pays, in whole units of `currency`. */
  price: { amount: number; currency: string } | null;
  /** The card's characteristics, the regulatory ones already dropped. */
  characteristics: { name: string; value: string }[];
  reviews: CardReview[];
  /** Photo source URLs at WB's largest size, in the card's own order. */
  images: { index: number; url: string }[];
};

export type EnrichDataset = {
  version: typeof DATASET_VERSION;
  /** When the dataset was built, from the clock of the machine that built it. */
  generated_at: string;
  tenant_handle: string;
  marketplace: "wb";
  source: {
    cards: number;
    prices: number;
    feedbacks: number;
    /** The newest `fetched_at` of the mirror rows that fed this file. */
    mirror_fetched_at: string | null;
  };
  products: DatasetProduct[];
  /** Products of the shop no rule could tie to a card, so the report is not a half-truth. */
  unmatched_products: { handle: string; title: string; sku: string | null }[];
  /** Cards of the cabinet nothing in the shop points at. */
  unmatched_cards: number;
};

/**
 * A dataset read off disk, or an error saying what is wrong with it.
 *
 * The shape is checked rather than trusted: an import runs against a live
 * catalog, and a file whose `products` is not an array must fail HERE with the
 * reason, not halfway through the first product.
 */
export const parseDataset = (raw: unknown): { ok: true; dataset: EnrichDataset } | { ok: false; error: string } => {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "файл не содержит объекта JSON" };
  }

  const candidate = raw as Partial<EnrichDataset>;

  if (candidate.version !== DATASET_VERSION) {
    return {
      ok: false,
      error: `версия датасета ${String(candidate.version)}, а этот скрипт понимает ${DATASET_VERSION}`,
    };
  }

  if (candidate.marketplace !== "wb") {
    return { ok: false, error: `маркетплейс "${String(candidate.marketplace)}" здесь не поддержан` };
  }

  if (!Array.isArray(candidate.products)) {
    return { ok: false, error: "в датасете нет списка products" };
  }

  for (const [index, product] of candidate.products.entries()) {
    if (!product || typeof product !== "object" || !product.product_handle) {
      return { ok: false, error: `products[${index}] без product_handle` };
    }
  }

  return { ok: true, dataset: candidate as EnrichDataset };
};

/** Row counts of a dataset, the numbers the report prints. */
export const datasetCounts = (dataset: EnrichDataset) => ({
  products: dataset.products.length,
  titles: dataset.products.filter((product) => Boolean(product.title)).length,
  prices: dataset.products.filter((product) => product.price !== null).length,
  characteristics: dataset.products.reduce(
    (total, product) => total + product.characteristics.length,
    0,
  ),
  reviews: dataset.products.reduce((total, product) => total + product.reviews.length, 0),
  images: dataset.products.reduce((total, product) => total + product.images.length, 0),
});
