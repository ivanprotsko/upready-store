import type {
  LinkRow,
  MirrorCard,
  MirrorPrice,
  MirrorStock,
  MirrorWarehouse,
  PriceDiffRow,
  StockDiffRow,
  StoreVariant,
  WarehouseMapping,
  WbDiffCounts,
  WbDiffRow,
} from "./types";

/**
 * The diff itself, as pure functions over rows (w21-wb-write-stocks-prices).
 *
 * Nothing here touches a container, a database or a socket, which is what lets
 * the fixtures in `__tests__/diff.unit.spec.ts` state the rules as tests rather
 * than as prose.
 */

/** The barcodes of one mirrored card, in the order WB lists its sizes. */
export const cardBarcodes = (
  card: MirrorCard | null | undefined,
): { sku: string; chrt_id: string | null }[] => {
  const sizes = Array.isArray(card?.sizes) ? (card?.sizes as Record<string, unknown>[]) : [];
  const out: { sku: string; chrt_id: string | null }[] = [];

  for (const size of sizes) {
    const chrtId = size?.chrtID ?? size?.chrt_id ?? null;
    const skus = Array.isArray(size?.skus) ? (size?.skus as unknown[]) : [];
    for (const sku of skus) {
      const value = String(sku ?? "").trim();
      if (value) {
        out.push({ sku: value, chrt_id: chrtId === null ? null : String(chrtId) });
      }
    }
  }

  return out;
};

/**
 * What a buyer pays on Wildberries today.
 *
 * The same rule w07 imports by (`catalog-enrich/wb-source.ts`): `price` is the
 * seller's own number before the discount and no WB shopper ever sees it,
 * `discountedPrice` is what the card shows, and a card priced per size gives
 * several of them, so the LOWEST is taken because that is the one the listing
 * shows as "from".
 */
export const wbBuyerPrice = (row: MirrorPrice | null | undefined): number | null => {
  const sizes = Array.isArray(row?.sizes) ? (row?.sizes as Record<string, unknown>[]) : [];
  const amounts = sizes
    .map((size) => Number(size?.discountedPrice))
    .filter((amount) => Number.isFinite(amount) && amount > 0);
  return amounts.length ? Math.min(...amounts) : null;
};

/** WB's own pre-discount price for the size whose buyer price is the lowest. */
export const wbListPrice = (row: MirrorPrice | null | undefined): number | null => {
  const sizes = Array.isArray(row?.sizes) ? (row?.sizes as Record<string, unknown>[]) : [];
  let best: { discounted: number; price: number } | null = null;

  for (const size of sizes) {
    const discounted = Number(size?.discountedPrice);
    const price = Number(size?.price);
    if (!Number.isFinite(discounted) || discounted <= 0 || !Number.isFinite(price)) {
      continue;
    }
    if (!best || discounted < best.discounted) {
      best = { discounted, price };
    }
  }

  return best ? best.price : null;
};

/**
 * The `price` that makes WB's buyer price equal the shop's price at WB's
 * CURRENT discount.
 *
 * WB's arithmetic, measured rather than remembered: over the 463 mirrored
 * price rows of the Cherkashina cabinet, `discountedPrice` equals `price * (1
 * - discount/100)` in 463 of 463 cases, exactly and with no rounding
 * (`wb_price`, stand `upready_store_w21`, 2026-09-16). So the inverse is
 * `price = store / (1 - discount/100)`.
 *
 * The discount is NOT touched. Setting it to zero would make the shop's price
 * the WB price and quietly delete the crossed-out number the owner's listings
 * are built around, which is a decision about her shop and not about our data.
 *
 * `null` where the buyer price is unreachable: a discount of 100 percent or
 * more divides by zero, and a price that is not a whole number of roubles is a
 * value WB would round somewhere we have not measured, so the row is skipped
 * and says so rather than drifting by a rouble in silence (rule 20a).
 */
export const proposedWbPrice = (
  storePrice: number,
  discount: number | null,
): { price: number | null; reason: string | null } => {
  const percent = discount ?? 0;

  if (!Number.isFinite(storePrice) || storePrice <= 0) {
    return { price: null, reason: "store_price_absent" };
  }
  if (percent < 0 || percent >= 100) {
    return { price: null, reason: "wb_discount_out_of_range" };
  }

  const exact = storePrice / (1 - percent / 100);
  if (!Number.isInteger(exact)) {
    return { price: null, reason: "price_not_reachable_at_current_discount" };
  }

  return { price: exact, reason: null };
};

const countRows = (rows: WbDiffRow[]): WbDiffCounts => ({
  total: rows.length,
  equal: rows.filter((row) => row.action === "equal").length,
  update: rows.filter((row) => row.action === "update").length,
  skipped: rows.filter((row) => row.action === "skipped").length,
});

export type StockDiffInput = {
  variants: StoreVariant[];
  links: LinkRow[];
  cards: MirrorCard[];
  stocks: MirrorStock[];
  /** The shop's own locations with the WB warehouse each was mapped to. */
  mappings: WarehouseMapping[];
};

/**
 * Store stock to WB stock, one row per (variant, mapped warehouse).
 *
 * The rules, and what each of them refuses to guess:
 *
 *  - a product with no `product_marketplace_link` row is not in the diff at
 *    all: it has no card to compare against;
 *  - a card whose sizes carry several barcodes is SKIPPED, because a variant
 *    of ours names none of them and picking one would put the shop's quantity
 *    on a stranger's size;
 *  - a variant the shop does not count (`manage_inventory: false`, so
 *    `stock: null`) is SKIPPED: zero would say "none left", which is the
 *    opposite of "not counted";
 *  - a location with no WB warehouse mapped to it produces no rows and is
 *    listed in `unmapped_locations`.
 *
 * The WB side of a barcode the mirror has no line for reads `0`: the mirror is
 * the answer to "everything in this warehouse" (w01 reads every seller
 * warehouse whole), so an absent line IS "none there".
 */
