import { MedusaError } from "@medusajs/framework/utils";
import {
  ABC_BOUNDS,
  DEFAULT_PERIOD_DAYS,
  MAX_PERIOD_DAYS,
  XYZ_MIN_WEEKS,
  abcOf,
  cardKey,
  cardRowsOf,
  dayIn,
  daysOf,
  daysToZero,
  midnightIn,
  resolveAnalyticsPeriod,
  resolveCardsQuery,
  saleRowsOf,
  salesByCard,
  salesByDay,
  selectCards,
  stockLooksDeclared,
  totalsOf,
  weeksOf,
  xyzOf,
  type CardRow,
  type CardSales,
  type RawLine,
} from "../analytics";
import { sellerRating } from "../analytics-sources";

/**
 * The arithmetic of «Wildberries → Аналитика» (mp-section-design task-06).
 *
 * Every case here is a number a shop owner could argue with, so each test
 * pins the number AND the reason it is that number: which rows count, which
 * do not, which day an order belongs to, and what an absent value does.
 */

const MSK = "Europe/Moscow";
/** 2026-09-30 15:00 in Moscow. */
const NOW = new Date("2026-09-30T12:00:00.000Z");

const SEPTEMBER = resolveAnalyticsPeriod({ from: "2026-09-01", to: "2026-09-30" }, NOW, MSK);

let lineNo = 0;
const line = (over: Partial<RawLine> = {}): RawLine => ({
  order_id: `o-${(lineNo += 1)}`,
  ordered_at: "2026-09-02T10:00:00.000Z",
  is_cancelled: false,
  has_line: true,
  card_id: "100",
  vendor_code: "V-100",
  qty: 1,
  price: 1000,
  ...over,
});

const totalsInput = (rows: ReturnType<typeof saleRowsOf>, stockUnits: number | null = null) => ({
  rows,
  cards: salesByCard(rows),
  cardsTotal: 423,
  stockUnits,
  stockLooksDeclared: false,
  period: SEPTEMBER,
});

const invalidData = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MedusaError);
    expect((error as MedusaError).type).toBe(MedusaError.Types.INVALID_DATA);
    return (error as MedusaError).message;
  }
  throw new Error("ожидалась ошибка 400");
};

