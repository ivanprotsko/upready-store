import {
  pickCurrency,
  summariseByCurrency,
  withSelectedCurrency,
  type CurrencyOrder,
} from "../currency";

/**
 * Fixture А of b12-analytics-accuracy, the one seeded on the stand by
 * `scripts/fixtures/b12-seed-analytics-accuracy.ts`: the shop takes money in
 * two currencies inside one period. Measured there before the fix,
 * `GET /tenants/analytics/summary?period=7d` answered
 * `{"revenue":5900,"order_count":6,"aov":983.33}` with `currency_code: "rub"` —
 * ₽5 700 and $200 added together and labelled in rubles.
 */
const FIXTURE_A: CurrencyOrder[] = [
  { total: 1200, currency_code: "rub" },
  { total: 2400, currency_code: "rub" },
  { total: 600, currency_code: "rub" },
  { total: 1500, currency_code: "rub" },
  { total: 50, currency_code: "usd" },
  { total: 150, currency_code: "usd" },
];

describe("summariseByCurrency", () => {
  it("keeps each currency's money apart instead of summing across them", () => {
    expect(summariseByCurrency(FIXTURE_A)).toEqual([
      { currency_code: "rub", revenue: 5700, order_count: 4, aov: 1425 },
      { currency_code: "usd", revenue: 200, order_count: 2, aov: 100 },
    ]);
  });

  it("never produces the mixed total the screen used to show", () => {
    const buckets = summariseByCurrency(FIXTURE_A);
    const mixed = FIXTURE_A.reduce((sum, order) => sum + order.total, 0);

    expect(mixed).toBe(5900);
    expect(buckets.map((bucket) => bucket.revenue)).not.toContain(mixed);
  });

  it("orders buckets by revenue, then order count, then code", () => {
    const buckets = summariseByCurrency([
      { total: 10, currency_code: "usd" },
      { total: 10, currency_code: "eur" },
      { total: 10, currency_code: "eur" },
      { total: 30, currency_code: "rub" },
    ]);

    expect(buckets.map((bucket) => bucket.currency_code)).toEqual(["rub", "eur", "usd"]);
  });

  it("normalises the code and keeps an order without one rather than dropping its money", () => {
    expect(summariseByCurrency([{ total: 100, currency_code: "RUB" }])[0].currency_code).toBe("rub");
    expect(summariseByCurrency([{ total: 100, currency_code: null }])).toEqual([
      { currency_code: "", revenue: 100, order_count: 1, aov: 100 },
    ]);
  });

  it("is empty for a period without a single sold order", () => {
    expect(summariseByCurrency([])).toEqual([]);
  });
});

describe("pickCurrency", () => {
  const period = summariseByCurrency(FIXTURE_A);
  const all = period;

  it("shows the period's biggest currency when the owner has not picked one", () => {
    expect(pickCurrency(null, period, all)).toBe("rub");
  });

  it("honours the owner's pick", () => {
    expect(pickCurrency("usd", period, all)).toBe("usd");
    expect(pickCurrency("USD", period, all)).toBe("usd");
  });

  it("keeps the owner's pick when the chosen period has no orders in it", () => {
    expect(pickCurrency("usd", [], all)).toBe("usd");
  });

  it("falls back to the shop's biggest currency for an empty period", () => {
    expect(pickCurrency(null, [], all)).toBe("rub");
  });

  it("ignores a currency the shop has never taken money in", () => {
    expect(pickCurrency("eur", period, all)).toBe("rub");
  });

  it("is null only when there is nothing at all", () => {
    expect(pickCurrency("usd", [], [])).toBeNull();
  });
});

describe("withSelectedCurrency", () => {
  it("adds a real computed zero for the shown currency when the period has none of it", () => {
    const buckets = summariseByCurrency(FIXTURE_A.filter((order) => order.currency_code === "rub"));

    expect(withSelectedCurrency(buckets, "usd")).toEqual([
      { currency_code: "rub", revenue: 5700, order_count: 4, aov: 1425 },
      { currency_code: "usd", revenue: 0, order_count: 0, aov: 0 },
    ]);
  });

  it("leaves a breakdown that already holds the shown currency alone", () => {
    const buckets = summariseByCurrency(FIXTURE_A);

    expect(withSelectedCurrency(buckets, "rub")).toBe(buckets);
  });
});
