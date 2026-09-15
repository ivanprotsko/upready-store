import type {
  MpOfferDraft,
  MpOrderDraft,
  MpOrderLineDraft,
  MpProductDraft,
  MpQuestionDraft,
  MpReviewDraft,
} from "../marketplace/contract";

/**
 * Ozon mirror rows -> `mp_*` drafts (w12-marketplace-core, spec 2.3).
 *
 * PURE, like the Wildberries half: rows in, rows out. Where a fact is not in
 * the row it stays `null` rather than being guessed — Ozon's product mirror
 * carries a `category_id` and no category NAME, and inventing one would be an
 * invention dressed as data (rule 17a).
 */

type Row = Record<string, unknown>;

const text = (value: unknown): string | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return String(value);
};

const num = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const date = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const asArray = (value: unknown): Row[] =>
  Array.isArray(value) ? (value.filter((item) => item && typeof item === "object") as Row[]) : [];

const offerKey = (parts: (string | null)[]): string => parts.map((part) => part ?? "").join("|");

/**
 * Products. `product_id` is Ozon's identity of the card and `offer_id` is the
 * seller's own article, which is the same role `vendorCode` plays on WB — that
 * is what makes one `link.ts` work for both (spec 2.0, reason 2).
 */
export const products = (rows: unknown[]): MpProductDraft[] =>
  (rows as Row[]).map((row) => ({
    tenant_id: String(row.tenant_id),
    marketplace: "ozon" as const,
    source_row_id: String(row.id),
    synced_at: date(row.fetched_at) ?? new Date(),
    external_id: String(row.product_id),
    vendor_code: text(row.offer_id),
    sku_external: text(row.sku),
    title: text(row.name),
    /** Ozon's product mirror carries no brand column; the attribute list may. */
    brand: null,
    /** `category_id` is a number, not a name. A name we do not have stays absent. */
    category_name: null,
    photos: row.images ?? null,
    attributes: {
      category_id: text(row.category_id),
      type_id: text(row.type_id),
      barcodes: row.barcodes ?? null,
      statuses: row.statuses ?? null,
      archived: Boolean(row.archived),
      attributes: row.attributes ?? null,
      primary_image: text(row.primary_image),
    },
    mp_updated_at: date(row.ozon_updated_at),
  }));

/** One tagged mirror row on the way into `offers`, like the WB adapter's. */
export type OzonOfferRow =
  | { source: "price"; row: Row }
  | { source: "stock"; row: Row };

/**
 * Prices and stocks -> one line per (product, sku, stock type).
 *
 * Ozon reports stock per (`stock_type`, `shipment_type`) — the FBO/FBS scheme
 * — and not per warehouse at this method. Calling that a warehouse would
 * mislabel it, so it goes into `storage_type` and `warehouse_id` stays `null`
 * (spec 2.3 puts `warehouse_id` on `mp_offer`; for Ozon this method simply
 * does not carry one, and an honest absence beats a plausible value).
 */
export const offers = (rows: unknown[]): MpOfferDraft[] => {
  const tagged = rows as OzonOfferRow[];

  type PriceFacts = {
    tenant_id: string;
    source_row_id: string;
    synced_at: Date;
    vendor_code: string | null;
    currency: string | null;
    price: number | null;
    discount_price: number | null;
  };

  const priced = new Map<string, PriceFacts>();

  for (const entry of tagged) {
    if (entry.source !== "price") {
      continue;
    }
    const row = entry.row;
    priced.set(String(row.product_id), {
      tenant_id: String(row.tenant_id),
      source_row_id: String(row.id),
      synced_at: date(row.fetched_at) ?? new Date(),
      vendor_code: text(row.offer_id),
      currency: text(row.currency_code),
      /** `old_price` is the price before the discount; `price` is what the buyer pays. */
      price: num(row.old_price) ?? num(row.price),
      discount_price: num(row.price),
    });
  }

  const drafts: MpOfferDraft[] = [];
  const pricesUsed = new Set<string>();

  for (const entry of tagged) {
    if (entry.source !== "stock") {
      continue;
    }
    const row = entry.row;
    const productId = text(row.product_id);
    const storage = [text(row.stock_type), text(row.shipment_type)]
      .filter((part) => part !== null)
      .join("/");
    const facts = productId ? priced.get(productId) : undefined;
    if (productId && facts) {
      pricesUsed.add(productId);
    }

    drafts.push({
      tenant_id: String(row.tenant_id),
      marketplace: "ozon",
      source_row_id: String(row.id),
      synced_at: date(row.fetched_at) ?? new Date(),
      offer_key: offerKey([productId, text(row.sku), storage || null]),
      external_id: productId ?? "",
      vendor_code: text(row.offer_id) ?? facts?.vendor_code ?? null,
      /** Ozon has no size dimension on a card. */
      size_external: null,
      sku_external: text(row.sku),
      storage_type: storage || null,
      warehouse_id: null,
      warehouse_name: null,
      price: facts?.price ?? null,
      discount_price: facts?.discount_price ?? null,
      currency: facts?.currency ?? null,
      stock: num(row.present),
      reserved: num(row.reserved),
      measured_at: date(row.fetched_at),
    });
  }

  for (const [productId, facts] of priced) {
    if (pricesUsed.has(productId)) {
      continue;
    }
    drafts.push({
      tenant_id: facts.tenant_id,
      marketplace: "ozon",
      source_row_id: facts.source_row_id,
      synced_at: facts.synced_at,
      offer_key: offerKey([productId, null, null]),
      external_id: productId,
      vendor_code: facts.vendor_code,
      size_external: null,
      sku_external: null,
      storage_type: null,
      warehouse_id: null,
      warehouse_name: null,
      price: facts.price,
      discount_price: facts.discount_price,
      currency: facts.currency,
      /** Ozon reported no stock line for this product. Not a zero (rule 20a). */
      stock: null,
      reserved: null,
      measured_at: facts.synced_at,
    });
  }

  return drafts;
};

