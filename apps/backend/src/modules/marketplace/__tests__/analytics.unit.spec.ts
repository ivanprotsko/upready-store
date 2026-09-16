import {
  ABC_BOUNDS,
  XYZ_BOUNDS,
  abcClasses,
  cardKey,
  cardRowsOf,
  daysOf,
  resolvePeriod,
  saleRowsOf,
  salesByCard,
  salesByDay,
  totalsOf,
  turnoverRows,
  xyzBucketOf,
  xyzClasses,
  type RawLineWithOrder,
} from "../analytics";

/**
 * The arithmetic of the seller dashboard (w19-mp-analytics).
 *
 * Every case here is a number a shop owner could argue with, so each test
 * pins the number AND the reason it is that number: which rows count, which
 * do not, and what an absent value does. The screen prints the same formulas
 * these tests assert.
 */

const PERIOD = resolvePeriod(
  { from: "2026-09-01", to: "2026-09-30" },
  new Date("2026-09-30T12:00:00.000Z"),
);

const line = (over: Partial<RawLineWithOrder> = {}): RawLineWithOrder => ({
  marketplace: "wb",
  ordered_at: "2026-09-02T10:00:00.000Z",
  is_cancelled: false,
  currency: "RUB",
  card_id: "100",
  vendor_code: "V-100",
  title: "Мумиё",
  qty: 1,
  price: 1000,
  ...over,
});

describe("период и дни", () => {
  it("30 дней сентября — это 30 дней, обе границы включительно", () => {
    expect(PERIOD.days).toBe(30);
    expect(PERIOD.from_day).toBe("2026-09-01");
    expect(PERIOD.to_day).toBe("2026-09-30");
    expect(daysOf(PERIOD)).toHaveLength(30);
  });

  it("в графике есть КАЖДЫЙ день периода, даже пустой", () => {
    const rows = saleRowsOf([line({ ordered_at: "2026-09-05T00:00:00.000Z" })], PERIOD);
    const points = salesByDay(rows, PERIOD);

    expect(points).toHaveLength(30);
    expect(points.find((point) => point.day === "2026-09-05")?.revenue).toBe(1000);
    /* Пустой день — это измеренный ноль, а не пропуск в линии. */
    expect(points.find((point) => point.day === "2026-09-06")?.revenue).toBe(0);
    expect(points.find((point) => point.day === "2026-09-06")?.units).toBe(0);
  });
});

describe("что считается выручкой", () => {
  it("выручка строки = цена × количество", () => {
    const rows = saleRowsOf([line({ qty: 3, price: 250 })], PERIOD);
    expect(rows[0].revenue).toBe(750);
  });

  it("строка без количества — это один товар (так говорит и WB, и Ozon)", () => {
    const rows = saleRowsOf([line({ qty: null, price: 500 })], PERIOD);
    expect(rows[0].qty).toBe(1);
    expect(rows[0].revenue).toBe(500);
  });

  it("строка без цены НЕ бесплатная: выручка null, а не ноль (правило 20a)", () => {
    const rows = saleRowsOf([line({ price: null })], PERIOD);
    expect(rows[0].revenue).toBeNull();
  });

  it("отменённый заказ не входит в выручку и не исчезает", () => {
    const rows = saleRowsOf(
      [line({ price: 1000 }), line({ price: 400, is_cancelled: true })],
      PERIOD,
    );
    const day = salesByDay(rows, PERIOD).find((point) => point.day === "2026-09-02")!;

    expect(day.revenue).toBe(1000);
    expect(day.units).toBe(1);
    expect(day.cancelled_units).toBe(1);
    expect(day.cancelled_revenue).toBe(400);
  });

  it("заказ вне периода и заказ без даты в фолд не попадают", () => {
    const rows = saleRowsOf(
      [
        line({ ordered_at: "2026-08-31T23:00:00.000Z" }),
        line({ ordered_at: null }),
        line({ ordered_at: "2026-09-10T00:00:00.000Z" }),
      ],
      PERIOD,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].day).toBe("2026-09-10");
  });
});

describe("по карточкам", () => {
  const rows = saleRowsOf(
    [
      line({ card_id: "100", qty: 2, price: 1000, ordered_at: "2026-09-02T00:00:00.000Z" }),
      line({ card_id: "100", qty: 1, price: 800, ordered_at: "2026-09-03T00:00:00.000Z" }),
      line({ card_id: "200", qty: 1, price: 300, ordered_at: "2026-09-04T00:00:00.000Z" }),
      line({ card_id: "200", qty: 5, price: 300, is_cancelled: true }),
    ],
    PERIOD,
  );
  const cards = salesByCard(rows);

  it("карточки идут по убыванию выручки", () => {
    expect(cards.map((card) => card.card_id)).toEqual(["100", "200"]);
    expect(cards[0].revenue).toBe(2800);
    expect(cards[1].revenue).toBe(300);
  });

  it("средняя цена — на ШТУКУ, а не на заказ", () => {
    /* 2800 ₽ за 3 штуки, а не за 2 заказа. */
    expect(cards[0].units).toBe(3);
    expect(cards[0].avg_price).toBeCloseTo(2800 / 3, 6);
  });

  it("доли складываются в сто процентов", () => {
    const sum = cards.reduce((total, card) => total + card.revenue_share, 0);
    expect(sum).toBeCloseTo(100, 6);
  });

  it("отмены карточки видны отдельной цифрой", () => {
    expect(cards[1].cancelled_units).toBe(5);
    expect(cards[1].units).toBe(1);
  });

  it("дни с продажами считаются по разным датам, а не по числу строк", () => {
    expect(cards[0].days_with_sales).toBe(2);
  });

  it("одна и та же карточка на двух площадках — две строки", () => {
    const both = salesByCard(
      saleRowsOf([line({ card_id: "100" }), line({ card_id: "100", marketplace: "ozon" })], PERIOD),
    );
    expect(both).toHaveLength(2);
  });
});

