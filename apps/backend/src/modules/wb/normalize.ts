import type {
  MpOfferDraft,
  MpOrderDraft,
  MpProductDraft,
  MpQuestionDraft,
  MpReviewDraft,
} from "../marketplace/contract";
import { canonicalScheme } from "../marketplace/scheme";

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
 * WB's minor units -> the major-unit amount `mp_order.total` holds. `null`
 * stays `null`: an amount WB did not send is not zero roubles (rule 20a).
 */
const minorToMajor = (value: number | null): number | null =>
  value === null ? null : value / 100;

/**
 * Statistics orders. WB's own note on `GET /api/v1/supplier/orders`: "1 line
 * means 1 order and means 1 item. The srid field should be used to identify
 * the order." So one mirror row becomes one `mp_order` with exactly one line,
 * and `srid` is the identity.
 *
 * `scheme` stays `null`: this method does not say whether the order is FBS or
 * FBO, and guessing it from a warehouse name would be an invention (rule 17a).
 */
const statisticsOrder = (row: Row): MpOrderDraft => {
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
    status_detail: null,
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
};

/**
 * FBS assembly orders (`wb_fbs_order`, mirrored by w23-wb-write-fbs-orders).
 *
 * THE IDENTITY IS WB's `id`, held as `order_id` on the mirror: it is the
 * argument every FBS method of WB takes, and w23 measured it against the live
 * cabinet. `rid` travels along as `status_detail`'s neighbour on the card
 * rather than as the key, because nothing in the saved documentation says how
 * `rid` relates to the statistics method's `srid` and asserting an equality we
 * have not read would be an invention (rule 17a). `dedupeOrders` below joins
 * the two ON THE VALUES instead, which costs nothing when they never match.
 *
 * TWO STATUSES, BOTH KEPT. `supplierStatus` is what the seller did with the
 * order, `wbStatus` is where the parcel is; the owner needs both to tell «я
 * собрал» from «покупатель отказался». See `mp_order.status_detail`.
 *
 * ONE LINE PER ORDER: an FBS assembly order is one item on WB ("сборочное
 * задание" carries a single `nmId`/`chrtId`/`article`), so the line list has
 * exactly one entry, built from the fields of the order itself.
 */
const fbsOrder = (row: Row): MpOrderDraft => {
  const externalId = String(row.order_id);
  /**
   * WB answers the FBS methods in MINOR units: «Мумие банка» arrives as
   * `price: 81600` with `currencyCode: 643` and sells for 816 ₽ — measured
   * against the live cabinet by w23-wb-write-fbs-orders
   * (`artifacts/docs/w23-wb-write-fbs-orders/measurements.md`, section 2), not
   * taken from the documentation. `mp_order.total` is a MAJOR-unit amount,
   * because the statistics method's `finished_price` already is one and the
   * feed sums the two columns side by side, so this is where the hundred goes.
   *
   * `convertedPrice` is the amount in the SELLER's currency and is what the
   * desk should show; `price` is the buyer's currency, and for a foreign order
   * the two differ (BYN 946 against 26434 converted). Where WB sent neither,
   * the total stays `null` rather than becoming a zero the feed would sort and
   * sum as a free order (rule 20a).
   */
  const total = minorToMajor(num(row.converted_price) ?? num(row.price));

  return {
    tenant_id: String(row.tenant_id),
    marketplace: "wb" as const,
    source_row_id: String(row.id),
    synced_at: date(row.fetched_at) ?? new Date(),
    external_id: externalId,
    /**
     * WB's `deliveryType` is `fbs`, `dbs` or `wbgo`. The first two are the
     * spec's own names in WB's lower case; `wbgo` is WB's courier delivery and
     * has no name in the spec's set, so it travels as WB wrote it rather than
     * being mapped onto the nearest one (rule 17a). `canonicalScheme` is in the
     * core because both adapters need exactly this rule (rule 20).
     */
    scheme: canonicalScheme(row.delivery_type),
    status: text(row.supplier_status),
    status_detail: text(row.wb_status),
    /**
     * WB does not say WHEN it last changed the status of an assembly order.
     * `status_fetched_at` is when WE asked, and putting our clock in a column
     * the card labels as the marketplace's would be a value substituted for an
     * absence (rule 20a) — the observation time lives in
     * `mp_order_status_event.observed_at`, where it is labelled as ours.
     */
    status_changed_at: null,
    ordered_at: date(row.wb_created_at),
    /**
     * WB's assembly order carries no buyer region: the only place the address
     * appears is the `address` object, which w23 drops before writing the row
     * because a shop's database is not the place for a stranger's address.
     */
    buyer_region: null,
    /** WB names the warehouse by id here, not by name. `warehouse_id` is what there is. */
    warehouse_name: text(row.warehouse_id),
    total,
    /** WB's `currencyCode` on this method is ISO 4217 NUMERIC (643 = RUB). */
    currency: currencyOfCode(row.currency_code),
    is_cancelled:
      text(row.supplier_status) === "cancel" ||
      text(row.supplier_status) === "cancel_carrier" ||
      text(row.wb_status) === "canceled",
    lines: [
      {
        line_key: `${externalId}|${text(row.chrt_id) ?? text(row.nm_id) ?? ""}`,
        vendor_code: text(row.article),
        external_id: text(row.nm_id),
        qty: 1,
        price: total,
        discount: null,
      },
    ],
  };
};

