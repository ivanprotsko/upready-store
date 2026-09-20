/**
 * The vocabulary of the store -> Wildberries DIFF (w21-wb-write-stocks-prices).
 *
 * Two classes of the write core (`modules/marketplace-write/types.ts`) have a
 * source of truth on OUR side: `stocks` and `prices`. This directory answers
 * one question about them and nothing else — "what would change on WB if the
 * shop's own numbers were pushed there" — and hands the answer to the panel,
 * to the `wb:push` script and to the tests.
 *
 * It reads two mirrors and writes none: `wb_stock` and `wb_price` are what WB
 * answered at `fetched_at` (w01), `product_marketplace_link` is the pairing
 * w07 recorded, and the shop's own numbers come from Medusa's inventory levels
 * and price sets. Nothing here calls Wildberries; the only path to a socket is
 * still the five gates of `marketplace-write/execute.ts`.
 *
 * Ivan's invariant of 2026-09-16 02:46 WITA holds unchanged: this task ends in
 * dry-run audit rows.
 */

/** The two classes this task covers. `feedback_answers` and `fbs_orders` are other tasks'. */
export const WB_DIFF_KINDS = ["stocks", "prices"] as const;

export type WbDiffKind = (typeof WB_DIFF_KINDS)[number];

/**
 * What the diff says about one row.
 *
 * `skipped` is never silent: the row carries `reason` and the totals count it
 * apart from `equal`, so "nothing to send" and "we could not tell" can never
 * read the same (rule 20a).
 */
export type WbDiffAction = "equal" | "update" | "skipped";

/** One product of the shop as the diff needs it. */
export type StoreVariant = {
  product_id: string;
  product_title: string;
  variant_id: string;
  variant_sku: string | null;
  /** Stocked quantity at the tenant's own stock location; `null` when the shop does not count it. */
  stock: number | null;
  /** The variant's own price in `currency`, in whole units, or `null`. */
  price: number | null;
  currency: string | null;
};

/** One row of `product_marketplace_link`, the pairing w07 recorded. */
export type LinkRow = {
  product_id: string;
  variant_id: string | null;
  /** `nmID` for Wildberries. */
  external_id: string;
};

/** One mirrored card (`wb_product`), for its barcodes. */
export type MirrorCard = {
  nm_id: string;
  vendor_code: string | null;
  /** `sizes[]`: `chrtID`, `techSize`, `skus[]` (the barcodes). */
  sizes: unknown;
};

/** One mirrored inventory line (`wb_stock`). */
export type MirrorStock = {
  warehouse_id: string;
  warehouse_name: string | null;
  /** The barcode WB calls `sku`. */
  sku: string;
  chrt_id: string | null;
  nm_id: string | null;
  amount: number;
};

/** One mirrored price row (`wb_price`). */
export type MirrorPrice = {
  nm_id: string;
  discount: number | null;
  currency_iso: string | null;
  /** `sizes[]`: `sizeID`, `price`, `discountedPrice`. */
  sizes: unknown;
};

/**
 * One stock location of the shop and the WB warehouse it was mapped to.
 *
 * The mapping lives in `stock_location.metadata.wb_warehouse_id` because a WB
 * seller warehouse is a property OF that location, and because a rule
 * recomputed at every run would send one warehouse's numbers today and
 * another's tomorrow with no error anywhere (the same reason w07 made its
 * pairing a row rather than a rule).
 */
export type WarehouseMapping = {
  stock_location_id: string;
  stock_location_name: string;
  wb_warehouse_id: string | null;
};

/** A WB seller warehouse the mirror has seen, offered to the owner as a mapping target. */
export type MirrorWarehouse = {
  warehouse_id: string;
  warehouse_name: string | null;
  /** How many mirrored inventory lines stand in it. Enough to tell a live warehouse from an empty one. */
  lines: number;
};

export type StockDiffRow = {
  kind: "stocks";
  product_id: string;
  product_title: string;
  variant_id: string;
  variant_sku: string | null;
  nm_id: string;
  /** The WB barcode this variant's stock belongs to, when exactly one card size carries it. */
  barcode: string | null;
  chrt_id: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  /** The shop's own stocked quantity. */
  store_value: number | null;
  /** `wb_stock.amount` for this barcode in this warehouse; `0` when the mirror holds no line. */
  wb_value: number | null;
  action: WbDiffAction;
  reason: string | null;
};

export type PriceDiffRow = {
  kind: "prices";
  product_id: string;
  product_title: string;
  variant_id: string;
  variant_sku: string | null;
  nm_id: string;
  currency: string | null;
  /** What a buyer pays in the shop. */
  store_value: number | null;
  /** What a buyer pays on WB today: `discountedPrice`, the same number w07 imports. */
  wb_value: number | null;
  /** WB's own pre-discount price, kept so the screen can show where the number comes from. */
  wb_price: number | null;
  /** WB's seller discount in percent, which this task never changes. */
  wb_discount: number | null;
  /** The `price` that, at WB's CURRENT discount, makes the WB buyer price equal the shop's. */
  proposed_price: number | null;
  action: WbDiffAction;
  reason: string | null;
};

export type WbDiffRow = StockDiffRow | PriceDiffRow;

export type WbDiffCounts = {
  total: number;
  equal: number;
  update: number;
  skipped: number;
};

export type WbDiffResult = {
  kind: WbDiffKind;
  tenant_id: string;
  rows: WbDiffRow[];
  counts: WbDiffCounts;
  /**
   * Stock locations of the shop with no WB warehouse behind them. Listed
   * rather than guessed: a location mapped by a rule would push one
   * warehouse's numbers into another's.
   */
  unmapped_locations: WarehouseMapping[];
  /** WB seller warehouses the mirror has seen, so the owner has something to map TO. */
  warehouses: MirrorWarehouse[];
  /** When the mirror rows this diff was taken against were read from WB. */
  mirror_fetched_at: string | null;
};
