import {
  aggregateLines,
  buildPriceStockRows,
  DEFAULT_PRICE_STOCK_THRESHOLDS,
  filterByTab,
  freshnessOf,
  lastImportOf,
  priceStockCounts,
  staleAfterMs,
  toPriceStockCsv,
  type PriceStockCard,
  type PriceStockImport,
  type PriceStockLine,
  type PriceStockVariant,
} from "../price-stock";
import { MP_SYNC_INTERVAL_MS } from "../schedule";

/**
 * The decisions of «Маркетплейсы → Цены и остатки» (w17-mp-price-stock-table).
 *
 * The three claims the screen makes, and the three this file exists to keep
 * honest:
 *
 *   1. the collapsed stock IS the sum of the expanded warehouse and size lines;
 *   2. the three groups partition the articles — their counts sum to the total,
 *      and «расхождение выше порога» is an OVERLAY that must not be added to
 *      that sum;
 *   3. a number is never shown fresher than the import that brought it.
 */

const MINUTE = 60_000;
const NOW = new Date("2026-09-16T04:00:00.000Z");

const at = (minutesAgo: number): string =>
  new Date(NOW.getTime() - minutesAgo * MINUTE).toISOString();

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
  marketplace: "wb",
  external_id: "100",
  vendor_code: "ART-1",
  title: "Товар",
  ...over,
});