describe("ABC по выручке", () => {
  const cards = salesByCard(
    saleRowsOf(
      [
        line({ card_id: "A", price: 8000 }),
        line({ card_id: "B", price: 1600 }),
        line({ card_id: "C", price: 400 }),
      ],
      PERIOD,
    ),
  );

  it("первая карточка, перешагнувшая границу, ещё A", () => {
    const abc = abcClasses(cards);
    /* 80 % ровно на первой карточке: без этого правила у магазина не было бы A вовсе. */
    expect(abc.get(cardKey("wb", "A"))?.abc).toBe("A");
    expect(abc.get(cardKey("wb", "A"))?.cumulative_share).toBeCloseTo(80, 6);
  });

  it("B — до 95 %, дальше C", () => {
    const abc = abcClasses(cards);
    /* 8000 / 1600 / 400 из 10 000: накопленные доли 80 %, 96 %, 100 %. */
    expect(abc.get(cardKey("wb", "B"))?.abc).toBe("B");
    expect(abc.get(cardKey("wb", "B"))?.cumulative_share).toBeCloseTo(96, 6);
    expect(abc.get(cardKey("wb", "C"))?.abc).toBe("C");
    expect(ABC_BOUNDS).toEqual({ a: 80, b: 95 });
  });

  it("единственная карточка магазина — это A, а не C", () => {
    const one = salesByCard(saleRowsOf([line({ card_id: "ONE", price: 100 })], PERIOD));
    expect(abcClasses(one).get(cardKey("wb", "ONE"))?.abc).toBe("A");
  });

  it("нулевая выручка не делится на ноль", () => {
    const none = salesByCard(saleRowsOf([line({ price: 0 })], PERIOD));
    expect(() => abcClasses(none)).not.toThrow();
    expect(none[0].revenue_share).toBe(0);
  });
});

describe("XYZ по стабильности спроса", () => {
  it("период от трёх недель считается по НЕДЕЛЯМ", () => {
    expect(xyzBucketOf(PERIOD)).toBe("week");
    expect(
      xyzBucketOf(resolvePeriod({ from: "2026-09-01", to: "2026-09-07" }, new Date())),
    ).toBe("day");
  });

  it("ровный спрос — X, рваный — Z", () => {
    /* Одна штука в каждую из пяти недель против пяти штук в одну. */
    const steady = [2, 9, 16, 23, 30].map((day) =>
      line({ card_id: "STEADY", ordered_at: `2026-09-${String(day).padStart(2, "0")}T00:00:00.000Z` }),
    );
    const spiky = [line({ card_id: "SPIKY", qty: 5, ordered_at: "2026-09-02T00:00:00.000Z" })];

    const rows = saleRowsOf([...steady, ...spiky], PERIOD);
    const cards = salesByCard(rows);
    const xyz = xyzClasses(rows, cards, PERIOD);

    expect(xyz.bucket).toBe("week");
    expect(xyz.rows.get(cardKey("wb", "STEADY"))?.xyz).toBe("X");
    expect(xyz.rows.get(cardKey("wb", "STEADY"))?.variation).toBeCloseTo(0, 6);
    expect(xyz.rows.get(cardKey("wb", "SPIKY"))?.xyz).toBe("Z");
    expect(XYZ_BOUNDS).toEqual({ x: 10, y: 25 });
  });

  it("класса нет, когда сравнивать нечего — и это не Z (правило 20a)", () => {
    const rows = saleRowsOf([line({ card_id: "DEAD", is_cancelled: true })], PERIOD);
    const cards = salesByCard(rows);
    const xyz = xyzClasses(rows, cards, PERIOD);

    expect(cards[0].units).toBe(0);
    expect(xyz.rows.get(cardKey("wb", "DEAD"))?.xyz).toBeNull();
    expect(xyz.rows.get(cardKey("wb", "DEAD"))?.variation).toBeNull();
  });

  it("формула названа на экране вместе с интервалом", () => {
    const rows = saleRowsOf([line()], PERIOD);
    const xyz = xyzClasses(rows, salesByCard(rows), PERIOD);
    expect(xyz.formula).toContain("CV");
    expect(xyz.formula).toContain("неделям");
    expect(xyz.formula).toContain("10 %");
  });
});

