import type { MatchKind } from "../modules/marketplace-link/models/product-marketplace-link";

/**
 * Tying the shop's own products to the listings of its Wildberries cabinet
 * (w07-tenant-catalog-enrich).
 *
 * The task text said the shop's SKUs are the WB `vendorCode`. The catalog says
 * otherwise, and the catalog wins: every SKU of the migrated Cherkashina store
 * is `<nmID>-<HANDLE>` («94372564-CHERKASHINO» is the card «Мумие алтайское
 * очищенное натуральное 100%», nmID 94372564), while the same card's
 * `vendorCode` is «Мумие банка» and matches nothing. Measured 2026-09-16 over
 * 38 products against 423 mirrored cards: 20 match by item number, 0 by vendor
 * code. Both rules are therefore kept, in the order below, and every link
 * records WHICH one made it.
 *
 * NOTHING is matched by title. A title match would tie «Зубная паста тайская с
 * гвоздикой» to «Зубная паста тайская от кариеса отбеливающая» and the wrong
 * price, the wrong characteristics and a stranger's reviews would land on the
 * product page with no error anywhere. A product the rules cannot tie stays
 * unmatched and goes into the report, which is the honest outcome (rule 20a).
 */

/** One product of the shop, as the matcher needs it. */
export type CatalogProduct = {
  id: string;
  title: string;
  handle: string;
  /** Variants in the order the catalog holds them; the first SKU that matches wins. */
  variants: { id: string; sku: string | null }[];
  metadata: Record<string, unknown> | null;
};

/** One mirrored listing, as the matcher needs it. */
export type MirrorCard = {
  nm_id: string;
  vendor_code: string | null;
  title: string | null;
};

export type CatalogMatch = {
  product_id: string;
  product_title: string;
  product_handle: string;
  variant_id: string | null;
  variant_sku: string | null;
  nm_id: string;
  vendor_code: string | null;
  card_title: string | null;
  matched_by: MatchKind;
};

export type MatchReport = {
  matched: CatalogMatch[];
  /** Products of the shop no rule could tie to a card. */
  unmatched_products: { id: string; handle: string; title: string; sku: string | null }[];
  /** Cards of the cabinet no product of the shop points at. */
  unmatched_cards: { nm_id: string; vendor_code: string | null; title: string | null }[];
};

/**
 * WB's own item number inside a SKU.
 *
 * Anchored at the START and at least six digits: a SKU is `<nmID>-CHERKASHINO`
 * and the number is its head. An unanchored search would read «PL-28» as 28
 * and «COURSE-BOX-…» as nothing, and a six-digit floor keeps a short internal
 * code («PL-09») from ever looking like an item number.
 */
export const nmIdFromSku = (sku: string | null | undefined): string | null => {
  const match = /^([0-9]{6,})(?:[^0-9]|$)/.exec(String(sku ?? "").trim());
  return match ? match[1] : null;
};

/** The comparable form of a seller's article: case and edge whitespace do not identify it. */
export const normaliseVendorCode = (value: string | null | undefined): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

/** An item number a product carries in its own `metadata`, written by a migration or an earlier run. */
export const nmIdFromMetadata = (metadata: Record<string, unknown> | null): string | null => {
  for (const key of ["wb_nm_id", "nm_id", "nmID"]) {
    const value = metadata?.[key];
    if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(Math.trunc(value));
    }
  }
  return null;
};

/**
 * The links between one shop's catalog and one cabinet's cards.
 *
 * A card may legitimately carry several of the shop's products (two variants
 * of one listing sold as two products), so a card is never consumed; a PRODUCT
 * is matched at most once, by the first rule that answers.
 */
export const matchCatalog = (
  products: CatalogProduct[],
  cards: MirrorCard[],
): MatchReport => {
  const byNmId = new Map(cards.map((card) => [card.nm_id, card]));
  const byVendorCode = new Map<string, MirrorCard>();
  for (const card of cards) {
    const key = normaliseVendorCode(card.vendor_code);
    // The FIRST card of a duplicated article wins, so the result does not
    // depend on the order WB happened to paginate in.
    if (key && !byVendorCode.has(key)) {
      byVendorCode.set(key, card);
    }
  }

  const report: MatchReport = { matched: [], unmatched_products: [], unmatched_cards: [] };
  const usedCards = new Set<string>();

  for (const product of products) {
    let hit: { card: MirrorCard; variantId: string | null; sku: string | null; by: MatchKind } | null =
      null;

    for (const variant of product.variants) {
      const sku = variant.sku ?? null;
      if (!sku) {
        continue;
      }

      const vendorCard = byVendorCode.get(normaliseVendorCode(sku));
      if (vendorCard) {
        hit = { card: vendorCard, variantId: variant.id, sku, by: "vendor_code" };
        break;
      }

      const nmId = nmIdFromSku(sku);
      const nmCard = nmId ? byNmId.get(nmId) : undefined;
      if (nmCard) {
        hit = { card: nmCard, variantId: variant.id, sku, by: "sku_nm_id" };
        break;
      }
    }

    if (!hit) {
      const fromMetadata = nmIdFromMetadata(product.metadata);
      const card = fromMetadata ? byNmId.get(fromMetadata) : undefined;
      if (card) {
        hit = { card, variantId: null, sku: null, by: "metadata_nm_id" };
      }
    }

    if (!hit) {
      report.unmatched_products.push({
        id: product.id,
        handle: product.handle,
        title: product.title,
        sku: product.variants.find((variant) => variant.sku)?.sku ?? null,
      });
      continue;
    }

    usedCards.add(hit.card.nm_id);
    report.matched.push({
      product_id: product.id,
      product_title: product.title,
      product_handle: product.handle,
      variant_id: hit.variantId,
      variant_sku: hit.sku,
      nm_id: hit.card.nm_id,
      vendor_code: hit.card.vendor_code,
      card_title: hit.card.title,
      matched_by: hit.by,
    });
  }

  report.unmatched_cards = cards
    .filter((card) => !usedCards.has(card.nm_id))
    .map((card) => ({ nm_id: card.nm_id, vendor_code: card.vendor_code, title: card.title }));

  return report;
};
