import {
  abcOf,
  cardRowsOf,
  resolveAnalyticsPeriod,
  resolveCardsQuery,
  saleRowsOf,
  salesByCard,
  selectCards,
  totalsOf,
  xyzOf,
  NO_CATEGORY,
  type RawLine,
} from "../analytics";
import {
  byCategory,
  byRegion,
  byWarehouse,
  cardExtrasOf,
  checksByWeek,
  checksOf,
  comparisonOf,
  discountBucketOf,
  previousPeriodOf,
  previousTotalsOf,
  warehouseTypeOf,
} from "../analytics/infographic";

/**
 * The v3 infographic of «Wildberries → Аналитика» (t-2026-10-16-36): the new
 * fields of the answer, each pinned with the reason it is that number.
 */

const MSK = "Europe/Moscow";
const NOW = new Date("2026-10-16T09:00:00.000Z");
/** 16 September (a Wednesday) — 15 October, 30 days. */
const PERIOD = resolveAnalyticsPeriod({ from: "2026-09-16", to: "2026-10-15" }, NOW, MSK);

let lineNo = 0;
const line = (over: Partial<RawLine> = {}): RawLine => ({
  order_id: `o-${(lineNo += 1)}`,
  ordered_at: "2026-09-17T10:00:00.000Z",
  is_cancelled: false,
  has_line: true,
  card_id: "100",
  vendor_code: "V-100",
  qty: 1,
  price: 1000,
  region: null,
  warehouse: null,
  check_id: null,
  discount: null,
  ...over,
});

describe("прошлый период", () => {
  it("та же длина, кончается накануне начала текущего", () => {
    const previous = previousPeriodOf(PERIOD);
    expect(previous.from_day).toBe("2026-08-17");
    expect(previous.to_day).toBe("2026-09-15");
    expect(previous.days).toBe(30);
    expect(previous.until.getTime()).toBe(PERIOD.from.getTime());
  });

  it("сравнения нет, если зеркало начинается позже прошлого периода: отсутствие не падение продаж", () => {
    const previous = previousPeriodOf(PERIOD);
    expect(comparisonOf(previous, "2026-08-17").available).toBe(true);
    expect(comparisonOf(previous, "2026-08-18").available).toBe(false);
    expect(comparisonOf(previous, null)).toMatchObject({ available: false, data_from_day: null });
  });

  it("итоги прошлого периода: отмены отдельно, чек по gNumber", () => {
    const rows = saleRowsOf(
      [
        line({ order_id: "a", check_id: "g1", price: 300 }),
        line({ order_id: "b", check_id: "g1", price: 700 }),
        line({ order_id: "c", is_cancelled: true, price: 500 }),
      ],
      PERIOD,
    );
    expect(previousTotalsOf(rows)).toEqual({ revenue: 1000, orders: 2, avg_check: 1000, cancelled_orders: 1 });
  });
});

describe("средний чек", () => {
  it("строки с одним gNumber — один чек; заказ без gNumber — свой чек", () => {
    const rows = saleRowsOf(
      [
        line({ order_id: "a", check_id: "g1", price: 400 }),
        line({ order_id: "b", check_id: "g1", price: 600 }),
        line({ order_id: "c", check_id: null, price: 500 }),
        line({ order_id: "d", check_id: "g2", price: 900, is_cancelled: true }),
      ],
      PERIOD,
    );
    expect(checksOf(rows)).toEqual({ checks: 2, revenue: 1500, avg_check: 750 });
  });

  it("без продаж чек — null, не ноль", () => {
    expect(checksOf([]).avg_check).toBeNull();
  });

  it("недели календарные, с понедельника; крайние обрезаны периодом и говорят, сколько в них дней", () => {
    const weeks = checksByWeek([], PERIOD);
    expect(weeks[0]).toMatchObject({ start: "2026-09-16", end: "2026-09-20", days: 5 });
    expect(weeks[1]).toMatchObject({ start: "2026-09-21", end: "2026-09-27", days: 7 });
    expect(weeks[weeks.length - 1]).toMatchObject({ start: "2026-10-12", end: "2026-10-15", days: 4 });
    expect(weeks.reduce((sum, week) => sum + week.days, 0)).toBe(30);
  });

  it("заказ попадает в неделю своего дня", () => {
    const rows = saleRowsOf([line({ ordered_at: "2026-09-22T10:00:00.000Z", price: 800 })], PERIOD);
    const weeks = checksByWeek(rows, PERIOD);
    expect(weeks[1]).toMatchObject({ checks: 1, avg_check: 800 });
    expect(weeks[0]).toMatchObject({ checks: 0, avg_check: null });
  });
});

