import {
  buildRatioTable,
  currencyDecimalDigits,
  pricesFromUsd,
  roundAmount,
} from "../lib/prices";
import { SEED_REGIONS, type SeedRegion } from "../data/regions";

const region = (
  name: string,
  currency_code: string,
  tShirt: number,
): SeedRegion =>
  ({
    name,
    currency_code,
    countries: [name.toLowerCase()],
    stock_location: {
      name: `${name} Warehouse`,
      address: { address_1: "1 Test Street", country_code: "us" },
    },
    shipping_prices: {},
    product_prices: { tShirt },
  }) as SeedRegion;

describe("currency decimals come from Medusa's own currency table", () => {
  it("reads two decimals for USD and zero for JPY and KRW", () => {
    expect(currencyDecimalDigits("usd")).toBe(2);
    expect(currencyDecimalDigits("jpy")).toBe(0);
    expect(currencyDecimalDigits("krw")).toBe(0);
  });

  it("throws on a currency Medusa does not know", () => {
    expect(() => currencyDecimalDigits("xxy")).toThrow(/Unknown currency "xxy"/);
  });
});

describe("ratio table", () => {
  const regions = [
    region("United States", "usd", 15),
    region("Germany", "eur", 14),
    region("Japan", "jpy", 2250),
  ];

  it("divides every demo price by the demo USD price", () => {
    expect(buildRatioTable(regions)).toEqual({
      usd: 1,
      eur: 14 / 15,
      jpy: 150,
    });
  });

  it("throws when the ratio product is missing from a region", () => {
    const broken = [...regions, region("Nowhere", "nok", 0)];
    delete (broken[3] as SeedRegion).product_prices.tShirt;
    expect(() => buildRatioTable(broken)).toThrow(
      /Ratio product "t-shirt" has no price in region "Nowhere"/,
    );
  });

  it("throws when there is no USD region to anchor on", () => {
    expect(() => buildRatioTable([region("Germany", "eur", 14)])).toThrow(
      /has no USD price/,
    );
  });

  it("covers every currency of the 241 shipped region files", () => {
    const ratios = buildRatioTable(SEED_REGIONS);
    const currencies = new Set(SEED_REGIONS.map((r) => r.currency_code));
    expect(SEED_REGIONS.length).toBe(241);
    expect(Object.keys(ratios).length).toBe(currencies.size);
    for (const currency of currencies) {
      expect(ratios[currency]).toBeGreaterThan(0);
    }
  });
});

describe("rounding", () => {
  it("charm ends a two-decimal currency in .99", () => {
    expect(roundAmount(129 * 1, "usd", "charm")).toBe(128.99);
    expect(roundAmount(129 * 0.9333333333333333, "eur", "charm")).toBe(119.99);
    expect(roundAmount(1.2, "usd", "charm")).toBe(0.99);
  });

  it("charm ends a zero-decimal currency in 9 and keeps it whole", () => {
    const jpy = roundAmount(129 * 150, "jpy", "charm");
    expect(jpy).toBe(19349);
    expect(Number.isInteger(jpy)).toBe(true);
    expect(jpy % 10).toBe(9);

    const krw = roundAmount(129 * 1353.3333333333333, "krw", "charm");
    expect(Number.isInteger(krw)).toBe(true);
    expect(krw % 10).toBe(9);
  });

  it("round produces whole tens in both kinds of currency", () => {
    expect(roundAmount(129, "usd", "round")).toBe(130);
    expect(roundAmount(129 * 150, "jpy", "round")).toBe(19350);
    expect(roundAmount(0.4, "usd", "round")).toBe(10);
  });

  it("charm keeps three-decimal currencies on a .99 ending", () => {
    expect(currencyDecimalDigits("kwd")).toBe(3);
    expect(roundAmount(48.6, "kwd", "charm")).toBe(48.99);
  });
});

describe("pricesFromUsd", () => {
  const regions = [
    region("United States", "usd", 15),
    region("Japan", "jpy", 2250),
  ];
  const ratios = buildRatioTable(regions);

  it("prices every region currency exactly once", () => {
    const prices = pricesFromUsd(129, { regions, ratios, rounding: "charm" });
    expect(prices).toEqual([
      { currency_code: "usd", amount: 128.99 },
      { currency_code: "jpy", amount: 19349 },
    ]);
  });

  it("throws when a region currency has no ratio", () => {
    expect(() =>
      pricesFromUsd(129, {
        regions: [...regions, region("Norway", "nok", 150)],
        ratios,
        rounding: "charm",
      }),
    ).toThrow(/Missing exchange ratio for currency "nok"/);
  });

  it("gives all 241 shipped regions a price for one variant", () => {
    const all = pricesFromUsd(129, {
      regions: SEED_REGIONS,
      ratios: buildRatioTable(SEED_REGIONS),
      rounding: "charm",
    });
    const currencies = new Set(SEED_REGIONS.map((r) => r.currency_code));
    expect(all.length).toBe(currencies.size);
    expect(all.every((price) => price.amount > 0)).toBe(true);
  });
});