describe("оборачиваемость и дней до нуля", () => {
  const rows = saleRowsOf(
    [line({ card_id: "100", qty: 30, price: 100, ordered_at: "2026-09-02T00:00:00.000Z" })],
    PERIOD,
  );
  const cards = salesByCard(rows);

  it("темп — за ВЕСЬ период, а не за дни с продажами", () => {
    const turnover = turnoverRows(
      cards,
      [{ marketplace: "wb", card_id: "100", stock: 60, reserved: 5, measured_at: "2026-09-30T00:00:00.000Z" }],
      PERIOD,
    );
    const row = turnover.get(cardKey("wb", "100"))!;

    /* 30 штук за 30 дней = 1 штука в день; 60 на складе = 60 дней. */
    expect(row.rate_per_day).toBe(1);
    expect(row.stock).toBe(60);
    expect(row.days_to_zero).toBe(60);
    expect(row.zero_on).toBe("2026-11-29");
  });

  it("остаток по карточке — сумма строк mp_offer (размер × склад)", () => {
    const turnover = turnoverRows(
      cards,
      [
        { marketplace: "wb", card_id: "100", stock: 10, reserved: null, measured_at: null },
        { marketplace: "wb", card_id: "100", stock: 20, reserved: null, measured_at: null },
      ],
      PERIOD,
    );
    const row = turnover.get(cardKey("wb", "100"))!;
    expect(row.stock).toBe(30);
    expect(row.offer_lines).toBe(2);
  });

  it("нет остатка — нет и «дней до нуля», а не «ноль дней»", () => {
    const turnover = turnoverRows(
      cards,
      [{ marketplace: "wb", card_id: "100", stock: null, reserved: null, measured_at: null }],
      PERIOD,
    );
    expect(turnover.get(cardKey("wb", "100"))?.stock).toBeNull();
    expect(turnover.get(cardKey("wb", "100"))?.days_to_zero).toBeNull();
  });

  it("остаток без продаж — отдельная строка, а не пропавший склад", () => {
    const turnover = turnoverRows(
      cards,
      [
        { marketplace: "wb", card_id: "100", stock: 60, reserved: null, measured_at: null },
        { marketplace: "wb", card_id: "999", stock: 12, reserved: null, measured_at: null },
      ],
      PERIOD,
    );
    const dead = turnover.get(cardKey("wb", "999"))!;
    expect(dead.stock).toBe(12);
    expect(dead.rate_per_day).toBe(0);
    /* Продаж нет — срок «до нуля» не определён, а не бесконечность и не ноль. */
    expect(dead.days_to_zero).toBeNull();
  });
});

describe("итоги и таблица экрана", () => {
  const rows = saleRowsOf(
    [
      line({ card_id: "100", qty: 2, price: 1000 }),
      line({ card_id: "200", qty: 1, price: 500 }),
      line({ card_id: "200", qty: 1, price: 500, is_cancelled: true }),
    ],
    PERIOD,
  );
  const cards = salesByCard(rows);
  const turnover = turnoverRows(
    cards,
    [{ marketplace: "wb", card_id: "100", stock: 90, reserved: null, measured_at: null }],
    PERIOD,
  );

  it("итоги сходятся со суммой по дням и со суммой по карточкам", () => {
    const totals = totalsOf(rows, cards, turnover, PERIOD);
    const byDay = salesByDay(rows, PERIOD).reduce((sum, point) => sum + point.revenue, 0);
    const byCard = cards.reduce((sum, card) => sum + card.revenue, 0);

    expect(totals.revenue).toBe(2500);
    expect(byDay).toBe(totals.revenue);
    expect(byCard).toBe(totals.revenue);
    expect(totals.units).toBe(3);
    expect(totals.orders).toBe(2);
    expect(totals.cancelled_orders).toBe(1);
    expect(totals.avg_order).toBe(1250);
  });

  it("на сколько дней хватит склада — из суммы остатков и общего темпа", () => {
    const totals = totalsOf(rows, cards, turnover, PERIOD);
    /* 3 штуки за 30 дней = 0,1 в день; 90 на складе = 900 дней. */
    expect(totals.stock_units).toBe(90);
    expect(totals.stock_days_left).toBe(900);
  });

  it("в строке таблицы стоят все классы сразу, а карточка без класса XYZ — null", () => {
    const abc = abcClasses(cards);
    const xyz = xyzClasses(rows, cards, PERIOD);
    const table = cardRowsOf(cards, abc, xyz.rows, turnover);

    expect(table[0].abc).toBe("A");
    /*
     * ПО КАРТОЧКЕ, а не по магазину: у карточки 100 продано 2 штуки за 30 дней
     * (0,0667 шт/день), остаток 90 → 1350 дней. Итоговые 900 дней склада выше
     * считаются от ОБЩЕГО темпа (3 штуки), и это два разных вопроса, а не два
     * ответа на один.
     */
    expect(table[0].turnover.days_to_zero).toBe(1350);
    expect(table.every((row) => row.xyz === null || ["X", "Y", "Z"].includes(row.xyz))).toBe(true);
  });
});
