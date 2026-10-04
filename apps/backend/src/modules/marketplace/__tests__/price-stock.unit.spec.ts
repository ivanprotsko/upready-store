import {
  aggregateLines,
  buildPriceStockRows,
  filterPriceStockRows,
  freshnessOf,
  highlightOf,
  lastImportOf,
  measuredOf,
  offersWithoutCard,
  parsePriceStockQuery,
  priceStockCounts,
  priceStockCsvCells,
  priceStockCsvColumns,
  sortPriceStockRows,
  staleAfterMs,
  toPriceStockCsv,
  type BuildPriceStockInput,
  type PriceStockCard,
  type PriceStockImport,
  type PriceStockLine,
  type PriceStockRow,
  type PriceStockVariant,
} from "../price-stock";
import { MP_SYNC_INTERVAL_MS } from "../schedule";

/**
 * The decisions of «Wildberries → Цены и остатки» (mp-section-design task-03;
 * the aggregation and freshness rules are w17's).
 *
 * The claims the screen makes, and the ones this file exists to keep honest:
 *
 *   1. the stock on a row IS the sum of its warehouse and size lines, and a
 *      line that said nothing is not a zero;
 *   2. the row is the card, «Есть везде» is a card with a live `mp_link`, and
 *      the three states partition the table;
 *   3. a gap is highlighted by the thresholds the query carried, a zero gap
 *      never is, and «по расхождению» sorts by the size of the gap;
 *   4. a number is never shown fresher than the import that brought it;
 *   5. the file has the table's rows and the table's columns, in its order.
 */

const MINUTE = 60_000;
const NOW = new Date("2026-10-05T04:00:00.000Z");

const at = (minutesAgo: number): string => new Date(NOW.getTime() - minutesAgo * MINUTE).toISOString();

const line = (over: Partial<PriceStockLine> & Pick<PriceStockLine, "external_id">): PriceStockLine => ({
  marketplace: "wb",
  offer_key: `${over.external_id}|${over.size_external ?? ""}|${over.warehouse_id ?? ""}`,
  vendor_code: "ART-1",
  size_external: null,
  sku_external: null,
  storage_type: null,
  warehouse_id: null,
  warehouse_name: null,
  price: 1000,
  discount_price: 800,
  currency: "RUB",
  stock: null,
  reserved: null,
  measured_at: at(1),
  ...over,
});

const card = (over: Partial<PriceStockCard> = {}): PriceStockCard => ({
  id: "mpprod_100",
  external_id: "100",
  vendor_code: "ART-1",
  title: "Карточка",
  thumbnail: null,
  ...over,
});

const variant = (over: Partial<PriceStockVariant> = {}): PriceStockVariant => ({
  id: "var_1",
  product_id: "prod_1",
  product_title: "Товар магазина",
  thumbnail: null,
  sku: "ART-1",
  prices: { rub: 1000 },
  stock: 5,
  ...over,
});

const succeeded = (over: Partial<PriceStockImport> = {}): PriceStockImport => ({
  marketplace: "wb",
  kind: "prices",
  status: "succeeded",
  finished_at: at(1),
  ...over,
});

const LINKED = { external_id: "100", product_id: "prod_1", variant_id: "var_1" };

const build = (over: Partial<BuildPriceStockInput> = {}): PriceStockRow[] =>
  buildPriceStockRows({
    marketplace: "wb",
    cards: [card()],
    lines: [line({ external_id: "100", stock: 7, warehouse_id: "wh-1" })],
    links: [LINKED],
    variants: [variant()],
    imports: [succeeded(), succeeded({ kind: "stocks" })],
    currency: "RUB",
    now: NOW,
    ...over,
  });

const rowOf = (rows: PriceStockRow[], id: string): PriceStockRow => {
  const row = rows.find((entry) => entry.id === id);
  if (!row) {
    throw new Error(`row ${id} not built`);
  }
  return row;
};

