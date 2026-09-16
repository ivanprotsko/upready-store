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

/** One `mp_link` row as it stands today, as much of it as planning needs. */
export type StoredLinkRow = {
  id: string;
  external_id: string;
  matched_by: string;
  product_id: string;
  variant_id: string | null;
};

/** What one auto-link run should write (w14-mp-catalog-link). */
export type LinkPlan<T> = {
  create: T[];
  update: (T & { id: string })[];
  /** Ids of `matched_by = 'vendor_code'` rows the matcher no longer produces. */
  remove: string[];
  /** Ids left untouched because a person chose them. */
  kept_manual: string[];
};

/**
 * The write plan of an auto-link, decided here rather than at the two call
 * sites that need it (the projector and the panel's «Связать всё по артикулу»).
 *
 * TWO RULES, AND BOTH ARE ABOUT NOT LOSING A PERSON'S WORK.
 *
 * A row with `matched_by = 'manual'` is never rewritten and never removed. The
 * owner opened the card, looked at two products and chose one; an import an
 * hour later must not quietly put the other one back. This is the case the
 * projector got wrong before this task: its upsert keyed on the card alone, so
 * a manual choice on a card the matcher also resolves was overwritten on the
 * next projection with no trace.
 *
 * A row with `matched_by = 'vendor_code'` that the matcher no longer produces
 * IS removed. The article moved to another product, or a second variant took
 * the same SKU and the card became ambiguous — either way the stored link is
 * now a claim nothing supports, and leaving it would show the card as linked
 * to a product it no longer matches (rule 20a: a stale value of the right
 * shape is worse than an absence).
 */
export const planLinkWrites = <T extends { external_id: string }>(
  report: LinkReport,
  stored: readonly StoredLinkRow[],
  draftOf: (outcome: Extract<LinkOutcome, { outcome: "linked" }>) => T,
): LinkPlan<T> => {
  const byExternalId = new Map(stored.map((row) => [row.external_id, row]));
  const produced = new Set(report.linked.map((outcome) => outcome.external_id));

  const create: T[] = [];
  const update: (T & { id: string })[] = [];
  const kept_manual: string[] = [];

  for (const outcome of report.linked as Extract<LinkOutcome, { outcome: "linked" }>[]) {
    const existing = byExternalId.get(outcome.external_id);

    if (!existing) {
      create.push(draftOf(outcome));
      continue;
    }

    if (existing.matched_by === "manual") {
      kept_manual.push(existing.id);
      continue;
    }

    update.push({ ...draftOf(outcome), id: existing.id });
  }

  const remove = stored
    .filter((row) => row.matched_by !== "manual" && !produced.has(row.external_id))
    .map((row) => row.id);

  return { create, update, remove, kept_manual };
};
