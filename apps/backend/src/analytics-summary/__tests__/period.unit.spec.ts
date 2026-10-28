import {
  aggregate,
  canceledOnly,
  changeOf,
  dailySeries,
  DAY_MS,
  ordersBetween,
  resolveRange,
  sold,
  type PeriodOrder,
} from "../period";

/**
 * t-2026-10-20-45: the arithmetic behind the panel's «Аналитика магазина».
 * The shop's timezone is Europe/Moscow (UTC+3, no DST), so a shop day starts
 * at 21:00 UTC of the day before.
 */

const NOW = new Date("2026-10-27T10:00:00Z"); // 13:00 Moscow, 27 Oct
const order = (id: string, at: string, total: number, canceled = false): PeriodOrder => ({
  id,
  created_at: new Date(at),
  total,
  currency_code: "rub",
  canceled,
});

describe("resolveRange", () => {
  it("7d ends after today, covers seven shop days and starts at Moscow midnight", () => {
    const range = resolveRange({ period: "7d" }, NOW);
    expect(range.key).toBe("7d");
    expect(range.end.toISOString()).toBe("2026-10-27T21:00:00.000Z");
    expect(range.start.toISOString()).toBe("2026-10-20T21:00:00.000Z");
    expect((range.end.getTime() - range.start.getTime()) / DAY_MS).toBe(7);
  });

  it("the previous period is the same length and touches the current one", () => {
    for (const period of ["today", "7d", "30d"]) {
      const range = resolveRange({ period }, NOW);
      expect(range.prevEnd.getTime()).toBe(range.start.getTime());
      expect(range.prevEnd.getTime() - range.prevStart.getTime()).toBe(range.end.getTime() - range.start.getTime());
    }
  });

  it("a custom range includes its last day and compares with the days right before it", () => {
    const range = resolveRange({ period: "custom", from: "2026-09-01", to: "2026-09-10" }, NOW);
    expect(range.key).toBe("custom");
    expect(range.start.toISOString()).toBe("2026-08-31T21:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-10T21:00:00.000Z");
    expect(range.prevStart.toISOString()).toBe("2026-08-21T21:00:00.000Z");
    expect(range.prevEnd.toISOString()).toBe(range.start.toISOString());
  });

  it("the panel's last-7-days custom range is the same window as the 7d period", () => {
    const seven = resolveRange({ period: "7d" }, NOW);
    const custom = resolveRange({ period: "custom", from: "2026-10-21", to: "2026-10-27" }, NOW);
    expect(custom.start.getTime()).toBe(seven.start.getTime());
    expect(custom.end.getTime()).toBe(seven.end.getTime());
    expect(custom.prevStart.getTime()).toBe(seven.prevStart.getTime());
  });

  it("a single-day custom range is one day", () => {
    const range = resolveRange({ period: "custom", from: "2026-09-05", to: "2026-09-05" }, NOW);
    expect((range.end.getTime() - range.start.getTime()) / DAY_MS).toBe(1);
  });

  it("a malformed or reversed custom range falls back to 7 days", () => {
    expect(resolveRange({ period: "custom", from: "2026-09-10", to: "2026-09-01" }, NOW).key).toBe("7d");
    expect(resolveRange({ period: "custom", from: "nonsense", to: "2026-09-01" }, NOW).key).toBe("7d");
    expect(resolveRange({ period: "custom" }, NOW).key).toBe("7d");
  });
});

describe("period edges", () => {
  it("an order one millisecond before the start is out and one at the start is in; the end is exclusive", () => {
    const { start, end } = resolveRange({ period: "7d" }, NOW);
    const before = order("a", new Date(start.getTime() - 1).toISOString(), 100);
    const first = order("b", start.toISOString(), 200);
    const last = order("c", new Date(end.getTime() - 1).toISOString(), 300);
    const after = order("d", end.toISOString(), 400);
    const ids = ordersBetween([before, first, last, after], start, end).map((o) => o.id);
    expect(ids).toEqual(["b", "c"]);
  });

  it("01:00 Moscow time belongs to that Moscow day, not to the UTC day before", () => {
    const { start, end } = resolveRange({ period: "today" }, NOW);
    const early = order("early", "2026-10-26T22:00:00Z", 100); // 01:00 on the 27th in Moscow
    expect(ordersBetween([early], start, end)).toHaveLength(1);
  });
});

describe("cancelled orders", () => {
  const orders = [order("1", "2026-10-26T10:00:00Z", 1000), order("2", "2026-10-26T11:00:00Z", 500, true)];

  it("stay out of revenue and are reported apart", () => {
    expect(aggregate(sold(orders))).toEqual({ revenue: 1000, order_count: 1, aov: 1000 });
    expect(aggregate(canceledOnly(orders))).toEqual({ revenue: 500, order_count: 1, aov: 500 });
  });

  it("stay out of the daily series", () => {
    const { start, end } = resolveRange({ period: "today" }, new Date("2026-10-26T12:00:00Z"));
    expect(dailySeries(orders, start, end)).toEqual([{ date: "2026-10-26", revenue: 1000, order_count: 1 }]);
  });
});

describe("dailySeries", () => {
  it("has a point for every day, zero days included, and the previous series lines up with the current one", () => {
    const range = resolveRange({ period: "7d" }, NOW);
    const orders = [
      order("now", "2026-10-27T05:00:00Z", 700),
      order("prev", "2026-10-18T05:00:00Z", 300),
      order("old", "2026-09-01T05:00:00Z", 999),
    ];
    const current = dailySeries(orders, range.start, range.end);
    const previous = dailySeries(orders, range.prevStart, range.prevEnd);
    expect(current).toHaveLength(7);
    expect(previous).toHaveLength(7);
    expect(current.map((d) => d.date)[0]).toBe("2026-10-21");
    expect(current[6]).toEqual({ date: "2026-10-27", revenue: 700, order_count: 1 });
    expect(previous[0].date).toBe("2026-10-14");
    expect(previous[4]).toEqual({ date: "2026-10-18", revenue: 300, order_count: 1 });
    expect(current.filter((d) => d.order_count === 0)).toHaveLength(6);
  });

  it("the daily revenue adds up to the period's revenue", () => {
    const range = resolveRange({ period: "30d" }, NOW);
    const orders = Array.from({ length: 40 }, (_, i) =>
      order(`o${i}`, new Date(NOW.getTime() - i * 0.75 * DAY_MS).toISOString(), 100 + i, i % 7 === 0),
    );
    const total = aggregate(sold(ordersBetween(orders, range.start, range.end))).revenue;
    const sum = dailySeries(orders, range.start, range.end).reduce((acc, d) => acc + d.revenue, 0);
    expect(Math.round(sum * 100) / 100).toBe(total);
  });
});

describe("changeOf", () => {
  it("is a percent against the previous period and null against nothing", () => {
    expect(changeOf(150, 100)).toBe(50);
    expect(changeOf(50, 100)).toBe(-50);
    expect(changeOf(5, 0)).toBeNull();
    expect(changeOf(0, 0)).toBeNull();
  });
});