describe("остаток строки = сумма строк по складам и размерам", () => {
  const warehouses = Array.from({ length: 7 }, (_, index) =>
    line({
      external_id: "100",
      warehouse_id: `wh-${index}`,
      warehouse_name: `Склад ${index}`,
      size_external: `size-${index % 3}`,
      stock: index * 3 + 1,
      reserved: 1,
    }),
  );

  it("сумма считается по строкам, которые остаток НАЗВАЛИ", () => {
    const aggregate = aggregateLines(warehouses);
    const expected = warehouses.reduce((sum, entry) => sum + (entry.stock ?? 0), 0);

    expect(aggregate.stock).toBe(expected);
    expect(aggregate.stock_lines).toBe(7);
    expect(aggregate.warehouses).toBe(7);
    expect(aggregate.sizes).toBe(3);
    expect(aggregate.reserved).toBe(7);
  });

  it("строка без остатка сумму не меняет и нулём не становится", () => {
    const withSilent = [...warehouses, line({ external_id: "100", warehouse_id: "wh-silent" })];
    const aggregate = aggregateLines(withSilent);

    expect(aggregate.stock).toBe(aggregateLines(warehouses).stock);
    expect(aggregate.lines).toBe(8);
    expect(aggregate.stock_lines).toBe(7);
  });

  it("когда остаток не назвал НИКТО — это null, а не ноль (правило 20a), и времени замера остатка нет", () => {
    expect(aggregateLines([line({ external_id: "100" })]).stock).toBeNull();
    const row = build({ lines: [line({ external_id: "100" })] })[0];
    expect(row.mp?.stock).toBeNull();
    expect(row.diff.stock_abs).toBeNull();
    expect(row.mp?.stock_measured_at).toBeNull();
    expect(row.mp?.price_measured_at).toBe(at(1));
  });

  it("настоящий ноль площадки остаётся нулём и даёт расхождение", () => {
    const row = build({ lines: [line({ external_id: "100", stock: 0, warehouse_id: "wh-1" })] })[0];
    expect(row.mp?.stock).toBe(0);
    expect(row.diff.stock_abs).toBe(-5);
  });

  it("строка таблицы несёт ровно эту сумму и счёт строк, складов и размеров", () => {
    const row = build({ lines: warehouses })[0];

    expect(row.mp?.stock).toBe(aggregateLines(warehouses).stock);
    expect(row.mp).toMatchObject({ lines: 7, warehouses: 7, sizes: 3, reserved: 7 });
  });

  it("цена — наименьшая, и со скидкой предпочтительнее", () => {
    const aggregate = aggregateLines([
      line({ external_id: "100", price: 1200, discount_price: 900 }),
      line({ external_id: "100", price: 1000, discount_price: 850 }),
    ]);

    expect(aggregate.price).toBe(1000);
    expect(aggregate.discount_price).toBe(850);
    expect(aggregate.effective_price).toBe(850);
    expect(aggregate.effective_basis).toBe("discount_price");
  });

  it("без скидки основанием становится обычная цена", () => {
    const aggregate = aggregateLines([line({ external_id: "100", price: 1200, discount_price: null })]);

    expect(aggregate.effective_price).toBe(1200);
    expect(aggregate.effective_basis).toBe("price");
  });
});