describe("период по календарю магазина", () => {
  it("по умолчанию — последние 30 дней магазина вместе с сегодняшним, и ответ это говорит", () => {
    const period = resolveAnalyticsPeriod({}, NOW, MSK);

    expect(period.to_day).toBe("2026-09-30");
    expect(period.from_day).toBe("2026-09-01");
    expect(period.days).toBe(DEFAULT_PERIOD_DAYS);
    expect(period.is_default).toBe(true);
  });

  it("«сегодня» — сегодня магазина, а не UTC: 22:30 UTC 4 октября — это уже 5 октября в Москве", () => {
    const period = resolveAnalyticsPeriod({}, new Date("2026-10-04T22:30:00.000Z"), MSK);

    expect(period.to_day).toBe("2026-10-05");
    expect(period.from_day).toBe("2026-09-06");
  });

  it("границы — полночь магазина: 1 сентября начинается в 21:00 UTC 31 августа, конец исключён", () => {
    expect(SEPTEMBER.from.toISOString()).toBe("2026-08-31T21:00:00.000Z");
    expect(SEPTEMBER.until.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(SEPTEMBER.days).toBe(30);
    expect(SEPTEMBER.is_default).toBe(false);
  });

  it("заказ в 01:30 по Москве попадает в свой день, а не во вчерашний по UTC", () => {
    const rows = saleRowsOf(
      [
        line({ ordered_at: "2026-09-04T22:30:00.000Z" }),
        line({ ordered_at: "2026-09-05T20:59:59.000Z" }),
        line({ ordered_at: "2026-09-05T21:00:00.000Z" }),
      ],
      SEPTEMBER,
    );

    expect(rows.map((row) => row.day)).toEqual(["2026-09-05", "2026-09-05", "2026-09-06"]);
  });

  it("заказ за минуту до начала периода и в первую минуту после конца в фолд не попадают", () => {
    const rows = saleRowsOf(
      [
        line({ ordered_at: "2026-08-31T20:59:00.000Z" }),
        line({ ordered_at: "2026-08-31T21:00:00.000Z" }),
        line({ ordered_at: "2026-09-30T20:59:59.999Z" }),
        line({ ordered_at: "2026-09-30T21:00:00.000Z" }),
        line({ ordered_at: null }),
      ],
      SEPTEMBER,
    );

    expect(rows.map((row) => row.day)).toEqual(["2026-09-01", "2026-09-30"]);
  });

  it("полуоткрытый период: «с 14 сентября» идёт до сегодня, «по 10 сентября» — 30 дней до него", () => {
    const since = resolveAnalyticsPeriod({ from: "2026-09-14" }, NOW, MSK);
    expect([since.from_day, since.to_day, since.days, since.is_default]).toEqual([
      "2026-09-14",
      "2026-09-30",
      17,
      false,
    ]);

    const till = resolveAnalyticsPeriod({ to: "2026-09-10" }, NOW, MSK);
    expect([till.from_day, till.to_day, till.days]).toEqual(["2026-08-12", "2026-09-10", 30]);
  });

  it("день в будущем не считается: конец периода останавливается на сегодня магазина", () => {
    const period = resolveAnalyticsPeriod({ from: "2026-09-20", to: "2026-12-31" }, NOW, MSK);

    expect(period.to_day).toBe("2026-09-30");
    expect(period.days).toBe(11);
  });

  it("испорченная дата, перевёрнутый период и период длиннее года — 400, а не молча другой период", () => {
    expect(invalidData(() => resolveAnalyticsPeriod({ from: "позавчера" }, NOW, MSK))).toMatch(/^from:/);
    expect(invalidData(() => resolveAnalyticsPeriod({ to: "2026-02-30" }, NOW, MSK))).toMatch(/^to:/);
    expect(invalidData(() => resolveAnalyticsPeriod({ from: "2026-09-20", to: "2026-09-10" }, NOW, MSK))).toMatch(
      /позже своего конца/,
    );
    expect(invalidData(() => resolveAnalyticsPeriod({ from: "2025-01-01", to: "2026-09-30" }, NOW, MSK))).toMatch(
      new RegExp(`${MAX_PERIOD_DAYS}`),
    );
  });

  it("полночь считается и для зоны западнее Гринвича", () => {
    expect(midnightIn("2026-09-01", "America/New_York").toISOString()).toBe("2026-09-01T04:00:00.000Z");
    expect(dayIn(new Date("2026-09-01T03:59:00.000Z"), "America/New_York")).toBe("2026-08-31");
  });

  it("в графике есть КАЖДЫЙ день периода, нулевые дни на месте", () => {
    const rows = saleRowsOf([line({ ordered_at: "2026-09-05T09:00:00.000Z" })], SEPTEMBER);
    const points = salesByDay(rows, SEPTEMBER);

    expect(points.map((point) => point.day)).toEqual(daysOf(SEPTEMBER));
    expect(points).toHaveLength(30);
    expect(points.find((point) => point.day === "2026-09-05")?.revenue).toBe(1000);
    /* Пустой день — это измеренный ноль, а не пропуск в линии. */
    expect(points.find((point) => point.day === "2026-09-06")).toEqual({
      day: "2026-09-06",
      revenue: 0,
      orders: 0,
      units: 0,
      cancelled_units: 0,
      cancelled_revenue: 0,
    });
  });
});

describe("что считается выручкой и заказом", () => {
  it("выручка строки = цена × количество; строка без количества — один товар", () => {
    const [two, missing] = saleRowsOf([line({ qty: 2, price: 450 }), line({ qty: null, price: 300 })], SEPTEMBER);

    expect(two.revenue).toBe(900);
    expect(missing.qty).toBe(1);
    expect(missing.revenue).toBe(300);
  });

  it("строка без цены НЕ бесплатная: выручка null, в сумму не идёт (правило 20a)", () => {
    const rows = saleRowsOf([line({ price: null }), line({ price: 500 })], SEPTEMBER);

    expect(rows[0].revenue).toBeNull();
    expect(totalsOf(totalsInput(rows)).revenue).toBe(500);
  });

  it("две строки одного заказа — один заказ и две позиции", () => {
    const rows = saleRowsOf(
      [line({ order_id: "same", card_id: "1" }), line({ order_id: "same", card_id: "2", qty: 2 })],
      SEPTEMBER,
    );
    const totals = totalsOf(totalsInput(rows));

    expect(totals.orders).toBe(1);
    expect(totals.units).toBe(3);
    expect(salesByDay(rows, SEPTEMBER).find((point) => point.day === "2026-09-02")?.orders).toBe(1);
  });

  it("отменённый заказ не входит в выручку и не исчезает", () => {
    const rows = saleRowsOf([line({ price: 1000 }), line({ price: 700, is_cancelled: true })], SEPTEMBER);
    const totals = totalsOf(totalsInput(rows));
    const day = salesByDay(rows, SEPTEMBER).find((point) => point.day === "2026-09-02");

    expect(totals.revenue).toBe(1000);
    expect(totals.orders).toBe(1);
    expect(totals.cancelled_orders).toBe(1);
    expect(totals.cancelled_revenue).toBe(700);
    expect(day).toMatchObject({ revenue: 1000, cancelled_revenue: 700, cancelled_units: 1 });
  });

  it("заказ без строк — заказ периода без штук и без выручки", () => {
    const rows = saleRowsOf(
      [line({ has_line: false, card_id: null, qty: null, price: null }), line({ price: 400 })],
      SEPTEMBER,
    );
    const totals = totalsOf(totalsInput(rows));

    expect(totals).toMatchObject({ orders: 2, units: 1, revenue: 400, avg_order: 200 });
    expect(salesByCard(rows).map((card) => card.card_id)).toEqual(["100"]);
  });

  it("пустой период — нули как измеренные, а среднего чека нет (null, не 0)", () => {
    const totals = totalsOf(totalsInput([]));

    expect(totals).toMatchObject({
      revenue: 0,
      orders: 0,
      units: 0,
      cancelled_orders: 0,
      cards_with_sales: 0,
      avg_order: null,
    });
  });

  it("копейки складываются без хвоста плавающей точки", () => {
    const rows = saleRowsOf([line({ price: 0.1 }), line({ price: 0.2 })], SEPTEMBER);

    expect(totalsOf(totalsInput(rows)).revenue).toBe(0.3);
  });
});

describe("товары с продажами", () => {
  const rows = saleRowsOf(
    [
      line({ card_id: "1", qty: 2, price: 500 }),
      line({ card_id: "1", qty: 1, price: 500, ordered_at: "2026-09-03T10:00:00.000Z" }),
      line({ card_id: "2", qty: 4, price: 100 }),
      line({ card_id: "3", qty: 1, price: 900, is_cancelled: true }),
    ],
    SEPTEMBER,
  );
  const cards = salesByCard(rows);

  it("в таблице только карточки, которые продались; карточка с одними отменами — не строка", () => {
    expect(cards.map((card) => card.card_id)).toEqual(["1", "2"]);
  });

  it("средняя цена — на ШТУКУ, доля — от выручки периода", () => {
    expect(cards[0]).toMatchObject({ revenue: 1500, units: 3, orders: 2, avg_price: 500, revenue_share: 78.95 });
    expect(cards[1]).toMatchObject({ revenue: 400, units: 4, orders: 1, avg_price: 100, revenue_share: 21.05 });
  });
});

/** Cards with the given revenues, biggest first, as `salesByCard` returns them. */
const cardsWith = (revenues: number[]): CardSales[] =>
  revenues.map((revenue, index) => ({
    card_id: String(index + 1),
    vendor_code: null,
    revenue,
    units: 1,
    orders: 1,
    avg_price: revenue,
    revenue_share: 0,
  }));

const shareOf = (cards: CardSales[], classes: Map<string, string>, wanted: string[]) => {
  const total = cards.reduce((sum, card) => sum + card.revenue, 0);
  const sum = cards
    .filter((card) => wanted.includes(classes.get(cardKey(card.card_id)) ?? ""))
    .reduce((acc, card) => acc + card.revenue, 0);
  return (sum / total) * 100;
};

describe("ABC по выручке, 80/95", () => {
  it("A вместе держат не больше 80 %, A и B — не больше 95 %", () => {
    /* 140 карточек с убывающей выручкой, как на стенде. */
    const cards = cardsWith(Array.from({ length: 140 }, (_, index) => Math.round(100_000 / (index + 1) ** 0.9)));
    const classes = abcOf(cards);

    expect(shareOf(cards, classes, ["A"])).toBeLessThanOrEqual(ABC_BOUNDS.a);
    expect(shareOf(cards, classes, ["A", "B"])).toBeLessThanOrEqual(ABC_BOUNDS.b);
    expect([...classes.values()]).toEqual(expect.arrayContaining(["A", "B", "C"]));
  });

  it("карточка, на которой накопленная доля ровно 80 %, ещё A; следующая — B", () => {
    const classes = abcOf(cardsWith([50, 30, 15, 5]));

    expect([...classes.values()]).toEqual(["A", "A", "B", "C"]);
  });

  it("карточка, перешагнувшая 80 %, уже не A", () => {
    const classes = abcOf(cardsWith([60, 30, 6, 4]));

    expect([...classes.values()]).toEqual(["A", "B", "C", "C"]);
  });

  it("единственная главная карточка — A, даже если одна держит больше 80 %", () => {
    expect([...abcOf(cardsWith([85, 8, 7])).values()]).toEqual(["A", "B", "C"]);
    expect([...abcOf(cardsWith([1000])).values()]).toEqual(["A"]);
  });

  it("карточка без выручки — C, и нулевой период не делится на ноль", () => {
    expect([...abcOf(cardsWith([0, 0])).values()]).toEqual(["C", "C"]);
  });
});

describe("XYZ по неделям", () => {
  /** One line of `qty` units of card `card` on the shop day `day`, at noon in Moscow. */
  const on = (day: string, qty: number, card = "1") =>
    line({ card_id: card, qty, ordered_at: `${day}T09:00:00.000Z` });

  /** 28 days: four whole weeks, 2026-09-03 … 2026-09-30. */
  const FOUR_WEEKS = resolveAnalyticsPeriod({ from: "2026-09-03", to: "2026-09-30" }, NOW, MSK);

  it("недели отсчитываются от конца периода; 30 дней — четыре недели, два дня в начале не входят", () => {
    expect(weeksOf(SEPTEMBER)).toEqual([
      { start: "2026-09-03", end: "2026-09-09" },
      { start: "2026-09-10", end: "2026-09-16" },
      { start: "2026-09-17", end: "2026-09-23" },
      { start: "2026-09-24", end: "2026-09-30" },
    ]);
  });

  it("ровный спрос — X, умеренный — Y, рваный — Z", () => {
    const rows = saleRowsOf(
      [
        on("2026-09-05", 10, "steady"),
        on("2026-09-12", 10, "steady"),
        on("2026-09-19", 10, "steady"),
        on("2026-09-26", 10, "steady"),
        on("2026-09-05", 8, "mid"),
        on("2026-09-12", 12, "mid"),
        on("2026-09-19", 8, "mid"),
        on("2026-09-26", 12, "mid"),
        on("2026-09-05", 40, "rare"),
        on("2026-09-26", 1, "rare"),
      ],
      FOUR_WEEKS,
    );
    const cards = salesByCard(rows);
    const xyz = xyzOf(rows, cards, FOUR_WEEKS, new Map());

    expect(xyz.get("steady")).toEqual({ xyz: "X", variation: 0, weeks: 4 });
    expect(xyz.get("mid")).toEqual({ xyz: "Y", variation: 20, weeks: 4 });
    expect(xyz.get("rare")?.xyz).toBe("Z");
  });

  it("период короче трёх недель класса не даёт никому: null, а не Z (правило 20a)", () => {
    const short = resolveAnalyticsPeriod({ from: "2026-09-17", to: "2026-09-30" }, NOW, MSK);
    const rows = saleRowsOf([on("2026-09-18", 5), on("2026-09-25", 5)], short);
    const xyz = xyzOf(rows, salesByCard(rows), short, new Map());

    expect(weeksOf(short)).toHaveLength(2);
    expect(xyz.get("1")).toEqual({ xyz: null, variation: null, weeks: 2 });
  });

  it(`недели данных — от первого заказа карточки: меньше ${XYZ_MIN_WEEKS} — null`, () => {
    const rows = saleRowsOf(
      [on("2026-09-18", 5, "new"), on("2026-09-25", 5, "new"), on("2026-09-18", 5, "old"), on("2026-09-25", 5, "old")],
      FOUR_WEEKS,
    );
    const firstDay = new Map([
      ["new", "2026-09-17"],
      ["old", "2026-05-30"],
    ]);
    const xyz = xyzOf(rows, salesByCard(rows), FOUR_WEEKS, firstDay);

    /* Новинка продаётся две недели: сравнивать не с чем. */
    expect(xyz.get("new")).toEqual({ xyz: null, variation: null, weeks: 2 });
    /* Старая карточка две недели не продавалась — это измеренные нули, и спрос рваный. */
    expect(xyz.get("old")?.weeks).toBe(4);
    expect(xyz.get("old")?.xyz).toBe("Z");
  });

  it("неделя, в середине которой карточка появилась, не считается", () => {
    const rows = saleRowsOf(
      [on("2026-09-08", 20), on("2026-09-12", 5), on("2026-09-19", 5), on("2026-09-26", 5)],
      FOUR_WEEKS,
    );
    const xyz = xyzOf(rows, salesByCard(rows), FOUR_WEEKS, new Map([["1", "2026-09-08"]]));

    expect(xyz.get("1")).toEqual({ xyz: "X", variation: 0, weeks: 3 });
  });

  it("продажи только в отброшенных днях начала периода класса не дают", () => {
    const rows = saleRowsOf([on("2026-09-01", 9)], SEPTEMBER);
    const xyz = xyzOf(rows, salesByCard(rows), SEPTEMBER, new Map());

    expect(xyz.get("1")).toEqual({ xyz: null, variation: null, weeks: 4 });
  });
});

describe("дней до нуля", () => {
  it("остаток ÷ темп за ВЕСЬ период, целые дни вниз", () => {
    /* 30 штук за 30 дней — штука в день; 45 штук хватит на 45 дней. */
    expect(daysToZero(45, 30, 30)).toBe(45);
    /* 10 штук за 30 дней — треть в день; 2 штуки — это 6 дней. */
    expect(daysToZero(2, 10, 30)).toBe(6);
    expect(daysToZero(1, 7, 30)).toBe(4);
  });

  it("нет остатка — нет и «дней до нуля»; нет продаж — тоже null, а не ноль дней", () => {
    expect(daysToZero(null, 10, 30)).toBeNull();
    expect(daysToZero(100, 0, 30)).toBeNull();
  });

  it("остаток ноль при продажах — это ноль дней: товар уже кончился", () => {
    expect(daysToZero(0, 10, 30)).toBe(0);
    expect(daysToZero(-3, 10, 30)).toBe(0);
  });
});

describe("заявленный остаток", () => {
  it("одно и то же ненулевое число в половине строк и больше — похоже на заявленный", () => {
    expect(stockLooksDeclared({ lines: 11_824, dominant_value: 100, dominant_lines: 7_786 })).toBe(true);
  });

  it("разные числа, нули и одна строка предупреждения не дают", () => {
    expect(stockLooksDeclared({ lines: 10, dominant_value: 7, dominant_lines: 3 })).toBe(false);
    expect(stockLooksDeclared({ lines: 10, dominant_value: 0, dominant_lines: 9 })).toBe(false);
    expect(stockLooksDeclared({ lines: 1, dominant_value: 100, dominant_lines: 1 })).toBe(false);
    expect(stockLooksDeclared({ lines: 0, dominant_value: null, dominant_lines: 0 })).toBe(false);
  });
});

describe("итоги и строки таблицы", () => {
  const rows = saleRowsOf(
    [
      line({ card_id: "1", qty: 20, price: 100, ordered_at: "2026-09-05T10:00:00.000Z" }),
      line({ card_id: "2", qty: 10, price: 50, ordered_at: "2026-09-20T10:00:00.000Z" }),
      line({ card_id: "2", qty: 1, price: 50, is_cancelled: true }),
    ],
    SEPTEMBER,
  );
  const cards = salesByCard(rows);
  const totals = totalsOf(totalsInput(rows, 300));
  const table = cardRowsOf({
    marketplace: "wb",
    cards,
    abc: abcOf(cards),
    xyz: xyzOf(rows, cards, SEPTEMBER, new Map()),
    stock: new Map<string, number | null>([
      ["1", 10],
      ["2", null],
    ]),
    info: new Map([["1", { id: "mpprod_1", title: "Мумиё", vendor_code: "MUM-1", thumbnail: "https://x/1.jpg" }]]),
    period: SEPTEMBER,
  });

  it("итоги сходятся с суммой по дням и с суммой по карточкам", () => {
    const days = salesByDay(rows, SEPTEMBER);

    expect(totals.revenue).toBe(days.reduce((sum, day) => sum + day.revenue, 0));
    expect(totals.revenue).toBe(cards.reduce((sum, card) => sum + card.revenue, 0));
    expect(totals.units).toBe(days.reduce((sum, day) => sum + day.units, 0));
    expect(totals.orders).toBe(days.reduce((sum, day) => sum + day.orders, 0));
    expect(totals).toMatchObject({ revenue: 2500, orders: 2, units: 30, avg_order: 1250, cancelled_orders: 1 });
    expect(totals).toMatchObject({ cards_with_sales: 2, cards_total: 423 });
  });

  it("склада хватит на: сумма остатков ÷ общий темп", () => {
    /* 30 штук за 30 дней — штука в день; 300 штук — 300 дней. */
    expect(totals.stock_units).toBe(300);
    expect(totals.stock_days_left).toBe(300);
    expect(totalsOf(totalsInput(rows, null)).stock_days_left).toBeNull();
  });

  it("строка несёт карточку магазина, класс и дни; неизвестная карточка — без выдуманного названия", () => {
    expect(table[0]).toEqual({
      id: "mpprod_1",
      external_id: "1",
      vendor_code: "MUM-1",
      title: "Мумиё",
      thumbnail: "https://x/1.jpg",
      revenue: 2000,
      units: 20,
      orders: 1,
      avg_price: 100,
      revenue_share: 80,
      abc: "A",
      xyz: "Z",
      stock: 10,
      days_to_zero: 15,
      // v3 (t-2026-10-16-36): nothing given for them here, so nothing is said.
      category: null,
      revenue_previous: null,
      discount: null,
      warehouses: [],
    });
    expect(table[1]).toMatchObject({ id: "wb:2", title: null, vendor_code: "V-100", stock: null, days_to_zero: null });
  });
});

describe("поиск, сортировка и страницы таблицы", () => {
  const row = (over: Partial<CardRow>): CardRow => ({
    id: "x",
    external_id: "x",
    vendor_code: null,
    title: null,
    thumbnail: null,
    revenue: 0,
    units: 0,
    orders: 0,
    avg_price: null,
    revenue_share: 0,
    abc: "C",
    xyz: null,
    stock: null,
    days_to_zero: null,
    category: null,
    revenue_previous: null,
    discount: null,
    warehouses: [],
    ...over,
  });
  const rows = [
    row({ id: "a", title: "Мумиё алтайское", vendor_code: "MUM-1", revenue: 900, units: 3, days_to_zero: 40 }),
    row({ id: "b", title: "Мазь с АСД", vendor_code: "ASD-2", revenue: 500, units: 9, days_to_zero: null }),
    row({ id: "c", title: "Иван-чай", vendor_code: "CHAI-mum", revenue: 100, units: 1, days_to_zero: 2 }),
  ];

  it("по умолчанию — по убыванию выручки, 20 на страницу; лимит не больше 200", () => {
    expect(resolveCardsQuery({})).toEqual({
      q: null,
      sort: { field: "revenue", desc: true },
      limit: 20,
      offset: 0,
      category: null,
      discount: null,
      warehouse: null,
      abc: null,
      runs_out: false,
    });
    expect(resolveCardsQuery({ limit: "5000", offset: "-3" })).toMatchObject({ limit: 200, offset: 0 });
    expect(resolveCardsQuery({ order: "-title" }).sort).toEqual({ field: "revenue", desc: true });
  });

  it("q ищет по названию и по артикулу, без учёта регистра", () => {
    const found = selectCards(rows, resolveCardsQuery({ q: "MUM" }));

    expect(found.rows.map((one) => one.id)).toEqual(["a", "c"]);
    expect(found.count).toBe(2);
  });

  it("«дней до нуля» без числа — последними в обе стороны", () => {
    expect(selectCards(rows, resolveCardsQuery({ order: "days_to_zero" })).rows.map((one) => one.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(selectCards(rows, resolveCardsQuery({ order: "-days_to_zero" })).rows.map((one) => one.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("сортировка по штукам и страница считаются после поиска; count — все совпавшие", () => {
    const page = selectCards(rows, resolveCardsQuery({ order: "-units", limit: "1", offset: "1" }));

    expect(page.rows.map((one) => one.id)).toEqual(["a"]);
    expect(page.count).toBe(3);
  });
});

describe("рейтинг продавца", () => {
  const base = { label: "Wildberries", endpoint: "analytics.item-rating", lastCall: null, stored: null };

  it("число есть только когда импорт его сохранил, с датой замера", () => {
    expect(sellerRating({ ...base, hasKey: true, stored: { value: 4.8, scale: 5, at: "2026-10-04T10:00:00.000Z" } }))
      .toMatchObject({ value: 4.8, scale: 5, state: "ok", as_of: "2026-10-04T10:00:00.000Z" });
  });

  it("нет ключа — так и сказано, без числа", () => {
    expect(sellerRating({ ...base, hasKey: false })).toMatchObject({ value: null, state: "no_key", support: null });
  });

  it("площадка отказала — её ответ словами, техническое — для поддержки", () => {
    const rating = sellerRating({
      ...base,
      hasKey: true,
      lastCall: {
        endpoint_id: "analytics.item-rating",
        status: 403,
        error: "token does not satisfy additional requirements",
        fetched_at: "2026-09-16T05:00:00.000Z",
      },
    });

    expect(rating).toMatchObject({ value: null, state: "refused", as_of: "2026-09-16T05:00:00.000Z" });
    expect(rating.detail).toMatch(/персональный или сервисный токен/);
    expect(rating.detail).not.toMatch(/403|item-rating/);
    expect(rating.support).toBe("analytics.item-rating: HTTP 403 · token does not satisfy additional requirements");
  });

  it("никто не спрашивал — «не загружается», а не пустая звезда", () => {
    const rating = sellerRating({ ...base, hasKey: true });

    expect(rating).toMatchObject({ value: null, state: "not_imported", as_of: null });
    expect(rating.support).toMatch(/нет ни одного вызова/);
  });
});