export const diffStocks = (
  input: StockDiffInput,
): { rows: StockDiffRow[]; counts: WbDiffCounts; warehouses: MirrorWarehouse[] } => {
  const mapped = input.mappings.filter((row) => Boolean(row.wb_warehouse_id));
  const cardByNm = new Map(input.cards.map((card) => [card.nm_id, card]));
  const linkByProduct = new Map(input.links.map((link) => [link.product_id, link]));

  const amountByKey = new Map<string, MirrorStock>();
  const warehouseLines = new Map<string, MirrorWarehouse>();

  for (const stock of input.stocks) {
    amountByKey.set(`${stock.warehouse_id} ${stock.sku}`, stock);
    const seen = warehouseLines.get(stock.warehouse_id);
    if (seen) {
      seen.lines += 1;
    } else {
      warehouseLines.set(stock.warehouse_id, {
        warehouse_id: stock.warehouse_id,
        warehouse_name: stock.warehouse_name,
        lines: 1,
      });
    }
  }

  const rows: StockDiffRow[] = [];

  for (const variant of input.variants) {
    const link = linkByProduct.get(variant.product_id);
    if (!link) {
      continue;
    }

    const card = cardByNm.get(link.external_id) ?? null;
    const barcodes = cardBarcodes(card);

    for (const mapping of mapped) {
      const base = {
        kind: "stocks" as const,
        product_id: variant.product_id,
        product_title: variant.product_title,
        variant_id: variant.variant_id,
        variant_sku: variant.variant_sku,
        nm_id: link.external_id,
        warehouse_id: mapping.wb_warehouse_id,
        warehouse_name:
          warehouseLines.get(String(mapping.wb_warehouse_id))?.warehouse_name ?? null,
        store_value: variant.stock,
      };

      if (barcodes.length === 0) {
        rows.push({
          ...base,
          barcode: null,
          chrt_id: null,
          wb_value: null,
          action: "skipped",
          reason: "card_without_barcodes",
        });
        continue;
      }

      if (barcodes.length > 1) {
        rows.push({
          ...base,
          barcode: null,
          chrt_id: null,
          wb_value: null,
          action: "skipped",
          reason: "card_has_several_barcodes",
        });
        continue;
      }

      const [barcode] = barcodes;
      const line = amountByKey.get(`${mapping.wb_warehouse_id} ${barcode.sku}`) ?? null;
      const wbValue = line ? line.amount : 0;

      if (variant.stock === null) {
        rows.push({
          ...base,
          barcode: barcode.sku,
          chrt_id: barcode.chrt_id ?? line?.chrt_id ?? null,
          wb_value: wbValue,
          action: "skipped",
          reason: "store_does_not_count_this_variant",
        });
        continue;
      }

      rows.push({
        ...base,
        barcode: barcode.sku,
        chrt_id: barcode.chrt_id ?? line?.chrt_id ?? null,
        wb_value: wbValue,
        action: variant.stock === wbValue ? "equal" : "update",
        reason: null,
      });
    }
  }

  return {
    rows,
    counts: countRows(rows),
    warehouses: [...warehouseLines.values()].sort((left, right) => right.lines - left.lines),
  };
};

export type PriceDiffInput = {
  variants: StoreVariant[];
  links: LinkRow[];
  prices: MirrorPrice[];
};

/**
 * Store price to WB price, one row per linked variant.
 *
 * Both sides are the number a BUYER pays, which is the only comparison that
 * means anything across two shop fronts: ours is the variant's own price,
 * WB's is `discountedPrice`. `proposed_price` then says what WB's `price`
 * would have to become for its buyer price to equal ours, at the discount WB
 * already holds.
 *
 * A card the mirror has no price row for is SKIPPED rather than treated as
 * free, and a variant with no price of its own is skipped the same way.
 */
export const diffPrices = (
  input: PriceDiffInput,
): { rows: PriceDiffRow[]; counts: WbDiffCounts } => {
  const priceByNm = new Map(input.prices.map((price) => [price.nm_id, price]));
  const linkByProduct = new Map(input.links.map((link) => [link.product_id, link]));

  const rows: PriceDiffRow[] = [];

  for (const variant of input.variants) {
    const link = linkByProduct.get(variant.product_id);
    if (!link) {
      continue;
    }

    const mirror = priceByNm.get(link.external_id) ?? null;
    const wbValue = wbBuyerPrice(mirror);
    const base = {
      kind: "prices" as const,
      product_id: variant.product_id,
      product_title: variant.product_title,
      variant_id: variant.variant_id,
      variant_sku: variant.variant_sku,
      nm_id: link.external_id,
      currency: variant.currency,
      store_value: variant.price,
      wb_value: wbValue,
      wb_price: wbListPrice(mirror),
      wb_discount: mirror?.discount ?? null,
    };

    if (!mirror || wbValue === null) {
      rows.push({ ...base, proposed_price: null, action: "skipped", reason: "wb_price_absent" });
      continue;
    }
    if (variant.price === null) {
      rows.push({ ...base, proposed_price: null, action: "skipped", reason: "store_price_absent" });
      continue;
    }
    if (variant.price === wbValue) {
      rows.push({ ...base, proposed_price: null, action: "equal", reason: null });
      continue;
    }

    const proposed = proposedWbPrice(variant.price, mirror.discount);
    if (proposed.price === null) {
      rows.push({ ...base, proposed_price: null, action: "skipped", reason: proposed.reason });
      continue;
    }

    rows.push({ ...base, proposed_price: proposed.price, action: "update", reason: null });
  }

  return { rows, counts: countRows(rows) };
};