describe("строка — карточка, связь — mp_link", () => {
  it("карточка со связью — «Есть везде», с числами магазина в валюте площадки", () => {
    const row = build()[0];

    expect(row).toMatchObject({
      id: "mpprod_100",
      card_id: "mpprod_100",
      external_id: "100",
      state: "both",
      currency: "RUB",
      shop: { product_id: "prod_1", variant_id: "var_1", price: 1000, stock: 5 },
    });
  });

  it("без связи карточка — «Только на площадке», а вариант — отдельной строкой «Только в магазине»", () => {
    const rows = build({ links: [] });

    expect(rows.map((row) => [row.id, row.state])).toEqual([
      ["mpprod_100", "marketplace_only"],
      ["var_1", "shop_only"],
    ]);
    expect(rowOf(rows, "var_1")).toMatchObject({
      card_id: null,
      external_id: null,
      vendor_code: "ART-1",
      mp: null,
      shop: { price: 1000, stock: 5 },
    });
  });

  it("совпадение артикула без связи «Есть везде» НЕ делает: решает mp_link, как на «Товарах»", () => {
    expect(build({ links: [] }).find((row) => row.state === "both")).toBeUndefined();
  });

  it("товар магазина без артикула тоже строка «Только в магазине»", () => {
    const rows = build({ links: [], variants: [variant({ id: "var_nosku", sku: null })] });

    expect(rowOf(rows, "var_nosku")).toMatchObject({ state: "shop_only", vendor_code: null });
  });

  it("связь на ушедший из магазина вариант — не связь", () => {
    const rows = build({ links: [{ ...LINKED, variant_id: "var_gone" }] });

    expect(rowOf(rows, "mpprod_100").state).toBe("marketplace_only");
  });

  it("связь без варианта берёт единственный вариант товара, а из нескольких не выбирает", () => {
    expect(build({ links: [{ ...LINKED, variant_id: null }] })[0].state).toBe("both");

    const two = build({
      links: [{ ...LINKED, variant_id: null }],
      variants: [variant(), variant({ id: "var_2", sku: "ART-2" })],
    });
    expect(rowOf(two, "mpprod_100").state).toBe("marketplace_only");
  });

  it("три состояния делят таблицу: сумма счётчиков = число строк, «выше порога» — наложение", () => {
    const rows = build({
      cards: [card(), card({ id: "mpprod_200", external_id: "200", vendor_code: "ART-2" })],
      lines: [
        line({ external_id: "100", stock: 70, warehouse_id: "wh-1" }),
        line({ external_id: "200", stock: 1, warehouse_id: "wh-1" }),
      ],
      variants: [variant(), variant({ id: "var_3", sku: "ART-3" })],
    });
    const counts = priceStockCounts(rows);

    expect(counts).toEqual({ both: 1, marketplace_only: 1, shop_only: 1, over_threshold: 1 });
    expect(counts.both + counts.marketplace_only + counts.shop_only).toBe(rows.length);
  });

  it("строки mp_offer без карточки строк не дают, но посчитаны", () => {
    const lines = [line({ external_id: "100" }), line({ external_id: "999" }), line({ external_id: "999", warehouse_id: "w" })];
    const rows = build({ lines });

    expect(rows.find((row) => row.external_id === "999")).toBeUndefined();
    expect(offersWithoutCard([card()], lines)).toBe(1);
  });

  it("карточка без строк цен — строка с пустыми числами, а не пропуск", () => {
    const row = build({ lines: [] })[0];

    expect(row.state).toBe("both");
    expect(row.mp).toMatchObject({ price: null, stock: null, lines: 0, price_stale: false, stock_stale: false });
    expect(row.diff).toMatchObject({ price_abs: null, stock_abs: null, highlighted: false });
  });
});

