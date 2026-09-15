/**
 * RFC 4180 reading and writing for the catalogue spreadsheet, with the two
 * concessions a file that comes out of a Russian Excel needs: a byte order
 * mark, and `;` as the field separator.
 *
 * Why this is hand-written rather than a library: the backend has no CSV
 * dependency (`apps/backend/package.json`), the format is small, and the two
 * behaviours the shop owner actually trips over — the separator and the BOM —
 * have to be decided by READING the file rather than by a flag the owner
 * would have to know about. Both are unit-tested against files a spreadsheet
 * really produces (`__tests__/csv.unit.spec.ts`).
 */

/** The three separators a spreadsheet writes. `,` is the tie-break. */
export const SEPARATORS = [",", ";", "\t"] as const;

export type Separator = (typeof SEPARATORS)[number];

export type ParsedRow = {
  /**
   * 1-based number of the physical line the row STARTS on, counted the way a
   * spreadsheet numbers its rows, so an error message names the line the owner
   * can click. A quoted field holding a newline makes the next row's number
   * jump by more than one, which is correct: that is what the file looks like.
   */
  line: number;
  cells: string[];
};

export type ParsedCsv = {
  separator: Separator;
  /** `true` when the file began with a UTF-8 byte order mark (Excel writes one). */
  bom: boolean;
  /** The header line, trimmed cell by cell, in file order. */
  header: string[];
  /** Every non-empty line after the header. */
  rows: ParsedRow[];
  /** Lines that held nothing but separators and whitespace; Excel appends these. */
  blankLines: number[];
};

/**
 * Counts a separator's occurrences OUTSIDE quoted fields in the first logical
 * line. Counting inside quotes is how `"Соль, крупная";"100 г"` gets mistaken
 * for a comma-separated file with three columns.
 */
const countOutsideQuotes = (text: string, separator: string): number => {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (inQuotes) {
      continue;
    }

    if (char === "\n" || char === "\r") {
      break;
    }

    if (char === separator) {
      count += 1;
    }
  }

  return count;
};

/**
 * The separator of a file, read from its header line: whichever candidate
 * appears most often outside quotes. A single-column file has none of them and
 * gets `,`, which parses the same either way.
 */
export const detectSeparator = (text: string): Separator => {
  let best: Separator = ",";
  let bestCount = 0;

  for (const candidate of SEPARATORS) {
    const count = countOutsideQuotes(text, candidate);

    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return best;
};

/** Drops a UTF-8 byte order mark, and says whether there was one. */
export const stripBom = (text: string): { text: string; bom: boolean } =>
  text.charCodeAt(0) === 0xfeff ? { text: text.slice(1), bom: true } : { text, bom: false };

/**
 * Parses the whole file. A row whose every cell is blank is not a row: Excel
 * writes those when a range is selected wider than the data, and treating them
 * as products would reject a perfectly good file. Their line numbers are kept
 * so the report can say how many were skipped.
 */
export const parseCsv = (raw: string, forcedSeparator?: Separator): ParsedCsv => {
  const { text, bom } = stripBom(raw);
  const separator = forcedSeparator ?? detectSeparator(text);

  const records: ParsedRow[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;
  let started = false;

  const endField = () => {
    cells.push(field);
    field = "";
  };

  const endRecord = () => {
    endField();
    records.push({ line: rowLine, cells });
    cells = [];
    started = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (!started && char !== "\n" && char !== "\r") {
      rowLine = line;
      started = true;
    }

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
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

    if (char === separator) {
      endField();
      continue;
    }

    if (char === "\r") {
      continue;
    }

    if (char === "\n") {
      if (started || cells.length > 0) {
        endRecord();
      }
      line += 1;
      continue;
    }

    field += char;
  }

  if (started || cells.length > 0 || field !== "") {
    endRecord();
  }

  const isBlank = (row: ParsedRow) => row.cells.every((cell) => cell.trim() === "");

  const [headerRow, ...rest] = records;
  const blankLines: number[] = [];
  const rows: ParsedRow[] = [];

  for (const row of rest) {
    if (isBlank(row)) {
      blankLines.push(row.line);
      continue;
    }
    rows.push(row);
  }

  return {
    separator,
    bom,
    header: (headerRow?.cells ?? []).map((cell) => cell.trim()),
    rows,
    blankLines,
  };
};

/**
 * One CSV cell. Quoted only when it has to be — a separator, a quote, a line
 * break or an edge space inside it — so a price stays a number when Excel opens
 * the file rather than becoming text, and so a round trip through the file is a
 * byte-for-byte diff a human can read.
 */
export const csvCell = (value: unknown, separator: Separator): string => {
  if (value === null || value === undefined) {
    return "";
  }

  const text = value instanceof Date ? value.toISOString() : String(value);

  const needsQuotes =
    text.includes(separator) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r") ||
    text !== text.trim();

  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * The file the export hands the owner: CRLF line endings and a byte order mark,
 * which is what makes Excel read Cyrillic as Cyrillic instead of as mojibake.
 */
export const serializeCsv = (
  header: string[],
  rows: unknown[][],
  separator: Separator,
  withBom = true,
): string => {
  const lines = [header.map((cell) => csvCell(cell, separator)).join(separator)];

  for (const row of rows) {
    lines.push(row.map((cell) => csvCell(cell, separator)).join(separator));
  }

  return `${withBom ? "﻿" : ""}${lines.join("\r\n")}\r\n`;
};