describe("категории, склады, регионы", () => {
  const rows = saleRowsOf(
    [
      line({ card_id: "1", price: 600, region: "Москва", warehouse: "wb" }),
      line({ card_id: "2", price: 300, region: "Москва", warehouse: "seller" }),
      line({ card_id: "3", price: 100, region: null, warehouse: null }),
      line({ card_id: "1", price: 999, is_cancelled: true, region: "Казань", warehouse: "wb" }),
    ],
    PERIOD,
  );
  const category = (id: string | null) => ({ "1": "Мёд", "2": "Мёд", "3": null })[id ?? ""] ?? null;

  it("доля категории — от выручки без отмен; категория без имени — своя строка", () => {
    const shares = byCategory(rows, category, null);
    expect(shares).toEqual([
      { category: "Мёд", revenue: 900, share: 90, revenue_previous: null },
      { category: null, revenue: 100, share: 10, revenue_previous: null },
    ]);
  });

  it("категория прошлого периода — ноль, а не null, когда сравнение есть", () => {
    const shares = byCategory(rows, category, []);
    expect(shares[0].revenue_previous).toBe(0);
  });

  it("склад: WB, продавец и «не сказано» — суммы сходятся с выручкой", () => {
    const shares = byWarehouse(rows);
    expect(shares.map((share) => [share.warehouse, share.revenue, share.share])).toEqual([
      ["wb", 600, 60],
      ["seller", 300, 30],
      [null, 100, 10],
    ]);
    const totals = totalsOf({ rows, cards: salesByCard(rows), cardsTotal: 3, stockUnits: null, stockLooksDeclared: false, period: PERIOD });
    expect(shares.reduce((sum, share) => sum + share.revenue, 0)).toBe(totals.revenue);
  });

  it("регионы: доли только среди известных, и сказано, у скольких заказов регион известен", () => {
    const regions = byRegion(rows);
    expect(regions.top).toEqual([{ region: "Москва", revenue: 900, share: 100 }]);
    expect(regions.other).toBeNull();
    expect(regions.known_orders).toBe(2);
    expect(regions.orders).toBe(3);
  });

  it("больше пяти регионов: остальные одной строкой", () => {
    const many = saleRowsOf(
      ["A", "B", "C", "D", "E", "F", "G"].map((region, index) => line({ region, price: 100 * (7 - index) })),
      PERIOD,
    );
    const regions = byRegion(many);
    expect(regions.top.map((entry) => entry.region)).toEqual(["A", "B", "C", "D", "E"]);
    expect(regions.other).toMatchObject({ regions: 2, revenue: 300 });
  });
});

describe("тип склада WB", () => {
  it("читается слово в слово, FBS — склад продавца по определению схемы, остальное — null", () => {
    expect(warehouseTypeOf("Склад WB", null)).toBe("wb");
    expect(warehouseTypeOf("Склад продавца", null)).toBe("seller");
    expect(warehouseTypeOf(null, "FBS")).toBe("seller");
    expect(warehouseTypeOf("Коледино", null)).toBeNull();
  });
});

describe("фильтры списка", () => {
  const rows = saleRowsOf(
    [
      line({ card_id: "1", price: 5000, qty: 5, discount: 0, warehouse: "wb" }),
      line({ card_id: "2", price: 300, discount: 30, warehouse: "seller" }),
      line({ card_id: "3", price: 100, discount: 50, warehouse: "wb" }),
    ],
    PERIOD,
  );
  const sold = salesByCard(rows);
  const cards = cardRowsOf({
    marketplace: "wb",
    cards: sold,
    abc: abcOf(sold),
    xyz: xyzOf(rows, sold, PERIOD, new Map()),
    stock: new Map([
      ["1", 1000],
      ["2", 5],
      ["3", null],
    ]),
    info: new Map(),
    period: PERIOD,
    categories: new Map([
      ["1", "Мёд"],
      ["2", "Масла"],
    ]),
    extras: cardExtrasOf(rows),
    previous: new Map([["1", 1000]]),
  });
  const ids = (query: Record<string, unknown>) => selectCards(cards, resolveCardsQuery(query)).rows.map((row) => row.external_id);

  it("строка карточки несёт категорию, скидку, склады и выручку прошлого периода", () => {
    expect(cards[0]).toMatchObject({ category: "Мёд", discount: 0, warehouses: ["wb"], revenue_previous: 1000 });
    expect(cards[1]).toMatchObject({ category: "Масла", discount: 30, revenue_previous: 0 });
    expect(cards[2]).toMatchObject({ category: null, discount: 50 });
  });

  it("категория, включая «без категории»", () => {
    expect(ids({ category: "Мёд" })).toEqual(["1"]);
    expect(ids({ category: `Масла,${NO_CATEGORY}` })).toEqual(["2", "3"]);
  });

  it("скидка продавца по корзинам", () => {
    expect(discountBucketOf(0)).toBe("none");
    expect(discountBucketOf(19)).toBe("lt20");
    expect(discountBucketOf(40)).toBe("20to40");
    expect(discountBucketOf(41)).toBe("gt40");
    expect(discountBucketOf(null)).toBeNull();
    expect(ids({ discount: "20to40,gt40" })).toEqual(["2", "3"]);
  });

  it("склад, ABC и «кончатся за 14 дней»", () => {
    expect(ids({ warehouse: "seller" })).toEqual(["2"]);
    expect(ids({ abc: "A" })).toEqual(["1"]);
    // 5 шт при 1 шт за 30 дней — 150 дней; 1000 шт при 5 шт — 6000 дней; без остатка — не «кончится».
    expect(ids({ runs_out: "1" })).toEqual([]);
  });

  it("неизвестное значение фильтра отбрасывается, а не опустошает список", () => {
    expect(ids({ warehouse: "moon", abc: "Q" })).toEqual(["1", "2", "3"]);
  });

  it("сумма отобранного — по всем совпавшим, не по странице", () => {
    const page = selectCards(cards, resolveCardsQuery({ limit: 1 }));
    expect(page.rows).toHaveLength(1);
    expect(page.revenue).toBe(25_400);
  });
});