describe("расхождения и пороги", () => {
  it("цена: площадка минус магазин, проценты от цены магазина", () => {
    const row = build({ lines: [line({ external_id: "100", price: 1300, discount_price: 1240 })], variants: [variant({ prices: { rub: 1144 } })] })[0];

    expect(row.diff.price_abs).toBe(96);
    expect(row.diff.price_pct).toBe(8.39);
  });

  it("остаток: площадка минус магазин, в штуках", () => {
    expect(build()[0].diff.stock_abs).toBe(2);
  });

  it("порог приходит снаружи и решает подсветку", () => {
    const lines = [line({ external_id: "100", price: 1200, discount_price: 1150, stock: 5, warehouse_id: "w" })];

    expect(build({ lines, thresholds: { price_pct: 10, stock_abs: 1 } })[0].diff.highlighted).toBe(true);
    expect(build({ lines, thresholds: { price_pct: 20, stock_abs: 1 } })[0].diff.highlighted).toBe(false);
  });

  it("нулевое расхождение не подсвечено даже при пороге 0", () => {
    expect(highlightOf({ price_pct: 0, stock_abs: 0 }, { price_pct: 0, stock_abs: 0 })).toBe(false);
    expect(highlightOf({ price_pct: -0.5, stock_abs: null }, { price_pct: 0, stock_abs: 0 })).toBe(true);
  });

  it("порог берётся по модулю: −12 % так же далеко, как +12 %", () => {
    expect(highlightOf({ price_pct: -12, stock_abs: null }, { price_pct: 10, stock_abs: 1 })).toBe(true);
    expect(highlightOf({ price_pct: null, stock_abs: -3 }, { price_pct: 10, stock_abs: 3 })).toBe(true);
  });

  it("без цены магазина в валюте площадки разницы нет, а не «−100 %»", () => {
    const row = build({ variants: [variant({ prices: { eur: 10 } })] })[0];

    expect(row.shop?.price).toBeNull();
    expect(row.diff.price_abs).toBeNull();
    expect(row.diff.price_pct).toBeNull();
  });

  it("«только выше порога» — подмножество «Есть везде»", () => {
    const rows = build({
      cards: [card(), card({ id: "mpprod_200", external_id: "200" })],
      lines: [line({ external_id: "100", price: 2000, discount_price: 2000 }), line({ external_id: "200" })],
    });
    const over = filterPriceStockRows(rows, { q: null, states: null, over_threshold: true });

    expect(over.length).toBeGreaterThan(0);
    expect(over.every((row) => row.state === "both")).toBe(true);
  });
});

describe("свежесть", () => {
  it("порог «Устарело» — интервал вида, умноженный на три: цены 3 ч, остатки 45 мин", () => {
    expect(staleAfterMs("prices")).toBe(MP_SYNC_INTERVAL_MS.prices * 3);
    expect(staleAfterMs("prices")).toBe(180 * MINUTE);
    expect(staleAfterMs("stocks")).toBe(45 * MINUTE);
  });

  it("остатки моложе 45 минут — не устарели, старше — устарели", () => {
    const fresh = build({
      lines: [line({ external_id: "100", stock: 3, warehouse_id: "w", measured_at: at(44) })],
      imports: [succeeded(), succeeded({ kind: "stocks", finished_at: at(44) })],
    })[0];
    const stale = build({
      lines: [line({ external_id: "100", stock: 3, warehouse_id: "w", measured_at: at(46) })],
      imports: [succeeded(), succeeded({ kind: "stocks", finished_at: at(46) })],
    })[0];

    expect(fresh.mp?.stock_stale).toBe(false);
    expect(stale.mp?.stock_stale).toBe(true);
    expect(stale.mp?.stock_measured_at).toBe(at(46));
  });

  it("возраст берётся от СТАРШЕГО из двух фактов — число не свежее импорта, который его принёс", () => {
    const freshness = freshnessOf({
      family: "prices",
      hasValue: true,
      measuredAt: at(5),
      importedAt: at(200),
      now: NOW,
      marketplace: "wb",
      lines: 1,
    });

    expect(freshness.as_of).toBe(at(200));
    expect(freshness.stale).toBe(true);
  });

  it("строка стареет по самой старой своей строке mp_offer", () => {
    const row = build({
      lines: [
        line({ external_id: "100", stock: 1, warehouse_id: "a", measured_at: at(1) }),
        line({ external_id: "100", stock: 2, warehouse_id: "b", measured_at: at(120) }),
      ],
    })[0];

    expect(row.mp?.stock_measured_at).toBe(at(120));
    expect(row.mp?.stock_stale).toBe(true);
  });

  it("пустое число не устаревшее, а пустое; число без возраста — устаревшее", () => {
    expect(
      freshnessOf({ family: "prices", hasValue: false, measuredAt: null, importedAt: null, now: NOW, marketplace: "wb", lines: 0 })
        .stale,
    ).toBe(false);
    expect(
      freshnessOf({ family: "prices", hasValue: true, measuredAt: null, importedAt: null, now: NOW, marketplace: "wb", lines: 1 })
        .stale,
    ).toBe(true);
  });

  it("импорт вида находится по семейству, а не по списку имён", () => {
    const imports: PriceStockImport[] = [
      succeeded({ kind: "products", finished_at: at(30), marketplace: "ozon" }),
      succeeded({ kind: "stocks", finished_at: at(5), marketplace: "ozon" }),
      succeeded({ kind: "stocks", finished_at: at(3), marketplace: "ozon", status: "failed" }),
    ];

    expect(lastImportOf(imports, "ozon", "stocks")).toBe(at(5));
    expect(lastImportOf(imports, "ozon", "prices")).toBeNull();
  });

  it("«цены на …, остатки на …» — самый новый замер, не позже успешного импорта", () => {
    const lines = [
      line({ external_id: "100", stock: 1, warehouse_id: "a", measured_at: at(10) }),
      line({ external_id: "200", stock: null, measured_at: at(2) }),
    ];
    const measured = measuredOf(lines, [succeeded({ finished_at: at(30) }), succeeded({ kind: "stocks", finished_at: at(1) })], "wb");

    expect(measured).toEqual({ prices_at: at(30), stocks_at: at(10) });
  });
});

