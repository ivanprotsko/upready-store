/**
 * Marketplace card -> product of the shop, by the seller's own article
 * (w12-marketplace-core, spec 2.4).
 *
 * `mp_product.vendor_code` is `vendorCode` on WB and `offer_id` on Ozon: the
 * same thing under two names, which is why ONE matcher covers both. It is
 * matched against `product_variant.sku` inside the tenant.
 *
 * THREE OUTCOMES, ALL VISIBLE:
 *
 *   exactly one variant   -> a link, `matched_by = 'vendor_code'`
 *   no variant            -> the card lands in "не связано"
 *   more than one variant -> NO link; the card lands in "требует выбора"
 *
 * The third one is the point of this file. Taking the first of several
 * silently is a value substituted for an absence (rule 20a): the card would
 * look linked, the owner would never be asked, and the wrong product would
 * carry the marketplace's price forever. So an ambiguous card stays unlinked
 * and is COUNTED, and the count is on the screen.
 *
 * Zero links with a non-empty card list is an error of setup and says so:
 * «сопоставление не сработало: 0 из N», never an empty screen (spec 2.4).
 *
 * PURE. The rows come from the caller, the decisions come from here, and the
 * writing is the projector's job.
 */

/** One card, as much of it as matching needs. */
export type LinkableCard = {
  external_id: string;
  vendor_code: string | null;
};

/** One variant of the shop's catalog, as much of it as matching needs. */
export type LinkableVariant = {
  id: string;
  product_id: string;
  sku: string | null;
};

export type LinkOutcome =
  | { external_id: string; outcome: "linked"; product_id: string; variant_id: string }
  | { external_id: string; outcome: "not_found"; vendor_code: string | null }
  | { external_id: string; outcome: "ambiguous"; vendor_code: string; variant_ids: string[] };

export type LinkReport = {
  /** Cards considered. Every one of them appears in exactly one bucket below. */
  total: number;
  linked: LinkOutcome[];
  notFound: LinkOutcome[];
  ambiguous: LinkOutcome[];
  /** `linked.length + notFound.length + ambiguous.length`, kept so a caller can assert it. */
  accountedFor: number;
};

/**
 * Articles are compared case-insensitively and without surrounding spaces,
 * and NOT otherwise normalised. Stripping dashes or leading zeros would make
 * two different articles of the same shop match, and a wrong link is worse
 * than a missing one: a missing one is on the screen, a wrong one is not.
 */
const key = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed ? trimmed.toLowerCase() : null;
};

export const matchByVendorCode = (
  cards: readonly LinkableCard[],
  variants: readonly LinkableVariant[],
): LinkReport => {
  const bySku = new Map<string, LinkableVariant[]>();
  for (const variant of variants) {
    const sku = key(variant.sku);
    if (!sku) {
      continue;
    }
    const bucket = bySku.get(sku);
    if (bucket) {
      bucket.push(variant);
    } else {
      bySku.set(sku, [variant]);
    }
  }

  const linked: LinkOutcome[] = [];
  const notFound: LinkOutcome[] = [];
  const ambiguous: LinkOutcome[] = [];

  for (const card of cards) {
    const vendorCode = key(card.vendor_code);
    if (!vendorCode) {
      notFound.push({
        external_id: card.external_id,
        outcome: "not_found",
        vendor_code: card.vendor_code,
      });
      continue;
    }

    const candidates = bySku.get(vendorCode) ?? [];

    if (candidates.length === 1) {
      linked.push({
        external_id: card.external_id,
        outcome: "linked",
        product_id: candidates[0].product_id,
        variant_id: candidates[0].id,
      });
      continue;
    }

    if (candidates.length === 0) {
      notFound.push({
        external_id: card.external_id,
        outcome: "not_found",
        vendor_code: card.vendor_code,
      });
      continue;
    }

    /**
     * Several variants carry this article. Two different products of the shop
     * cannot both be this card, and this function does not know which one is
     * meant — so it says so instead of choosing.
     */
    ambiguous.push({
      external_id: card.external_id,
      outcome: "ambiguous",
      vendor_code: card.vendor_code as string,
      variant_ids: candidates.map((variant) => variant.id),
    });
  }

  return {
    total: cards.length,
    linked,
    notFound,
    ambiguous,
    accountedFor: linked.length + notFound.length + ambiguous.length,
  };
};

/**
 * The sentence the panel shows above the list. A zero here is an error of
 * setup and reads like one; it is never rendered as "нет данных".
 */
export const linkSummary = (report: LinkReport): string => {
  if (report.total === 0) {
    return "Карточек нет: импорт ещё не выполнялся.";
  }
  if (report.linked.length === 0) {
    return (
      `Сопоставление не сработало: 0 из ${report.total}. ` +
      `Не найдено: ${report.notFound.length}, требует выбора: ${report.ambiguous.length}.`
    );
  }
  return (
    `Связано ${report.linked.length} из ${report.total}. ` +
    `Не найдено: ${report.notFound.length}, требует выбора: ${report.ambiguous.length}.`
  );
};
