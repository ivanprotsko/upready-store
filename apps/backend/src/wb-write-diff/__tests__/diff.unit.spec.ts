import { diffPrices, diffStocks, proposedWbPrice, wbBuyerPrice, wbListPrice } from "../diff";
import type { LinkRow, MirrorCard, MirrorPrice, MirrorStock, StoreVariant } from "../types";

/**
 * The diff rules as fixtures (w21-wb-write-stocks-prices).
 *
 * Every case here is a thing the diff must refuse to guess about. The numbers
 * in the price cases are the ones measured on the Cherkashina mirror
 * (nmID 94372564: price 1980, discount 50, discountedPrice 990).
 */

const variant = (over: Partial<StoreVariant> = {}): StoreVariant => ({
  product_id: "prod_1",
  product_title: "Мумиё алтайское",
  variant_id: "var_1",
  variant_sku: "94372564-CHERKASHINO",
  stock: 7,
  price: 990,
  currency: "rub",
  ...over,
});

const link = (over: Partial<LinkRow> = {}): LinkRow => ({
  product_id: "prod_1",
  variant_id: "var_1",
  external_id: "94372564",
  ...over,
});

const card = (skus: string[][]): MirrorCard => ({
  nm_id: "94372564",
  vendor_code: "Мумие банка",
  sizes: skus.map((group, index) => ({ chrtID: 1000 + index, skus: group })),
});

const stock = (over: Partial<MirrorStock> = {}): MirrorStock => ({
  warehouse_id: "985793",
  warehouse_name: "Фабрика Натуральных Продуктов",
  sku: "2037031652319",
  chrt_id: "1000",
  nm_id: "94372564",
  amount: 3,
  ...over,
});

const mapped = [
  { stock_location_id: "sloc_1", stock_location_name: "Оксана Черкашина warehouse", wb_warehouse_id: "985793" },
];

const price = (over: Partial<MirrorPrice> = {}): MirrorPrice => ({
  nm_id: "94372564",
  discount: 50,
  currency_iso: "RUB",
  sizes: [{ sizeID: 1, price: 1980, discountedPrice: 990 }],
  ...over,
});

describe("stock diff", () => {
  it("calls a quantity that differs an update, and an equal one equal", () => {
    const differs = diffStocks({
      variants: [variant({ stock: 7 })],
      links: [link()],
      cards: [card([["2037031652319"]])],
      stocks: [stock({ amount: 3 })],
      mappings: mapped,
    });

    expect(differs.rows).toHaveLength(1);
    expect(differs.rows[0]).toMatchObject({
      action: "update",
      store_value: 7,
      wb_value: 3,
      barcode: "2037031652319",
      warehouse_id: "985793",
    });
    expect(differs.counts).toEqual({ total: 1, equal: 0, update: 1, skipped: 0 });

    const same = diffStocks({
      variants: [variant({ stock: 3 })],
      links: [link()],
      cards: [card([["2037031652319"]])],
      stocks: [stock({ amount: 3 })],
      mappings: mapped,
    });
    expect(same.rows[0].action).toBe("equal");
  });

  it("reads a barcode the mirror has no line for as zero, not as unknown", () => {
    const result = diffStocks({
      variants: [variant({ stock: 0 })],
      links: [link()],
      cards: [card([["2037031652319"]])],
      stocks: [stock({ sku: "somebody-else" })],
      mappings: mapped,
    });

    expect(result.rows[0]).toMatchObject({ wb_value: 0, action: "equal" });
  });

  it("skips a card with several barcodes rather than picking one", () => {
    const result = diffStocks({
      variants: [variant()],
      links: [link()],
      cards: [card([["aaa"], ["bbb"]])],
      stocks: [stock()],
      mappings: mapped,
    });

    expect(result.rows[0]).toMatchObject({
      action: "skipped",
      reason: "card_has_several_barcodes",
      barcode: null,
    });
    expect(result.counts.skipped).toBe(1);
  });

  it("skips a variant the shop does not count instead of sending zero", () => {
    const result = diffStocks({
      variants: [variant({ stock: null })],
      links: [link()],
      cards: [card([["2037031652319"]])],
      stocks: [stock({ amount: 5 })],
      mappings: mapped,
    });

    expect(result.rows[0]).toMatchObject({
      action: "skipped",
      reason: "store_does_not_count_this_variant",
      store_value: null,
      wb_value: 5,
    });
  });

  it("produces no row for a location with no WB warehouse mapped to it", () => {
    const result = diffStocks({
      variants: [variant()],
      links: [link()],
      cards: [card([["2037031652319"]])],
      stocks: [stock()],
      mappings: [{ ...mapped[0], wb_warehouse_id: null }],
    });

    expect(result.rows).toEqual([]);
    expect(result.counts.total).toBe(0);
  });

  it("leaves an unlinked product out of the diff entirely", () => {
    const result = diffStocks({
      variants: [variant({ product_id: "prod_unlinked" })],
      links: [link()],
      cards: [card([["2037031652319"]])],
      stocks: [stock()],
      mappings: mapped,
    });

    expect(result.rows).toEqual([]);
  });

  it("lists the warehouses the mirror has seen, busiest first", () => {
    const result = diffStocks({
      variants: [],
      links: [],
      cards: [],
      stocks: [
        stock({ warehouse_id: "1", sku: "a" }),
        stock({ warehouse_id: "2", sku: "b" }),
        stock({ warehouse_id: "2", sku: "c" }),
      ],
      mappings: [],
    });

    expect(result.warehouses.map((row) => row.warehouse_id)).toEqual(["2", "1"]);
    expect(result.warehouses[0].lines).toBe(2);
  });
});