/**
 * WB answers `currencyCode` as an ISO 4217 NUMERIC code on the FBS methods
 * (`643` is the rouble). The feed shows an alphabetic code next to a sum, so
 * the two codes the client's cabinet actually returns are translated and
 * anything else travels as the digits WB sent: a number we cannot name is
 * still WB's answer, and naming it anyway would be a guess (rule 17a).
 */
const CURRENCY_BY_NUMERIC: Record<string, string> = {
  "643": "RUB",
  "933": "BYN",
  "398": "KZT",
  "051": "AMD",
  "417": "KGS",
  "860": "UZS",
  "840": "USD",
  "978": "EUR",
};

/**
 * WB SENDS THE CODE WITHOUT ITS LEADING ZERO, and the map above is keyed the
 * way ISO 4217 prints it — three digits. Measured on the client's own orders
 * (w19-mp-analytics, stand `upready_store_w19`): 58 orders carry `51` and 6
 * carry `860`, so `51` fell past the lookup and reached the dashboard as the
 * bare digits «51» while `860` (Uzbek som) was simply missing from the table.
 * A currency column showing «51» is a raw value with no meaning on an owner's
 * screen (rule 18e), so the code is padded to three digits before the lookup
 * and the som is in the table. Anything still unknown travels as WB's own
 * digits: a number we cannot name is still WB's answer (rule 17a).
 */
function currencyOfCode(value: unknown): string | null {
  const raw = text(value);
  if (!raw) {
    return null;
  }
  const padded = /^\d{1,3}$/.test(raw) ? raw.padStart(3, "0") : raw;
  return CURRENCY_BY_NUMERIC[padded] ?? raw;
}

/**
 * The two WB order mirrors describe overlapping sets of orders, and the shop
 * that runs both imports must not see one parcel twice.
 *
 * The join is ON THE VALUES: a statistics row whose `srid` equals the `rid` of
 * an FBS row is the same order, and the FBS row wins because it carries the
 * scheme and both statuses. Nothing is assumed about the two identifiers — if
 * they never match, nothing is dropped and both rows stand, which is exactly
 * what happens on a stand where only one of the two imports has ever run.
 */
const dedupeOrders = (fbsRows: Row[], statisticsDrafts: MpOrderDraft[]): MpOrderDraft[] => {
  const ridsFromFbs = new Set(
    fbsRows.map((row) => text(row.rid)).filter((rid): rid is string => Boolean(rid)),
  );
  return statisticsDrafts.filter((draft) => !ridsFromFbs.has(draft.external_id));
};

/**
 * Orders of both WB mirrors, normalized into one list (w15-mp-orders-desk).
 *
 * The loader tags every row with the mirror it came from (`adapter.ts`), so
 * this function stays pure and the two shapes never have to be told apart by
 * sniffing their fields.
 */
export const orders = (rows: unknown[]): MpOrderDraft[] => {
  const tagged = rows as { source?: "statistics" | "fbs"; row?: Row }[];

  const statisticsRows: Row[] = [];
  const fbsRows: Row[] = [];

  for (const entry of tagged) {
    if (entry?.source === "fbs" && entry.row) {
      fbsRows.push(entry.row);
    } else if (entry?.source === "statistics" && entry.row) {
      statisticsRows.push(entry.row);
    }
  }

  const fbsDrafts = fbsRows.map(fbsOrder);
  const statisticsDrafts = dedupeOrders(fbsRows, statisticsRows.map(statisticsOrder));

  return [...fbsDrafts, ...statisticsDrafts];
};

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
 * Questions. Mirrored into `wb_question` by w03-wb-sales-questions-mirror; the
 * seller's own article comes with the row (`supplier_article`), so unlike
 * feedbacks this one needs no join.
 *
 * `is_answered` is WB's own flag and is not derived from the answer text being
 * non-empty: a question answered with an empty string is still answered, and
 * guessing from the text would be our opinion rather than WB's fact.
 */
export const questions = (rows: unknown[]): MpQuestionDraft[] =>
  (rows as Row[]).map((row) => ({
    tenant_id: String(row.tenant_id),
    marketplace: "wb" as const,
    source_row_id: String(row.id),
    synced_at: date(row.fetched_at) ?? new Date(),
    external_id: String(row.question_id),
    vendor_code: text(row.supplier_article),
    question_text: text(row.text),
    author: null,
    created_at: date(row.created_date),
    is_answered: Boolean(row.is_answered),
  }));