/**
 * Postings. On Ozon the unit of an order is the POSTING (`posting_number`),
 * which is what the owner tracks and what the parity matrix calls an order
 * line in the single feed.
 */
export const orders = (rows: unknown[]): MpOrderDraft[] =>
  (rows as Row[]).map((row) => {
    const externalId = String(row.posting_number);
    const financial = (row.financial_data ?? {}) as Row;
    const analytics = (row.analytics_data ?? {}) as Row;
    const products = asArray(row.products);

    const lines: MpOrderLineDraft[] = products.map((product, index) => ({
      line_key: `${externalId}|${text(product.sku) ?? text(product.offer_id) ?? String(index)}`,
      vendor_code: text(product.offer_id),
      external_id: text(product.sku),
      qty: num(product.quantity),
      price: num(product.price),
      discount: null,
    }));

    /**
     * The posting's total is the sum of what its lines cost, because Ozon puts
     * the money on the line and not on the posting. A posting with no lines
     * gets `null`, not `0`: nothing was reported, and a zero here would sort
     * and display as a real free order (rule 20a).
     */
    const total = lines.length
      ? lines.reduce((sum, line) => sum + (line.price ?? 0) * (line.qty ?? 1), 0)
      : null;

    return {
      tenant_id: String(row.tenant_id),
      marketplace: "ozon" as const,
      source_row_id: String(row.id),
      synced_at: date(row.fetched_at) ?? new Date(),
      external_id: externalId,
      scheme: text(row.scheme),
      status: text(row.status),
      status_changed_at: date(row.in_process_at),
      ordered_at: date(row.posting_created_at),
      buyer_region: text(analytics.region) ?? text(analytics.city),
      warehouse_name: text(analytics.warehouse_name),
      total,
      currency: text(financial.currency_code) ?? text((financial.posting_services as Row)?.currency_code),
      is_cancelled: text(row.status) === "cancelled" || Boolean(row.cancel_reason_id),
      lines,
    };
  });

/**
 * Reviews. `vendor_code` is not on the review — Ozon names the item by `sku` —
 * so the loader attaches it from the product mirror before calling this
 * (`adapter.ts`), which keeps the join where the I/O is.
 */
export const reviews = (rows: unknown[]): MpReviewDraft[] =>
  (rows as Row[]).map((row) => ({
    tenant_id: String(row.tenant_id),
    marketplace: "ozon" as const,
    source_row_id: String(row.id),
    synced_at: date(row.fetched_at) ?? new Date(),
    external_id: String(row.review_id),
    vendor_code: text(row.vendor_code),
    rating: num(row.rating),
    text: text(row.text),
    /** Ozon's review has one body; it does not split pros and cons the way WB does. */
    pros: null,
    cons: null,
    /** Ozon's review list carries no author name. */
    author: null,
    created_at: date(row.published_at),
    is_answered: (num(row.comments_amount) ?? 0) > 0,
  }));

/** Questions. Same join as reviews, same reason. */
export const questions = (rows: unknown[]): MpQuestionDraft[] =>
  (rows as Row[]).map((row) => ({
    tenant_id: String(row.tenant_id),
    marketplace: "ozon" as const,
    source_row_id: String(row.id),
    synced_at: date(row.fetched_at) ?? new Date(),
    external_id: String(row.question_id),
    vendor_code: text(row.vendor_code),
    question_text: text(row.text),
    author: text(row.author_name),
    created_at: date(row.published_at),
    is_answered: (num(row.answers_count) ?? 0) > 0,
  }));
