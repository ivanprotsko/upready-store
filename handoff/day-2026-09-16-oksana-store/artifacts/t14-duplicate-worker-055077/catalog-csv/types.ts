/**
 * The shapes the import route stores and the panel renders. They are written
 * down here, away from the routes, because the same objects are persisted in
 * `tenant_product_import` and read back by a page reload: changing one of them
 * changes what an owner who left the screen open sees when they come back.
 */

import type { Separator } from "./csv";
import type { ColumnMapping } from "./contract";

export type RowAction = "create" | "update" | "unchanged" | "error";

export type PlannedRow = {
  /** Line in the file, the way a spreadsheet numbers it. */
  line: number;
  handle: string | null;
  sku: string | null;
  title: string | null;
  action: RowAction;
  /** The product this row addresses, when it matched one. */
  product_id?: string;
  /** The variant this row addresses, when it matched one. */
  variant_id?: string;
  /** Human-readable list of what would change, one entry per field. */
  changes: string[];
  /** Why the row cannot be applied. A single error rejects the WHOLE file. */
  errors: string[];
  /** Applied anyway, but worth saying out loud. */
  warnings: string[];
};

export type ImportReport = {
  filename: string;
  size_bytes: number;
  separator: Separator;
  bom: boolean;
  /** How every header of the file was understood. */
  columns: ColumnMapping[];
  /** Currency codes the file carries a price column for. */
  currencies: string[];
  /** Metadata keys the file carries a column for. */
  metadata_keys: string[];
  /** Category paths that do not exist yet and would be created. */
  categories_to_create: string[];
  /** How many image URLs would be downloaded (URLs already on the product are not). */
  images_to_fetch: number;
  summary: {
    rows: number;
    create: number;
    update: number;
    unchanged: number;
    error: number;
    blank_skipped: number;
  };
  rows: PlannedRow[];
  /** Problems with the file as a whole: no header, an unknown currency, a duplicate handle. */
  fatal: string[];
  planned_at: string;
};

export type AppliedRow = {
  line: number;
  handle: string | null;
  action: Exclude<RowAction, "error">;
  product_id?: string;
  variant_id?: string;
  notes: string[];
};

export type ImportResult = {
  created: number;
  updated: number;
  unchanged: number;
  categories_created: string[];
  images_fetched: number;
  images_failed: { line: number; url: string; reason: string }[];
  rows: AppliedRow[];
  finished_at: string;
};

export type ImportStatus = "pending" | "rejected" | "applying" | "applied" | "failed" | "cancelled";

/** What the routes answer with, and what the panel's table renders. */
export type ImportDocument = {
  id: string;
  status: ImportStatus;
  filename: string;
  report: ImportReport;
  result: ImportResult | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