describe("WB price arithmetic", () => {
  it("takes the buyer price, not the pre-discount one", () => {
    expect(wbBuyerPrice(price())).toBe(990);
    expect(wbListPrice(price())).toBe(1980);
  });

  it("takes the lowest buyer price of a card priced per size", () => {
    const perSize = price({
      sizes: [
        { sizeID: 1, price: 1980, discountedPrice: 990 },
        { sizeID: 2, price: 1600, discountedPrice: 800 },
      ],
    });
    expect(wbBuyerPrice(perSize)).toBe(800);
    expect(wbListPrice(perSize)).toBe(1600);
  });

  it("inverts WB's own discount formula", () => {
    expect(proposedWbPrice(990, 50)).toEqual({ price: 1980, reason: null });
    expect(proposedWbPrice(1200, 0)).toEqual({ price: 1200, reason: null });
    expect(proposedWbPrice(1200, null)).toEqual({ price: 1200, reason: null });
  });

  it("refuses a buyer price it cannot hit exactly at the current discount", () => {
    expect(proposedWbPrice(1000, 33)).toEqual({
      price: null,
      reason: "price_not_reachable_at_current_discount",
    });
    expect(proposedWbPrice(1000, 100).price).toBeNull();
  });
});

describe("price diff", () => {
  it("compares the two BUYER prices and proposes the WB price behind ours", () => {
    const result = diffPrices({
      variants: [variant({ price: 1100 })],
      links: [link()],
      prices: [price()],
    });

    expect(result.rows[0]).toMatchObject({
      action: "update",
      store_value: 1100,
      wb_value: 990,
      wb_price: 1980,
      wb_discount: 50,
      proposed_price: 2200,
    });
    expect(result.counts).toEqual({ total: 1, equal: 0, update: 1, skipped: 0 });
  });

  it("calls equal prices equal and proposes nothing", () => {
    const result = diffPrices({
      variants: [variant({ price: 990 })],
      links: [link()],
      prices: [price()],
    });

    expect(result.rows[0]).toMatchObject({ action: "equal", proposed_price: null });
  });

  it("skips a card the mirror holds no price for instead of treating it as free", () => {
    const result = diffPrices({ variants: [variant()], links: [link()], prices: [] });

    expect(result.rows[0]).toMatchObject({
      action: "skipped",
      reason: "wb_price_absent",
      wb_value: null,
    });
  });

  it("skips a variant with no price of its own", () => {
    const result = diffPrices({
      variants: [variant({ price: null })],
      links: [link()],
      prices: [price()],
    });

    expect(result.rows[0]).toMatchObject({ action: "skipped", reason: "store_price_absent" });
  });

  it("skips a price unreachable at WB's current discount rather than drifting", () => {
    const result = diffPrices({
      variants: [variant({ price: 1000 })],
      links: [link()],
      prices: [price({ discount: 33, sizes: [{ sizeID: 1, price: 1500, discountedPrice: 1005 }] })],
    });

    expect(result.rows[0]).toMatchObject({
      action: "skipped",
      reason: "price_not_reachable_at_current_discount",
      proposed_price: null,
    });
  });
});
