import type {
  MpOfferDraft,
  MpOrderDraft,
  MpProductDraft,
  MpQuestionDraft,
  MpReviewDraft,
} from "../marketplace/contract";

/**
 * Wildberries mirror rows -> `mp_*` drafts (w12-marketplace-core, spec 2.3).
 *
 * PURE. No I/O, no container, no database: every function here takes rows and
 * returns rows, which is what makes the projector re-runnable and what makes
 * these testable without a stand.
 *
 * The raw `wb_*` mirrors are NOT replaced by this. They stay the source of
 * truth for what WB actually answered, so a normalisation found wrong later is
 * recomputed from them without spending a request (spec 2.1).
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

/** `${external_id}|${size}|${warehouse}` — see `MpOfferDraft.offer_key`. */
const offerKey = (parts: (string | null)[]): string => parts.map((part) => part ?? "").join("|");

/**
 * Cards. `nmID` is WB's item number and the identity of the card; `vendorCode`
 * is the seller's own article, which is the column the shop catalog is matched
 * on (`link.ts`).
 *
 * `category_name` comes from `subject_name`: WB calls the category of an item
 * its "subject", and the mirror keeps both the id and the name.
 */
export const products = (rows: unknown[]): MpProductDraft[] =>
  (rows as Row[]).map((row) => ({
    tenant_id: String(row.tenant_id),
    marketplace: "wb" as const,
    source_row_id: String(row.id),
    synced_at: date(row.fetched_at) ?? new Date(),
    external_id: String(row.nm_id),
    vendor_code: text(row.vendor_code),
    /** WB has no second card-level identifier; Ozon's `sku` fills this for Ozon. */
    sku_external: null,
    title: text(row.title),
    brand: text(row.brand),
    category_name: text(row.subject_name),
    photos: row.photos ?? null,
    /**
     * What WB carries about the item beyond the named columns. `sizes` is kept
     * whole because `chrtID` is the join key of the price and stock rows, and
     * the panel shows the size table from it.
     */
    attributes: {
      imt_id: text(row.imt_id),
      subject_id: text(row.subject_id),
      dimensions: row.dimensions ?? null,
      sizes: row.sizes ?? null,
    },
    mp_updated_at: date(row.wb_updated_at),
  }));

/**
 * One tagged mirror row on the way into `offers`. WB keeps price and stock in
 * two tables with two different grains, and the merge happens HERE rather than
 * in SQL so it stays pure and testable.
 */
export type WbOfferRow =
  | { source: "price"; row: Row }
  | { source: "stock"; row: Row };

/**
 * Prices and stocks -> one line per (item, size, warehouse).
 *
 * WHY THEY MERGE AT ALL. A price lives on the size (`sizeID`) and a stock on
 * the pair (warehouse, size) (`chrtID`). That those two identifiers are the
 * same number is not an assumption: measured on the stand database
 * `upready_store_w01` on 2026-09-16, all 423 card sizes match a price
 * `sizeID`, and all 11 605 stock rows carry a `chrt_id` that is a `chrtID` of
 * its own card.
 *
 * A size that is priced but stocked nowhere still gets a line, with
 * `warehouse_id = null` and `stock = null`. `null` and not `0`: WB did not say
 * the stock is zero, it said nothing, and writing a zero there would be a
 * value substituted for an absence (rule 20a).
 */
