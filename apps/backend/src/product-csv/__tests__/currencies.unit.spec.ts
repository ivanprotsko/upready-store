import { collectCurrencies } from "../catalog";
import type { CatalogProduct, CatalogVariant } from "../catalog";

/**
 * Which price column the catalogue export writes (b01-owner-numbers).
 *
 * The live shop sells in roubles, the platform's shared `store` row is seeded
 * with `usd` as its default, and the export used to take that default: the
 * owner opened «Цена, USD» = 18 next to a product her own storefront prices at
 * 1 084 ₽. The shop's own settings come first, and when it has none the
 * CATALOGUE decides, so the file can only carry a currency the shop actually
 * prices in.
 */

const variant = (prices: Record<string, number>): CatalogVariant => ({
  id: `var_${Object.keys(prices).join("_")}_${Object.values(prices).join("_")}`,
  sku: null,
  title: null,
  weight: null,
  length: null,
  width: null,
  height: null,
  prices,
  price_rows: [],
  inventory_item_id: null,
  stock: null,
  manage_inventory: false,
});

const product = (variants: CatalogVariant[]): CatalogProduct => ({
  id: "prod_1",
  handle: "prod-1",
  title: "Product",
  subtitle: null,
  description: null,
  status: "published",
  category_id: null,
  category_path: null,
  image_urls: [],
  metadata: {},
  options: [],
  variants,
});

describe("product-csv/catalog: collectCurrencies", () => {
  it("writes the shop's own currency when it has one, whatever the catalogue holds", () => {
    const catalogue = [product([variant({ usd: 18 }), variant({ usd: 12 })])];

    expect(collectCurrencies(catalogue, "rub", "usd")).toEqual(["rub"]);
  });

  it("takes the currency most of the shop's own variants are priced in", () => {
    // The shape of the live shop: every variant priced in roubles, most of
    // them also carrying a leftover seed price in dollars.
    const catalogue = [
      product([
        variant({ rub: 1084, usd: 12 }),
        variant({ rub: 723, usd: 8 }),
        variant({ rub: 450 }),
      ]),
    ];

    expect(collectCurrencies(catalogue, null, "usd")).toEqual(["rub"]);
  });

  it("falls back to the store's default only when nothing in the catalogue is priced", () => {
    expect(collectCurrencies([product([variant({})])], null, "usd")).toEqual(["usd"]);
    expect(collectCurrencies([], null, "usd")).toEqual(["usd"]);
  });

  it("writes no column at all when there is no currency anywhere, rather than inventing one", () => {
    expect(collectCurrencies([product([variant({})])], null, null)).toEqual([]);
  });

  it("keeps the first currency seen when two are equally common, so two runs agree", () => {
    const catalogue = [product([variant({ rub: 100, usd: 2 }), variant({ rub: 200, usd: 4 })])];

    expect(collectCurrencies(catalogue, null, "eur")).toEqual(["rub"]);
  });
});
