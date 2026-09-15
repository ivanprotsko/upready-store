import { pricePayload } from "../apply";
import type { CatalogVariant } from "../catalog";
import { firstFreeSlug, toSlug, transliterate } from "../slugify";

/**
 * The two places where being almost right is expensive (t14-product-import):
 * the price list sent on an update, and the product code generated for a new
 * row.
 */

const variant = (overrides: Partial<CatalogVariant> = {}): CatalogVariant => ({
  id: "var_1",
  sku: "A-100",
  title: "100 мл",
  weight: null,
  length: null,
  width: null,
  height: null,
  prices: { rub: 1990, eur: 25 },
  price_rows: [
    { id: "price_rub", currency_code: "rub", amount: 1990, has_rules: false, in_price_list: false },
    { id: "price_eur", currency_code: "eur", amount: 25, has_rules: false, in_price_list: false },
  ],
  inventory_item_id: null,
  stock: null,
  manage_inventory: false,
  ...overrides,
});

describe("product-csv/apply: pricePayload", () => {
  it("carries every existing price by id, so the ones the file omits are not deleted", () => {
    // `updatePriceSets` deletes every unscoped price of the set whose id is
    // absent from the update, so a one-column price list must still resend the
    // other currencies (measured in @medusajs/pricing, updatePriceSets_).
    const payload = pricePayload(variant(), { rub: 2490 });

    expect(payload).toEqual([
      { id: "price_rub", currency_code: "rub", amount: 2490 },
      { id: "price_eur", currency_code: "eur", amount: 25 },
    ]);
  });

  it("adds a currency the variant had no price in", () => {
    const payload = pricePayload(variant(), { usd: 30 });

    expect(payload).toEqual([
      { id: "price_rub", currency_code: "rub", amount: 1990 },
      { id: "price_eur", currency_code: "eur", amount: 25 },
      { currency_code: "usd", amount: 30 },
    ]);
  });

  it("leaves a price belonging to a price list out of the payload entirely", () => {
    // Those rows are outside the listing `updatePriceSets` deletes from, so
    // resending them would be the only way to damage them.
    const withPriceList = variant({
      price_rows: [
        {
          id: "price_rub",
          currency_code: "rub",
          amount: 1990,
          has_rules: false,
          in_price_list: false,
        },
        {
          id: "price_sale",
          currency_code: "rub",
          amount: 990,
          has_rules: false,
          in_price_list: true,
        },
      ],
    });

    const payload = pricePayload(withPriceList, { rub: 2490 });

    expect(payload).toEqual([{ id: "price_rub", currency_code: "rub", amount: 2490 }]);
  });

  it("does not write the file's amount over a price narrowed by a rule", () => {
    const withRule = variant({
      price_rows: [
        {
          id: "price_rub",
          currency_code: "rub",
          amount: 1990,
          has_rules: false,
          in_price_list: false,
        },
        {
          id: "price_rub_ru",
          currency_code: "rub",
          amount: 1890,
          has_rules: true,
          in_price_list: false,
        },
      ],
    });

    const payload = pricePayload(withRule, { rub: 2490 });

    expect(payload).toEqual([
      { id: "price_rub", currency_code: "rub", amount: 2490 },
      { id: "price_rub_ru", currency_code: "rub", amount: 1890 },
    ]);
  });
});

describe("product-csv/slugify", () => {
  it("transliterates a Russian product name into a URL", () => {
    expect(toSlug("АСД-2 фракция, 100 мл")).toBe("asd-2-fraktsiya-100-ml");
    expect(toSlug("Щётка для чая")).toBe("schetka-dlya-chaya");
    expect(transliterate("ёжик")).toBe("ezhik");
  });

  it("answers an empty string rather than a placeholder when there is nothing to slug", () => {
    expect(toSlug("")).toBe("");
    expect(toSlug("——")).toBe("");
  });

  it("finds the first free suffix for a code it generated itself", () => {
    expect(firstFreeSlug("asd-15", new Set())).toBe("asd-15");
    expect(firstFreeSlug("asd-15", new Set(["asd-15"]))).toBe("asd-15-2");
    expect(firstFreeSlug("asd-15", new Set(["asd-15", "asd-15-2"]))).toBe("asd-15-3");
  });
});