export const offers = (rows: unknown[]): MpOfferDraft[] => {
  const tagged = rows as WbOfferRow[];

  type PriceFacts = {
    tenant_id: string;
    source_row_id: string;
    synced_at: Date;
    vendor_code: string | null;
    currency: string | null;
    price: number | null;
    discount_price: number | null;
  };

  /** (nm_id, sizeID) -> what the price table says about it. */
  const priced = new Map<string, PriceFacts>();

  for (const entry of tagged) {
    if (entry.source !== "price") {
      continue;
    }
    const row = entry.row;
    const nmId = String(row.nm_id);
    for (const size of asArray(row.sizes)) {
      priced.set(`${nmId}|${text(size.sizeID) ?? ""}`, {
        tenant_id: String(row.tenant_id),
        source_row_id: String(row.id),
        synced_at: date(row.fetched_at) ?? new Date(),
        vendor_code: text(row.vendor_code),
        currency: text(row.currency_iso),
        price: num(size.price),
        discount_price: num(size.discountedPrice),
      });
    }
  }

  const drafts: MpOfferDraft[] = [];
  const pricesUsed = new Set<string>();

  for (const entry of tagged) {
    if (entry.source !== "stock") {
      continue;
    }
    const row = entry.row;
    const externalId = text(row.nm_id);
    const size = text(row.chrt_id);
    const warehouse = text(row.warehouse_id);
    const facts = externalId ? priced.get(`${externalId}|${size ?? ""}`) : undefined;
    if (externalId && facts) {
      pricesUsed.add(`${externalId}|${size ?? ""}`);
    }

    drafts.push({
      tenant_id: String(row.tenant_id),
      marketplace: "wb",
      source_row_id: String(row.id),
      synced_at: date(row.fetched_at) ?? new Date(),
      offer_key: offerKey([externalId, size, warehouse]),
      external_id: externalId ?? "",
      vendor_code: facts?.vendor_code ?? null,
      size_external: size,
      sku_external: text(row.sku),
      storage_type: null,
      warehouse_id: warehouse,
      warehouse_name: text(row.warehouse_name),
      price: facts?.price ?? null,
      discount_price: facts?.discount_price ?? null,
      currency: facts?.currency ?? null,
      stock: num(row.amount),
      reserved: null,
      measured_at: date(row.fetched_at),
    });
  }

  for (const [key, facts] of priced) {
    if (pricesUsed.has(key)) {
      continue;
    }
    const [externalId, size] = key.split("|");
    drafts.push({
      tenant_id: facts.tenant_id,
      marketplace: "wb",
      source_row_id: facts.source_row_id,
      synced_at: facts.synced_at,
      offer_key: offerKey([externalId, size || null, null]),
      external_id: externalId,
      vendor_code: facts.vendor_code,
      size_external: size || null,
      sku_external: null,
      storage_type: null,
      warehouse_id: null,
      warehouse_name: null,
      price: facts.price,
      discount_price: facts.discount_price,
      currency: facts.currency,
      /** WB reported no stock line for this size. Not a zero (rule 20a). */
      stock: null,
      reserved: null,
      measured_at: facts.synced_at,
    });
  }

  return drafts;
};

/**
 * Statistics orders. WB's own note on `GET /api/v1/supplier/orders`: "1 line
 * means 1 order and means 1 item. The srid field should be used to identify
 * the order." So one mirror row becomes one `mp_order` with exactly one line,
 * and `srid` is the identity.
 *
 * `scheme` stays `null`: this method does not say whether the order is FBS or
 * FBO, and guessing it from a warehouse name would be an invention (rule 17a).
 */
export const orders = (rows: unknown[]): MpOrderDraft[] =>
  (rows as Row[]).map((row) => {
    const raw = (row.raw ?? {}) as Row;
    const externalId = String(row.srid);
    const total = num(row.finished_price);

    return {
      tenant_id: String(row.tenant_id),
      marketplace: "wb" as const,
      source_row_id: String(row.id),
      synced_at: date(row.fetched_at) ?? new Date(),
      external_id: externalId,
      scheme: null,
      /** WB statistics has no status field on this method; cancellation is its own flag. */
      status: row.is_cancel ? "cancelled" : null,
      status_changed_at: date(row.last_change_date),
      ordered_at: date(row.order_date),
      buyer_region: text(row.region_name),
      warehouse_name: text(row.warehouse_name),
      total,
      currency: text(raw.currencyCode),
      is_cancelled: Boolean(row.is_cancel),
      lines: [
        {
          line_key: `${externalId}|${text(row.nm_id) ?? ""}`,
          vendor_code: text(row.supplier_article),
          external_id: text(row.nm_id),
          qty: 1,
          price: total,
          discount: num(row.discount_percent),
        },
      ],
    };
  });

/**
 * Feedbacks. `vendor_code` is not on the feedback itself, so the loader
 * attaches it from the card mirror before calling this (`adapter.ts`), which
 * keeps the join where the I/O is and this function pure.
 */
export const reviews = (rows: unknown[]): MpReviewDraft[] =>
  (rows as Row[]).map((row) => ({
    tenant_id: String(row.tenant_id),
    marketplace: "wb" as const,
    source_row_id: String(row.id),
    synced_at: date(row.fetched_at) ?? new Date(),
    external_id: String(row.feedback_id),
    vendor_code: text(row.vendor_code),
    rating: num(row.product_valuation),
    text: text(row.text),
    pros: text(row.pros),
    cons: text(row.cons),
    author: text(row.user_name),
    created_at: date(row.created_date),
    is_answered: Boolean(row.is_answered),
  }));

/**
 * Questions. WB serves them from `PATCH /api/v1/questions` and a GET on the
 * same path, and neither is registered in `endpoints.ts`, so this repository
 * mirrors no WB questions today. An empty array is the honest answer; the
 * panel shows the kind as "не импортируется" rather than as "0 вопросов"
 * (rule 20a).
 */
export const questions = (_rows: unknown[]): MpQuestionDraft[] => [];