describe("запрос", () => {
  it("по умолчанию: 20 строк, пороги 10 % и 1 шт, без фильтров", () => {
    expect(parsePriceStockQuery({})).toEqual({
      limit: 20,
      offset: 0,
      q: null,
      order: null,
      states: null,
      over_threshold: false,
      thresholds: { price_pct: 10, stock_abs: 1 },
    });
  });

  it("читает адрес панели", () => {
    expect(
      parsePriceStockQuery({
        state: "both,shop_only",
        over_threshold: "true",
        price_pct: "20",
        stock_abs: "0",
        order: "-price_pct",
        q: "  мумиё ",
        offset: "40",
      }),
    ).toMatchObject({
      states: ["both", "shop_only"],
      over_threshold: true,
      thresholds: { price_pct: 20, stock_abs: 0 },
      order: { field: "price_pct", desc: true },
      q: "мумиё",
      offset: 40,
    });
  });

  it.each([
    [{ order: "price" }, /order/],
    [{ state: "linked" }, /state/],
    [{ over_threshold: "yes" }, /over_threshold/],
    [{ price_pct: "-1" }, /price_pct/],
    [{ stock_abs: "1.5" }, /stock_abs/],
    [{ price_pct: "abc" }, /price_pct/],
  ])("%j — 400 с перечнем допустимого, а не тихий порог по умолчанию", (query, pattern) => {
    expect(() => parsePriceStockQuery(query)).toThrow(pattern);
  });
});