const variant = (over: Partial<PriceStockVariant> = {}): PriceStockVariant => ({
  id: "var_1",
  product_id: "prod_1",
  product_title: "Товар магазина",
  sku: "ART-1",
  prices: { rub: 900 },
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

const build = (over: Partial<Parameters<typeof buildPriceStockRows>[0]> = {}) =>
  buildPriceStockRows({
    cards: [card()],
    lines: [line({ external_id: "100" })],
    variants: [variant()],
    imports: [succeeded(), succeeded({ kind: "stocks" })],
    marketplaces: ["wb", "ozon"],
    now: NOW,
    ...over,
  });

describe("свёрнутый остаток = сумма развёрнутых строк", () => {
  const warehouses = Array.from({ length: 7 }, (_, index) =>
    line({
      external_id: "100",
      warehouse_id: `wh-${index}`,
      warehouse_name: `Склад ${index}`,
      size_external: `size-${index % 3}`,
      stock: index * 3 + 1,
    }),
  );

  it("сумма считается по строкам, которые остаток НАЗВАЛИ", () => {
    const aggregate = aggregateLines(warehouses);
    const expected = warehouses.reduce((sum, entry) => sum + (entry.stock ?? 0), 0);

    expect(aggregate.stock).toBe(expected);
    expect(aggregate.stock_lines).toBe(warehouses.length);
    expect(aggregate.warehouses).toBe(7);
    expect(aggregate.sizes).toBe(3);
  });

  it("строка без остатка сумму не меняет и нулём не становится", () => {
    const withSilent = [...warehouses, line({ external_id: "100", warehouse_id: "wh-silent" })];
    const aggregate = aggregateLines(withSilent);

    expect(aggregate.stock).toBe(aggregateLines(warehouses).stock);
    expect(aggregate.lines).toBe(8);
    expect(aggregate.stock_lines).toBe(7);
  });

  it("когда остаток не назвал НИКТО — это null, а не ноль (правило 20a)", () => {
    expect(aggregateLines([line({ external_id: "100" })]).stock).toBeNull();
  });

  it("колонка строки таблицы несёт ровно эту сумму", () => {
    const rows = build({ lines: warehouses });
    const column = rows[0].columns.find((entry) => entry.marketplace === "wb");

    expect(column?.stock).toBe(aggregateLines(warehouses).stock);
    expect(column?.lines).toBe(7);
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

  it("без скидки основанием становится обычная цена и это названо", () => {
    const aggregate = aggregateLines([
      line({ external_id: "100", price: 1200, discount_price: null }),
    ]);

    expect(aggregate.effective_price).toBe(1200);
    expect(aggregate.effective_basis).toBe("price");
  });
});

describe("три группы делят артикулы без остатка", () => {
  const rows = build({
    cards: [card({ external_id: "100", vendor_code: "ART-1" }), card({ external_id: "200", vendor_code: "ART-MP" })],
    lines: [
      line({ external_id: "100", stock: 4 }),
      line({ external_id: "200", vendor_code: "ART-MP", stock: 9 }),
    ],
    variants: [variant(), variant({ id: "var_2", product_id: "prod_2", sku: "ART-SHOP", stock: 2 })],
  });

  it("каждый артикул ровно в одной группе, сумма трёх = всего", () => {
    const counts = priceStockCounts(rows);

    expect(counts.total).toBe(3);
    expect(counts.accounted_for).toBe(counts.total);
    expect(counts.both).toBe(1);
    expect(counts.marketplace_only).toBe(1);
    expect(counts.shop_only).toBe(1);
  });

  it("«расхождение выше порога» — наложение, а не четвёртая группа", () => {
    const counts = priceStockCounts(rows);
    const flagged = filterByTab(rows, "over_threshold");

    expect(counts.over_threshold).toBe(flagged.length);
    /* Каждая отмеченная строка уже посчитана в «везде есть». */
    for (const row of flagged) {
      expect(row.group).toBe("both");
    }
    expect(counts.both + counts.shop_only + counts.marketplace_only).toBe(counts.total);
  });

  it("вкладка отдаёт ровно строки своей группы", () => {
    expect(filterByTab(rows, "shop_only").map((row) => row.vendor_code)).toEqual(["ART-SHOP"]);
    expect(filterByTab(rows, "marketplace_only").map((row) => row.vendor_code)).toEqual(["ART-MP"]);
  });

  it("артикул площадки без карточки всё равно попадает в таблицу своей строкой mp_offer", () => {
    const orphan = build({
      cards: [],
      variants: [],
      lines: [line({ external_id: "999", vendor_code: "ART-ORPHAN", stock: 3 })],
    });

    expect(orphan).toHaveLength(1);
    expect(orphan[0].group).toBe("marketplace_only");
    expect(orphan[0].columns[0].stock).toBe(3);
  });
});

describe("расхождения и порог", () => {
  it("цена: рубли и проценты от цены площадки", () => {
    const rows = build({ lines: [line({ external_id: "100", price: 1000, discount_price: 800 })] });
    const price = rows[0].differences.find((difference) => difference.metric === "price");

    /* Магазин 900, площадка 800 со скидкой: +100 ₽, +12.5 %. */
    expect(price?.marketplace_value).toBe(800);
    expect(price?.abs).toBe(100);
    expect(price?.pct).toBe(12.5);
    expect(price?.unit).toBe("RUB");
    expect(price?.highlighted).toBe(true);
  });

  it("порог решает подсветку, и он приходит снаружи", () => {
    const rows = build({
      lines: [line({ external_id: "100", price: 1000, discount_price: 800 })],
      thresholds: { ...DEFAULT_PRICE_STOCK_THRESHOLDS, price_pct: 20 },
    });

    expect(rows[0].differences.find((entry) => entry.metric === "price")?.highlighted).toBe(false);
    expect(rows[0].over_threshold).toBe(false);
  });

  it("остаток: разница в штуках, и молчание площадки расхождением не считается", () => {
    const rows = build({ lines: [line({ external_id: "100", stock: null })] });
    const stock = rows[0].differences.find((difference) => difference.metric === "stock");

    expect(stock?.marketplace_value).toBeNull();
    expect(stock?.abs).toBeNull();
    expect(stock?.highlighted).toBe(false);
    expect(stock?.note).toContain("площадка остаток не назвала");
  });

  it("каждое расхождение несёт единицу и строку про источник (правило 18e)", () => {
    for (const difference of build()[0].differences) {
      expect(difference.note).toContain("магазин:");
      expect(difference.note).toContain("площадка:");
      expect(typeof difference.unit).toBe("string");
    }
  });
});

describe("свежесть", () => {
  const priceWindow = staleAfterMs("prices");
  const stockWindow = staleAfterMs("stocks");

  it("порог протухания — интервал вида, умноженный на три", () => {
    expect(priceWindow).toBe(MP_SYNC_INTERVAL_MS.prices * 3);
    expect(stockWindow).toBe(MP_SYNC_INTERVAL_MS.stocks * 3);
    expect(stockWindow).toBe(45 * MINUTE);
  });

  it("свежее число протухшим не зовётся", () => {
    const fresh = freshnessOf({
      family: "stocks",
      hasValue: true,
      measuredAt: at(10),
      importedAt: at(10),
      now: NOW,
      marketplace: "wb",
      lines: 3,
    });

    expect(fresh.stale).toBe(false);
    expect(fresh.age_ms).toBe(10 * MINUTE);
  });

  it("старше трёх интервалов — протухло", () => {
    expect(
      freshnessOf({
        family: "stocks",
        hasValue: true,
        measuredAt: at(46),
        importedAt: at(46),
        now: NOW,
        marketplace: "wb",
        lines: 3,
      }).stale,
    ).toBe(true);
  });

  it("возраст берётся от СТАРШЕГО из двух фактов — число не свежее импорта, который его принёс", () => {
    /*
     * Ровно случай WB: строка mp_offer с ценой и остатком несёт время
     * ЗАГРУЗКИ ОСТАТКОВ, а цена приехала другим запросом двумя часами раньше.
     * Взять `measured_at` было бы объявить цену свежей.
     */
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
    expect(freshness.age_ms).toBe(200 * MINUTE);
    expect(freshness.stale).toBe(true);
  });

  it("пустая колонка не протухшая, а пустая", () => {
    const empty = freshnessOf({
      family: "prices",
      hasValue: false,
      measuredAt: null,
      importedAt: null,
      now: NOW,
      marketplace: "ozon",
      lines: 0,
    });

    expect(empty.stale).toBe(false);
    expect(empty.note).toContain("числа нет");
  });

  it("число есть, а возраста нет — считаем протухшим, а не текущим", () => {
    const unknownAge = freshnessOf({
      family: "prices",
      hasValue: true,
      measuredAt: null,
      importedAt: null,
      now: NOW,
      marketplace: "ozon",
      lines: 1,
    });

    expect(unknownAge.stale).toBe(true);
    expect(unknownAge.note).toContain("возраст неизвестен");
  });

  it("колонка стареет по самой старой своей строке", () => {
    const rows = build({
      lines: [
        line({ external_id: "100", stock: 1, measured_at: at(1) }),
        line({ external_id: "100", warehouse_id: "wh-2", stock: 2, measured_at: at(120) }),
      ],
      imports: [succeeded(), succeeded({ kind: "stocks", finished_at: at(1) })],
    });
    const column = rows[0].columns[0];

    expect(column.stock_freshness.measured_at).toBe(at(120));
    expect(column.stock_freshness.stale).toBe(true);
  });

  it("импорт вида находится по семейству, а не по списку имён", () => {
    const imports: PriceStockImport[] = [
      succeeded({ kind: "products", finished_at: at(30), marketplace: "ozon" }),
      succeeded({ kind: "stocks", finished_at: at(5), marketplace: "ozon" }),
      succeeded({ kind: "stocks", finished_at: at(3), marketplace: "ozon", status: "failed" }),
    ];

    expect(lastImportOf(imports, "ozon", "stocks")).toBe(at(5));
    expect(lastImportOf(imports, "ozon", "prices")).toBeNull();
    expect(lastImportOf(imports, "wb", "stocks")).toBeNull();
  });

  it("протухшие колонки посчитаны для экрана", () => {
    const rows = build({
      imports: [succeeded({ finished_at: at(600) }), succeeded({ kind: "stocks", finished_at: at(600) })],
      lines: [line({ external_id: "100", stock: 3, measured_at: at(600) })],
    });

    expect(priceStockCounts(rows).stale_columns).toBe(2);
  });
});

describe("экспорт", () => {
  const rows = build({
    cards: [card(), card({ external_id: "200", vendor_code: "ART-MP" })],
    lines: [line({ external_id: "100", stock: 4 }), line({ external_id: "200", vendor_code: "ART-MP", stock: 9 })],
  });

  it("строк в файле ровно столько, сколько строк отдано, плюс заголовок", () => {
    const csv = toPriceStockCsv(rows, ["wb", "ozon"]);
    const lines = csv.trimEnd().split("\r\n");

    expect(lines).toHaveLength(rows.length + 1);
  });

  it("экспортируется ровно отфильтрованный набор", () => {
    const filtered = filterByTab(rows, "marketplace_only");
    const csv = toPriceStockCsv(filtered, ["wb", "ozon"]);

    expect(csv.trimEnd().split("\r\n")).toHaveLength(filtered.length + 1);
    expect(csv).toContain("ART-MP");
    expect(csv).not.toContain("ART-1,");
  });

  it("колонки площадок строятся из списка площадок, а не из литералов", () => {
    const head = toPriceStockCsv(rows, ["wb", "ozon", "megamarket"]).split("\r\n")[0];

    expect(head).toContain("Цена на megamarket, ₽ с учётом скидки");
    expect(head).toContain("Остаток на megamarket, шт");
  });

  it("каждая числовая колонка называет единицу (правило 18e)", () => {
    const head = toPriceStockCsv(rows, ["wb"]).split("\r\n")[0];

    expect(head).toContain("Цена в магазине, ₽");
    expect(head).toContain("Остаток в магазине, шт");
    expect(head).toContain("Замер остатка на wb");
  });

  it("запятая внутри значения не ломает столбцы", () => {
    const csv = toPriceStockCsv(
      build({ cards: [card({ vendor_code: "Таблетки, 2 банки" })], lines: [] }),
      ["wb"],
    );

    expect(csv).toContain('"Таблетки, 2 банки"');
  });
});
