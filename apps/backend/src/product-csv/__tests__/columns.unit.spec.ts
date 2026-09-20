import {
  matchMetadataKey,
  normalizeHeader,
  parseNumber,
  parseStatus,
  priceHeader,
  resolveColumn,
  splitCategoryPath,
  splitImageUrls,
} from "../columns";

/**
 * The column contract (t14-product-import). What is being defended here is the
 * worst failure this feature can have: a header that LOOKS right, does not
 * match, and makes the importer quietly ignore a column the owner filled in.
 */
describe("product-csv/columns", () => {
  describe("normalizeHeader", () => {
    it("strips the invisible characters a spreadsheet leaves in a header", () => {
      // Non-breaking space, zero-width space, BOM in the middle of the cell.
      expect(normalizeHeader("﻿ Код товара​ ")).toBe("код товара");
    });
  });

  describe("resolveColumn", () => {
    it("matches the canonical Russian headers the export writes", () => {
      expect(resolveColumn("Код товара")).toEqual({ kind: "fixed", id: "handle" });
      expect(resolveColumn("Название")).toEqual({ kind: "fixed", id: "title" });
      expect(resolveColumn("Остаток")).toEqual({ kind: "fixed", id: "stock" });
      expect(resolveColumn("Вес, г")).toEqual({ kind: "fixed", id: "weight" });
      expect(resolveColumn("Картинки")).toEqual({ kind: "fixed", id: "images" });
    });

    it("matches the technical aliases a list from another system carries", () => {
      expect(resolveColumn("handle")).toEqual({ kind: "fixed", id: "handle" });
      expect(resolveColumn("Product Title")).toEqual({ kind: "fixed", id: "title" });
      expect(resolveColumn("АРТИКУЛ")).toEqual({ kind: "fixed", id: "sku" });
      expect(resolveColumn(" quantity ")).toEqual({ kind: "fixed", id: "stock" });
    });

    it("reads a price column per currency, in either language", () => {
      expect(resolveColumn("Цена, RUB")).toEqual({ kind: "price", currency_code: "rub" });
      expect(resolveColumn("цена eur")).toEqual({ kind: "price", currency_code: "eur" });
      expect(resolveColumn("Price USD")).toEqual({ kind: "price", currency_code: "usd" });
      expect(resolveColumn("price_usd")).toEqual({ kind: "price", currency_code: "usd" });
    });

    it("reads a metadata column and keeps the key as written", () => {
      // As WRITTEN, including its case: a metadata key is free-form, and the
      // live shop has one spelled `pricelistPositions`. Lowercasing it here
      // made the import look for a key no product has, so a round trip with no
      // edits reported an update on every product carrying it and confirming
      // would have written a second, lowercase twin (b01-owner-numbers).
      expect(resolveColumn("Метаданные: Производитель")).toEqual({
        kind: "metadata",
        key: "Производитель",
      });
      expect(resolveColumn("Метаданные: pricelistPositions")).toEqual({
        kind: "metadata",
        key: "pricelistPositions",
      });
      expect(resolveColumn("metadata:vendor")).toEqual({ kind: "metadata", key: "vendor" });
    });

    it("matches a metadata key to the spelling the product already uses", () => {
      const metadata = { pricelistPositions: [8] };

      expect(matchMetadataKey(metadata, "pricelistpositions")).toBe("pricelistPositions");
      expect(matchMetadataKey(metadata, "pricelistPositions")).toBe("pricelistPositions");
      // A key the product does not have keeps the owner's own spelling.
      expect(matchMetadataKey(metadata, "Поставщик")).toBe("Поставщик");
      expect(matchMetadataKey(null, "Поставщик")).toBe("Поставщик");
    });

    it("calls a column it does not know unknown rather than guessing", () => {
      expect(resolveColumn("Поставщик")).toEqual({ kind: "unknown" });
      expect(resolveColumn("")).toEqual({ kind: "unknown" });
    });

    it("round-trips the header the export writes for a currency", () => {
      expect(resolveColumn(priceHeader("rub"))).toEqual({ kind: "price", currency_code: "rub" });
    });
  });

  describe("parseNumber", () => {
    it("reads the forms a spreadsheet writes", () => {
      expect(parseNumber("1990")).toBe(1990);
      expect(parseNumber("1 990,50")).toBe(1990.5);
      expect(parseNumber("1 990,50")).toBe(1990.5);
      expect(parseNumber("1990.5")).toBe(1990.5);
      expect(parseNumber("1 990,50 ₽")).toBe(1990.5);
    });

    it("refuses a price with letters in it instead of substituting a zero", () => {
      expect(parseNumber("по запросу")).toBeNull();
      expect(parseNumber("1990 руб")).toBeNull();
      expect(parseNumber("")).toBeNull();
      expect(parseNumber("-")).toBeNull();
    });
  });

  describe("parseStatus", () => {
    it("accepts the words an owner types and the values the export writes", () => {
      expect(parseStatus("опубликован")).toBe("published");
      expect(parseStatus("published")).toBe("published");
      expect(parseStatus("Черновик")).toBe("draft");
      expect(parseStatus("draft")).toBe("draft");
      // Statuses the export can write but the panel does not offer.
      expect(parseStatus("proposed")).toBe("proposed");
    });

    it("refuses a word it does not know", () => {
      expect(parseStatus("активный товар")).toBeNull();
    });
  });

  describe("splitCategoryPath", () => {
    it("reads a path written with any of the separators owners use", () => {
      expect(splitCategoryPath("Добавки / АСД")).toEqual(["Добавки", "АСД"]);
      expect(splitCategoryPath("Добавки > АСД")).toEqual(["Добавки", "АСД"]);
      expect(splitCategoryPath("Добавки")).toEqual(["Добавки"]);
      expect(splitCategoryPath("  ")).toEqual([]);
    });
  });

  describe("splitImageUrls", () => {
    it("splits on the pipe the export writes, on a newline and on a comma", () => {
      expect(splitImageUrls("https://a/1.jpg | https://a/2.jpg")).toEqual([
        "https://a/1.jpg",
        "https://a/2.jpg",
      ]);
      expect(splitImageUrls("https://a/1.jpg\nhttps://a/2.jpg")).toEqual([
        "https://a/1.jpg",
        "https://a/2.jpg",
      ]);
    });

    it("keeps a semicolon inside a URL, because that is the CSV separator", () => {
      expect(splitImageUrls("https://a/img?x=1;y=2")).toEqual(["https://a/img?x=1;y=2"]);
    });
  });
});
