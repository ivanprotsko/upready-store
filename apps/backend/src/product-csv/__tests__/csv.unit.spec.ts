import {
  BOM,
  decodeSpreadsheet,
  csvCell,
  detectDelimiter,
  normalizeText,
  parseCsv,
  parseRecords,
  toCsvFile,
} from "../csv";

/**
 * The reader and the writer of the catalogue spreadsheet (t14-product-import).
 * Every case here is a file a real spreadsheet actually produces: Excel's
 * semicolons and BOM, Google Sheets' commas and LF, a description with a
 * newline inside it, and a quoted field holding the separator.
 */
describe("product-csv/csv", () => {
  describe("normalizeText", () => {
    it("drops a BOM and turns CRLF and lone CR into LF", () => {
      expect(normalizeText(`${BOM}a\r\nb\rc\nd`)).toBe("a\nb\nc\nd");
    });

    it("leaves a file with no BOM and LF endings alone", () => {
      expect(normalizeText("a\nb")).toBe("a\nb");
    });
  });

  describe("decodeSpreadsheet", () => {
    it("reads Excel's «CSV UTF-8» — UTF-8 with a BOM", () => {
      const bytes = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from("Код товара;Цена, RUB", "utf8"),
      ]);

      expect(decodeSpreadsheet(bytes)).toEqual({
        text: "Код товара;Цена, RUB",
        encoding: "utf-8-bom",
      });
    });

    it("reads Excel's plain «CSV» on a Russian Windows — cp1251, no BOM", () => {
      // Those bytes are «Название» in windows-1251. As UTF-8 they are invalid,
      // which is exactly what makes the two encodings tellable apart.
      const bytes = Buffer.from([0xcd, 0xe0, 0xe7, 0xe2, 0xe0, 0xed, 0xe8, 0xe5]);

      expect(decodeSpreadsheet(bytes)).toEqual({
        text: "Название",
        encoding: "windows-1251",
      });
    });

    it("reads a plain UTF-8 file without inventing a BOM", () => {
      expect(decodeSpreadsheet(Buffer.from("Название", "utf8"))).toEqual({
        text: "Название",
        encoding: "utf-8",
      });
    });
  });

  describe("detectDelimiter", () => {
    it("reads Excel's semicolons off the header", () => {
      expect(detectDelimiter("Код товара;Название;Цена, RUB\nx;y;1")).toBe(";");
    });

    it("reads Google Sheets' commas off the header", () => {
      expect(detectDelimiter("Код товара,Название,Цена, RUB\nx,y,1")).toBe(",");
    });

    it("reads a tab-separated header", () => {
      expect(detectDelimiter("Код товара\tНазвание\nx\ty")).toBe("\t");
    });

    it("ignores separators inside a quoted header cell", () => {
      // The description column holds semicolons; the real separator is a comma.
      expect(detectDelimiter('handle,"a;b;c;d;e",title\nx,y,z')).toBe(",");
    });

    it("defaults to a semicolon for a single-column file", () => {
      expect(detectDelimiter("handle\nx")).toBe(";");
    });
  });

  describe("parseRecords", () => {
    it("keeps a quoted newline inside one field and still counts physical lines", () => {
      const records = parseRecords('a;b\n"first\nsecond";x\nlast;y\n', ";");

      expect(records).toHaveLength(3);
      expect(records[1].cells).toEqual(["first\nsecond", "x"]);
      // The header is line 1, the two-line record starts on line 2, so the
      // record after it starts on line 4 — which is the number Excel shows.
      expect(records[2].line).toBe(4);
      expect(records[2].cells).toEqual(["last", "y"]);
    });

    it("un-doubles the quotes inside a quoted field", () => {
      const records = parseRecords('a\n"he said ""hi"""\n', ";");

      expect(records[1].cells).toEqual(['he said "hi"']);
    });

    it("drops a blank line and a line of nothing but separators", () => {
      const records = parseRecords("a;b\n\n;;\nx;y\n", ";");

      expect(records.map((record) => record.cells)).toEqual([
        ["a", "b"],
        ["x", "y"],
      ]);
    });

    it("keeps a bare quote inside an unquoted field as a character", () => {
      const records = parseRecords('a\n10" труба\n', ";");

      expect(records[1].cells).toEqual(['10" труба']);
    });
  });

  describe("parseCsv", () => {
    it("splits the header off and answers null for an empty file", () => {
      const parsed = parseCsv(`${BOM}h1;h2\r\nv1;v2\r\n`);

      expect(parsed?.delimiter).toBe(";");
      expect(parsed?.header.cells).toEqual(["h1", "h2"]);
      expect(parsed?.records).toHaveLength(1);
      expect(parseCsv("")).toBeNull();
      expect(parseCsv("\n\n")).toBeNull();
    });
  });

  describe("csvCell and toCsvFile", () => {
    it("quotes every cell and doubles inner quotes", () => {
      expect(csvCell('a"b')).toBe('"a""b"');
      expect(csvCell(null)).toBe('""');
      expect(csvCell(12)).toBe('"12"');
    });

    it("writes a BOM and CRLF so Excel opens Cyrillic without a wizard", () => {
      const file = toCsvFile([
        ["Код товара", "Название"],
        ["asd-15", "АСД-2, 100 мл"],
      ]);

      expect(file.startsWith(BOM)).toBe(true);
      expect(file).toContain('"Код товара";"Название"\r\n');
      expect(file.endsWith("\r\n")).toBe(true);
    });

    it("survives its own round trip, separator and newline included", () => {
      const rows = [
        ["Код товара", "Описание"],
        ["asd-15", 'Состав: вода; спирт\nПрименять "внутрь"'],
      ];

      const parsed = parseCsv(toCsvFile(rows));

      expect(parsed?.header.cells).toEqual(rows[0]);
      expect(parsed?.records[0].cells).toEqual(rows[1]);
    });
  });
});
