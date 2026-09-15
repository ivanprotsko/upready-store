/**
 * The delimited-text half of the catalogue import/export (t14-product-import):
 * reading a file a shop owner saved out of Excel or Google Sheets, and writing
 * one those two open without a wizard.
 *
 * Nothing here knows about products. It turns bytes into records and records
 * into bytes, and it is the only place in this feature that deals with BOMs,
 * separators, quoting and line endings.
 *
 * Why hand-written rather than a library: `csv-parse` is in the workspace only
 * as a transitive dependency of `@medusajs/medusa`, which is the same trap
 * `multer` is (see `src/api/middlewares.ts`) — it is not resolvable from this
 * app and adding it to `package.json` would put a parser in the dependency
 * tree for one route. RFC 4180 with two separators and a BOM is sixty lines.
 */

/** UTF-8 byte order mark, what Excel writes in front of a CSV it saved as UTF-8. */
export const BOM = "\uFEFF";

/** The three bytes of that mark, for reading it off an upload. */
const BOM_BYTES = Buffer.from([0xef, 0xbb, 0xbf]);

export type SpreadsheetEncoding = "utf-8-bom" | "utf-8" | "windows-1251";

/**
 * Bytes into text, deciding the encoding rather than assuming it.
 *
 * Excel's «CSV UTF-8» writes UTF-8 with a BOM. Excel's plain «CSV (разделители
 * — запятые)» on a Russian Windows writes WINDOWS-1251 with no BOM, and a shop
 * owner has no way of telling those two menu entries apart. Read as UTF-8, a
 * cp1251 file is not merely wrong — `Buffer.toString("utf8")` replaces every
 * Cyrillic byte with U+FFFD, so the headers stop matching and the importer
 * would answer «нет колонки Код товара» about a file whose first column is
 * plainly named.
 *
 * So UTF-8 is tried STRICTLY (`fatal: true`), and only a file that is not valid
 * UTF-8 is read as cp1251. That order matters: valid UTF-8 is never mistaken
 * for cp1251, and a cp1251 file cannot pass as UTF-8 because its Cyrillic bytes
 * are invalid continuation sequences.
 */
export const decodeSpreadsheet = (
  bytes: Buffer,
): { text: string; encoding: SpreadsheetEncoding } => {
  const hasBom = bytes.subarray(0, 3).equals(BOM_BYTES);
  const body = hasBom ? bytes.subarray(3) : bytes;

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    return { text, encoding: hasBom ? "utf-8-bom" : "utf-8" };
  } catch {
    return {
      text: new TextDecoder("windows-1251").decode(body),
      encoding: "windows-1251",
    };
  }
};

/** The separators a Russian spreadsheet actually produces. Excel's locale decides. */
export const DELIMITERS = [";", ",", "\t"] as const;

export type Delimiter = (typeof DELIMITERS)[number];

export type CsvRecord = {
  /**
   * 1-based number of the physical line the record STARTS on, which is what a
   * shop owner sees in Excel's row gutter. A quoted field may hold newlines,
   * so this is not the record's index.
   */
  line: number;
  cells: string[];
};

export type ParsedCsv = {
  delimiter: Delimiter;
  /** The header record, always the first non-empty one. */
  header: CsvRecord;
  /** Every record after the header, blank lines dropped. */
  records: CsvRecord[];
};

/**
 * Strips the BOM and normalises line endings. Excel on Windows writes CRLF,
 * Excel on macOS has written CR alone within living memory, and a file that
 * went through Google Sheets arrives LF.
 */
export const normalizeText = (text: string): string =>
  (text.startsWith(BOM) ? text.slice(BOM.length) : text).replace(/\r\n?/g, "\n");

/**
 * The separator, decided by the HEADER line alone: the first line outside
 * quotes. Counting over the whole file would let a description holding
 * semicolons outvote the real separator.
 *
 * A file whose header has no separator at all (one column) still parses; the
 * default is `;`, what Excel writes in a Russian locale.
 */
export const detectDelimiter = (normalized: string): Delimiter => {
  const headerLine = firstLogicalLine(normalized);

  let best: Delimiter = ";";
  let bestCount = 0;

  for (const delimiter of DELIMITERS) {
    const count = countOutsideQuotes(headerLine, delimiter);
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }

  return best;
};

/** The text up to the first newline that is not inside a quoted field. */
const firstLogicalLine = (normalized: string): string => {
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];

    if (char === '"') {
      if (inQuotes && normalized[index + 1] === '"') {
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "\n" && !inQuotes) {
      return normalized.slice(0, index);
    }
  }

  return normalized;
};

const countOutsideQuotes = (line: string, delimiter: string): number => {
  let inQuotes = false;
  let count = 0;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      count += 1;
    }
  }

  return count;
};

/**
 * RFC 4180 with one deviation, deliberate: a bare `"` inside an unquoted field
 * is kept as a character instead of raising. A spreadsheet never writes one,
 * but a hand-edited price list carrying `10" pipe` does, and refusing the whole
 * file over it would be the wrong answer to the owner's typo.
 */
export const parseRecords = (normalized: string, delimiter: Delimiter): CsvRecord[] => {
  const records: CsvRecord[] = [];

  let cells: string[] = [];
  let field = "";
  let line = 1;
  let recordLine = 1;
  let inQuotes = false;
  let started = false;

  const endField = () => {
    cells.push(field);
    field = "";
  };

  const endRecord = () => {
    endField();
    // A line holding nothing but separators is blank to a spreadsheet user.
    if (cells.some((cell) => cell.trim() !== "")) {
      records.push({ line: recordLine, cells });
    }
    cells = [];
    started = false;
  };

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];

    if (!started) {
      recordLine = line;
      started = true;
    }

    if (inQuotes) {
      if (char === '"') {
        if (normalized[index + 1] === '"') {
          field += '"';
          index += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }
      if (char === "\n") {
        line += 1;
      }
      field += char;
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      endField();
      continue;
    }

    if (char === "\n") {
      endRecord();
      line += 1;
      continue;
    }

    field += char;
  }

  if (started || field !== "" || cells.length > 0) {
    endRecord();
  }

  return records;
};

/** Everything above, in the order a route needs it. `null` header = empty file. */
export const parseCsv = (text: string): ParsedCsv | null => {
  const normalized = normalizeText(text);
  const delimiter = detectDelimiter(normalized);
  const records = parseRecords(normalized, delimiter);

  if (records.length === 0) {
    return null;
  }

  const [header, ...rest] = records;

  return { delimiter, header, records: rest };
};

/**
 * One cell, quoted the way `POST /tenants/orders/export` quotes its own
 * (`api/tenants/orders/export/route.ts`): every field quoted, inner quotes
 * doubled. Unconditional quoting is what keeps a description holding the
 * separator, a newline or a leading `=` from moving a column.
 */
export const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '""';
  }

  const text = value instanceof Date ? value.toISOString() : String(value);

  return `"${text.replace(/"/g, '""')}"`;
};

/**
 * A whole file, BOM first and CRLF between the records.
 *
 * Both are for Excel and both are measured facts about it, not taste: without
 * the BOM it reads a UTF-8 file in the system codepage and Cyrillic arrives as
 * mojibake, and `;` is the separator its Russian locale expects.
 */
export const toCsvFile = (rows: unknown[][], delimiter: Delimiter = ";"): string =>
  BOM + rows.map((row) => row.map(csvCell).join(delimiter)).join("\r\n") + "\r\n";
