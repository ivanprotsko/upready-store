import type { CatalogSnapshot } from "../catalog";
import { parseCsv } from "../csv";
import { MAX_FILE_BYTES, MAX_ROWS, planImport } from "../plan";
import { readRows } from "../rows";
import { snapshotToCsv } from "../serialize";

/**
 * The dry run (t14-product-import). The case that matters most is the first
 * one: exporting a catalogue and importing the untouched file back must report
 * every row as unchanged, because that is the promise the whole feature rests
 * on — the export IS the import's format.
 */

const variant = (overrides: Partial<CatalogSnapshot["products"][0]["variants"][0]> = {}) => ({
  id: "var_1",
  sku: "A-100",
  title: "100 мл",
  weight: 140,
  length: null,
  width: null,
  height: null,
  prices: { rub: 1990 },
  price_rows: [
    {
      id: "price_1",
      currency_code: "rub",
      amount: 1990,
      has_rules: false,
      in_price_list: false,
    },
  ],
  inventory_item_id: "iitem_1",
  stock: 12,
  manage_inventory: true,
  ...overrides,
});

const product = (overrides: Partial<CatalogSnapshot["products"][0]> = {}) => ({
  id: "prod_1",
  handle: "asd-15",
  title: "АСД-2 фракция",
  subtitle: null,
  description: "Для наружного применения",
  status: "published",
  category_id: "cat_asd",
  category_path: ["Добавки", "АСД"],
  image_urls: ["https://shop.test/asd.jpg"],
  metadata: { производитель: "ООО Ромашка" },
  options: [{ id: "opt_1", title: "Вариант", values: ["100 мл"] }],
  variants: [variant()],
  ...overrides,
});

const snapshot = (overrides: Partial<CatalogSnapshot> = {}): CatalogSnapshot => ({
  products: [product()],
  categories: [
    { id: "cat_dob", name: "Добавки", parent_id: null, path: ["Добавки"] },
    { id: "cat_asd", name: "АСД", parent_id: "cat_dob", path: ["Добавки", "АСД"] },
  ],
  currencies: ["rub"],
  metadata_keys: ["производитель"],
  stock_location_id: "sloc_1",
  ...overrides,
});

const plan = (csv: string, state = snapshot(), currencies = ["rub"]) => {
  const parsed = parseCsv(csv);
  if (!parsed) {
    throw new Error("the fixture parsed to nothing");
  }

  return planImport({
    file: readRows(parsed),
    snapshot: state,
    allowedCurrencies: currencies,
    filename: "catalog.csv",
    bytes: Buffer.byteLength(csv, "utf8"),
    bom: true,
    encoding: "utf-8-bom",
    delimiter: parsed.delimiter,
  });
};

