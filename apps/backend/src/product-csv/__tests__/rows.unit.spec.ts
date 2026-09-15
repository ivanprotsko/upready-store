import { parseCsv, toCsvFile } from "../csv";
import { readRows } from "../rows";

/**
 * Reading a file into rows (t14-product-import): which complaints belong to one
 * line and which reject the whole file, and the rule that an empty cell means
 * «no change» rather than «clear this».
 */
const read = (text: string) => {
  const parsed = parseCsv(text);
  if (!parsed) {
    throw new Error("the fixture parsed to nothing");
  }
  return readRows(parsed);
};

describe("product-csv/rows", () => {
  it("reads a three-column price list Excel would produce", () => {
    const { header, rows, fatal } = read(
      "Код товара;Название;Цена, RUB;Остаток\r\nasd-15;АСД-2;1 990,50;12\r\n",
    );

    expect(fatal).toEqual([]);
    expect(header.currencies).toEqual(["rub"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      line: 2,
      handle: "asd-15",
      title: "АСД-2",
      stock: 12,
      prices: { rub: 1990.5 },
      errors: [],
    });
  });

  it("leaves a field the file has no column for as null, not as a clearing write", () => {
    const { rows } = read("Код товара;Цена, RUB\nasd-15;1990\n");

    expect(rows[0].title).toBeNull();
    expect(rows[0].description).toBeNull();
    expect(rows[0].status).toBeNull();
  });

  it("treats an empty cell in a column that IS present as no change", () => {
    const { rows } = read("Код товара;Название;Описание;Цена, RUB\nasd-15;;;\n");

    expect(rows[0].title).toBeNull();
    expect(rows[0].description).toBeNull();
    expect(rows[0].prices).toEqual({});
  });

  it("rejects the row, with the line number, when a price has letters in it", () => {
    const { rows, fatal } = read("Код товара;Цена, RUB\nasd-15;1990\nbad-1;по запросу\n");

    expect(fatal).toEqual([]);
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].line).toBe(3);
    expect(rows[1].errors).toHaveLength(1);
    expect(rows[1].errors[0].code).toBe("bad_number");
    expect(rows[1].errors[0].message).toContain("по запросу");
  });

  it("rejects a fractional stock number and an unknown status on their own rows", () => {
    const { rows } = read("Код товара;Остаток;Статус\na;1,5;опубликован\nb;3;наверное\n");

    expect(rows[0].errors[0].code).toBe("bad_number");
    expect(rows[1].errors[0].code).toBe("bad_status");
    expect(rows[1].errors[0].message).toContain("наверное");
  });

  it("rejects the whole file when a handle repeats", () => {
    const { fatal } = read("Код товара;Цена, RUB\nasd-15;1990\nasd-15;2990\n");

    expect(fatal).toHaveLength(1);
    expect(fatal[0].code).toBe("duplicate_row");
    expect(fatal[0].line).toBe(3);
    expect(fatal[0].message).toContain("строки 2");
  });

  it("allows the same handle on several rows when they are variants with different SKUs", () => {
    const { fatal, rows } = read(
      "Код товара;SKU;Вариант;Цена, RUB\nasd-15;A-100;100 мл;1990\nasd-15;A-250;250 мл;3990\n",
    );

    expect(fatal).toEqual([]);
    expect(rows.map((row) => row.sku)).toEqual(["A-100", "A-250"]);
  });

  it("rejects the whole file when a column is declared twice", () => {
    const { fatal } = read("Код товара;Название;Название\na;x;y\n");

    expect(fatal.map((entry) => entry.code)).toContain("duplicate_column");
  });

  it("rejects the whole file when there is no way to identify a row", () => {
    const { fatal } = read("Название;Цена, RUB\nАСД-2;1990\n");

    expect(fatal.map((entry) => entry.code)).toContain("no_key_column");
  });

  it("reports an unknown column and keeps reading the rest", () => {
    const { header, rows, fatal } = read("Код товара;Поставщик;Цена, RUB\na;ООО Ромашка;1990\n");

    expect(fatal).toEqual([]);
    expect(header.unknown).toEqual(["Поставщик"]);
    expect(rows[0].prices).toEqual({ rub: 1990 });
  });

  it("splits image URLs and complains about a cell that is not a link", () => {
    const { rows } = read(
      "Код товара;Картинки\na;https://x.test/1.jpg | https://x.test/2.jpg\nb;фото в телеграме\n",
    );

    expect(rows[0].image_urls).toEqual(["https://x.test/1.jpg", "https://x.test/2.jpg"]);
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors[0].code).toBe("bad_image_url");
  });

  it("reads a category path and product metadata", () => {
    const { rows } = read(
      "Код товара;Категория;Метаданные: Производитель\na;Добавки / АСД;ООО Ромашка\n",
    );

    expect(rows[0].category_path).toEqual(["Добавки", "АСД"]);
    expect(rows[0].metadata).toEqual({ производитель: "ООО Ромашка" });
  });

  it("counts the line of a row that follows a description with a newline in it", () => {
    const file = toCsvFile([
      ["Код товара", "Описание"],
      ["a", "первая строка\nвторая строка"],
      ["b", "обычное"],
    ]);

    const { rows } = read(file);

    expect(rows[0].line).toBe(2);
    expect(rows[1].line).toBe(4);
    expect(rows[1].handle).toBe("b");
  });
});
