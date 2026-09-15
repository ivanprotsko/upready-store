import type { ImportReport } from "../../../../product-csv/plan";

export type TenantProductImportDto = {
  id: string;
  filename: string;
  bytes: number;
  status: string;
  delimiter: string;
  created_at: string | null;
  updated_at: string | null;
  confirmed_at: string | null;
  report: ImportReport | null;
};

/**
 * The row as the panel sees it. `source` — the uploaded file itself — never
 * crosses over: it can be ten megabytes, the panel has no use for it, and the
 * report already carries every line the owner needs to read.
 */
export const toImportDto = (row: Record<string, unknown>): TenantProductImportDto => ({
  id: String(row.id),
  filename: String(row.filename ?? ""),
  bytes: Number(row.bytes ?? 0),
  status: String(row.status ?? "pending"),
  delimiter: String(row.delimiter ?? ";"),
  created_at: row.created_at ? new Date(row.created_at as string).toISOString() : null,
  updated_at: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
  confirmed_at: row.confirmed_at ? new Date(row.confirmed_at as string).toISOString() : null,
  report: (row.report as ImportReport | null) ?? null,
});