describe("product-csv/plan", () => {
  it("reports every row as unchanged for a round trip with no edits", () => {
    const state = snapshot();
    const report = plan(snapshotToCsv(state), state);

    expect(report.fatal).toEqual([]);
    expect(report.status).toBe("pending");
    expect(report.summary.rows).toBe(1);
    expect(report.summary.unchanged).toBe(1);
    expect(report.summary.update).toBe(0);
    expect(report.summary.create).toBe(0);
    expect(report.rows[0].changes).toEqual([]);
    // Nothing to download: the URLs in the file are the shop's own.
    expect(report.rows[0].image_urls).toEqual([]);
  });

  it("stays unchanged on a round trip of a catalogue whose data is not tidy", () => {
    // Both shapes are the live shop's, measured on a clone of the platform
    // database (b01-owner-numbers): descriptions imported from the old store
    // keep leading and trailing whitespace, and one metadata key is spelled
    // with a capital letter. The export writes them out as they are; the
    // import trims every cell and used to lowercase the key in the header, so
    // 20 of 41 rows came back as "changed" after an edit of three of them.
    const state = snapshot({
      products: [
        product({
          description: "  Антисептик стимулятор Дорогова. \n\n  Принимать по схеме. ",
          metadata: { pricelistPositions: [8], производитель: "ООО Ромашка" },
        }),
      ],
      metadata_keys: ["pricelistPositions", "производитель"],
    });

    const report = plan(snapshotToCsv(state), state);

    expect(report.fatal).toEqual([]);
    expect(report.rows[0].changes).toEqual([]);
    expect(report.summary.unchanged).toBe(1);
    expect(report.summary.update).toBe(0);
  });

  it("plans a metadata edit against the key the product already has", () => {
    const state = snapshot({
      products: [product({ metadata: { pricelistPositions: [8] } })],
      metadata_keys: ["pricelistPositions"],
    });

    // The owner typed the header in lower case, as a spreadsheet or another
    // system might. It is the SAME key, and the change is planned on it — not
    // on a new key that would sit next to the old one forever.
    const report = plan(
      [
        "Код товара;SKU;Метаданные: pricelistpositions",
        "asd-15;A-100;[9]",
      ].join("\n"),
      state,
    );

    expect(report.fatal).toEqual([]);
    expect(report.rows[0].changes).toEqual([
      { field: "Метаданные: pricelistPositions", from: "[8]", to: "[9]" },
    ]);
  });

  it("stays unchanged on a round trip of a catalogue with ten products", () => {
    const products = Array.from({ length: 10 }, (_unused, index) =>
      product({
        id: `prod_${index}`,
        handle: `handle-${index}`,
        title: `Товар ${index}`,
        variants: [
          variant({
            id: `var_${index}`,
            sku: `SKU-${index}`,
            prices: { rub: 100 + index },
            price_rows: [
              {
                id: `price_${index}`,
                currency_code: "rub",
                amount: 100 + index,
                has_rules: false,
                in_price_list: false,
              },
            ],
          }),
        ],
      }),
    );

    const state = snapshot({ products });
    const report = plan(snapshotToCsv(state), state);

    expect(report.fatal).toEqual([]);
    expect(report.summary.rows).toBe(10);
    expect(report.summary.unchanged).toBe(10);
  });

  it("sees a changed price and a changed stock, and names both old and new", () => {
    const report = plan(
      "Код товара;SKU;Цена, RUB;Остаток\nasd-15;A-100;2490;7\n",
    );

    expect(report.summary.update).toBe(1);
    expect(report.rows[0].action).toBe("update");
    expect(report.rows[0].changes).toEqual([
      { field: "Цена, RUB", from: "1990", to: "2490" },
      { field: "Остаток", from: "12", to: "7" },
    ]);
  });

  it("creates a draft for a row that matches nothing, whatever status the file asks for", () => {
    const report = plan(
      "Код товара;Название;Статус;Цена, RUB\nnovyi;Новый товар;опубликован;500\n",
    );

    expect(report.rows[0].action).toBe("create");
    expect(report.rows[0].notes.join(" ")).toContain("черновиком");
    expect(report.rows[0].notes.join(" ")).toContain("не применяется");
  });

  it("rejects a new row with no name rather than creating a nameless product", () => {
    const report = plan("Код товара;Цена, RUB\nnovyi;500\n");

    expect(report.rows[0].action).toBe("reject");
    expect(report.rows[0].errors[0].code).toBe("missing_title");
  });

  it("finds a product by SKU when the handle cell is empty", () => {
    const report = plan("Код товара;SKU;Цена, RUB\n;A-100;2490\n");

    expect(report.rows[0].action).toBe("update");
    expect(report.rows[0].product_id).toBe("prod_1");
    expect(report.rows[0].variant_id).toBe("var_1");
  });

  it("adds a variant when the row names a SKU the product does not have", () => {
    const report = plan("Код товара;SKU;Вариант;Цена, RUB\nasd-15;A-250;250 мл;3990\n");

    expect(report.rows[0].action).toBe("create_variant");
    expect(report.rows[0].product_id).toBe("prod_1");
  });

  it("refuses to guess which of several variants a row means", () => {
    const state = snapshot({
      products: [
        product({
          variants: [variant(), variant({ id: "var_2", sku: "A-250", title: "250 мл" })],
        }),
      ],
    });

    const report = plan("Код товара;Цена, RUB\nasd-15;2490\n", state);

    expect(report.rows[0].action).toBe("reject");
    expect(report.rows[0].errors[0].code).toBe("ambiguous_variant");
  });

  it("announces the category levels it will create before anything is written", () => {
    const report = plan("Код товара;Название;Категория\nnew-1;Новинка;Добавки / Настойки\n");

    expect(report.categories_to_create).toEqual(["Добавки / Настойки"]);
    expect(report.rows[0].notes.join(" ")).toContain("будет создана");
  });

  it("rejects the whole file on a duplicate handle and plans nothing", () => {
    const report = plan("Код товара;Цена, RUB\nasd-15;1990\nasd-15;2990\n");

    expect(report.status).toBe("rejected");
    expect(report.fatal[0].code).toBe("duplicate_row");
  });

  it("rejects the whole file when a price column names a currency the shop does not use", () => {
    const report = plan("Код товара;Цена, USD\nasd-15;25\n", snapshot(), ["rub"]);

    expect(report.status).toBe("rejected");
    expect(report.fatal[0].code).toBe("unknown_currency");
    expect(report.fatal[0].message).toContain("USD");
  });

  it("states the limits it enforces in every report", () => {
    const report = plan("Код товара;Цена, RUB\nasd-15;1990\n");

    expect(report.limits).toEqual({ max_bytes: MAX_FILE_BYTES, max_rows: MAX_ROWS });
  });

  it("says the stock cannot be written when the shop has no warehouse", () => {
    const report = plan(
      "Код товара;SKU;Остаток\nasd-15;A-100;3\n",
      snapshot({ stock_location_id: null }),
    );

    expect(report.rows[0].notes.join(" ")).toContain("не настроен склад");
  });

  it("keeps a row with a bad price out of the actionable set without rejecting the file", () => {
    const report = plan("Код товара;SKU;Цена, RUB\nasd-15;A-100;две тысячи\n");

    expect(report.fatal).toEqual([]);
    expect(report.status).toBe("pending");
    expect(report.summary.reject).toBe(1);
    expect(report.summary.update).toBe(0);
  });
});