describe("поиск и сортировка", () => {
  const rows = build({
    cards: [
      card({ id: "a", external_id: "1", title: "Мумиё алтайское", vendor_code: "MUM-1" }),
      card({ id: "b", external_id: "2", title: "Чай", vendor_code: "TEA-1" }),
      card({ id: "c", external_id: "3", title: "Мазь", vendor_code: "MAZ-1" }),
    ],
    lines: [
      line({ external_id: "1", price: 1100, discount_price: null, stock: 1, warehouse_id: "w" }),
      line({ external_id: "2", price: 700, discount_price: null, stock: 50, warehouse_id: "w" }),
      line({ external_id: "3", price: 1050, discount_price: null, stock: 4, warehouse_id: "w" }),
    ],
    links: [
      { external_id: "1", product_id: "p1", variant_id: "v1" },
      { external_id: "2", product_id: "p2", variant_id: "v2" },
    ],
    variants: [
      variant({ id: "v1", product_id: "p1", sku: "MUM-1", prices: { rub: 1000 }, stock: 5 }),
      variant({ id: "v2", product_id: "p2", sku: "TEA-1", prices: { rub: 1000 }, stock: 5 }),
    ],
  });

  it("q ищет по названию и артикулу без учёта регистра", () => {
    expect(filterPriceStockRows(rows, { q: "мумиё", states: null, over_threshold: false }).map((row) => row.id)).toEqual(["a"]);
    expect(filterPriceStockRows(rows, { q: "tea-1", states: null, over_threshold: false }).map((row) => row.id)).toEqual(["b"]);
  });

  it("по расхождению цены — по модулю: −30 % дальше, чем +10 %; без расхождения — в конце в обе стороны", () => {
    expect(sortPriceStockRows(rows, { field: "price_pct", desc: true }).map((row) => row.id)).toEqual(["b", "a", "c"]);
    expect(sortPriceStockRows(rows, { field: "price_pct", desc: false }).map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("по расхождению остатка — по модулю", () => {
    expect(sortPriceStockRows(rows, { field: "stock_abs", desc: true }).map((row) => row.id)).toEqual(["b", "a", "c"]);
  });

  it("строка без названия — в конце, а не первой на странице", () => {
    const nameless = build({
      links: [],
      variants: [],
      cards: [card({ id: "x", external_id: "9", title: null }), card({ id: "y", external_id: "8", title: "Ягоды" })],
      lines: [],
    });
    expect(sortPriceStockRows(nameless, null).map((row) => row.id)).toEqual(["y", "x"]);
  });

  it("по умолчанию подсвеченные первыми, затем «Есть везде», «Только на площадке», «Только в магазине»", () => {
    const withShopOnly = [...rows, ...build({ links: [] }).filter((row) => row.state === "shop_only")];
    const ordered = sortPriceStockRows(withShopOnly, null);

    expect(ordered.map((row) => row.state)).toEqual(["both", "both", "marketplace_only", "shop_only"]);
    expect(ordered[0].diff.highlighted).toBe(true);
  });
});

describe("экспорт", () => {
  const rows = build({
    lines: [line({ external_id: "100", price: 1300, discount_price: 1240, stock: 7, warehouse_id: "w", reserved: 2 })],
    variants: [variant({ prices: { rub: 1144 } })],
  });

  it("строк в файле ровно столько, сколько строк отдано, плюс заголовок; BOM, ; и CRLF", () => {
    const csv = toPriceStockCsv(rows, "Wildberries");

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.trimEnd().split("\r\n")).toHaveLength(rows.length + 1);
    expect(csv.split("\r\n")[0]).toBe(`\uFEFF${priceStockCsvColumns("Wildberries").join(";")}`);
  });

  it("колонки идут в порядке таблицы: продукт, цены, остатки, где есть, обновлено", () => {
    const head = priceStockCsvColumns("Wildberries");
    const position = (name: string) => head.indexOf(name);

    expect(position("Продукт")).toBe(0);
    expect(position("Цена в магазине")).toBeLessThan(position("Цена на Wildberries"));
    expect(position("Цена на Wildberries")).toBeLessThan(position("Остаток в магазине, шт"));
    expect(position("Остаток в магазине, шт")).toBeLessThan(position("Остаток на Wildberries, шт"));
    expect(position("Остаток на Wildberries, шт")).toBeLessThan(position("Где есть"));
    expect(position("Где есть")).toBeLessThan(position("Обновлено"));
  });

  it("первая строка — значения строки таблицы, числа с запятой, отрицательные без кавычки-формулы", () => {
    const first = toPriceStockCsv(rows, "Wildberries").split("\r\n")[1].split(";");
    const cells = priceStockCsvCells(rows[0], "Wildberries");

    expect(first).toHaveLength(priceStockCsvColumns("Wildberries").length);
    expect(first.slice(0, 8)).toEqual(["Карточка", "ART-1", "1144", "1240", "1300", "96", "8,39", "RUB"]);
    expect(cells[11]).toBe("Есть везде");

    const negative = build({ variants: [variant({ prices: { rub: 2000 } })] });
    expect(toPriceStockCsv(negative, "Wildberries").split("\r\n")[1].split(";")[5]).toBe("-1200");
  });

  it("текст, похожий на формулу, экранируется, а ; внутри значения не ломает столбцы", () => {
    const tricky = build({ cards: [card({ title: "=HYPERLINK(1); x", vendor_code: "-art" })] });
    const csv = toPriceStockCsv(tricky, "Wildberries").split("\r\n")[1];

    expect(csv.startsWith(`"'=HYPERLINK(1); x";'-art;`)).toBe(true);
  });
});
