import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getOrdersListWorkflow } from "@medusajs/medusa/core-flows";
import { listTenantOrderIds, scopeIdFilter } from "../../tenant-scope";

/**
 * `POST /tenants/orders/export` — a CSV of the tenant's own orders, built
 * synchronously and answered as the FILE: `text/csv` attachment, row count in
 * `x-export-count`.
 *
 * The Admin's `POST /admin/orders/export` runs `exportOrdersWorkflow` and
 * answers `202 { transaction_id }`; the file then arrives by notification.
 * The tenant panel has no notification feed, so the route builds the file
 * synchronously and the panel saves it from its own authenticated fetch. It
 * used to store the file publicly and answer `{ url }`; that exposed buyers'
 * personal data by URL (audit 2026-09-23, A-02).
 *
 * Filters arrive in the query string, parsed by the Admin's own
 * `AdminGetOrdersParams` + `exportTransformQueryConfig` in middlewares.ts, the
 * same way the Admin's SDK sends them (`sdk.admin.order.export(query)` →
 * `POST /admin/orders/export?<filters>`). The tenant's own ids are intersected
 * with whatever the caller asked for, and an empty intersection produces a
 * header-only CSV rather than an unfiltered export.
 */

const CSV_COLUMNS = [
  "display_id",
  "created_at",
  "status",
  "payment_status",
  "fulfillment_status",
  "email",
  "currency",
  "total",
  "items_count",
  "sales_channel",
] as const;

const EXPORT_FIELDS = [
  "id",
  "display_id",
  "created_at",
  "status",
  "payment_status",
  "fulfillment_status",
  "email",
  "currency_code",
  "total",
  "items.id",
  "sales_channel.name",
];

type ExportRow = {
  display_id?: number | null;
  created_at?: string | Date | null;
  status?: string | null;
  payment_status?: string | null;
  fulfillment_status?: string | null;
  email?: string | null;
  currency_code?: string | null;
  total?: number | string | null;
  items?: unknown[] | null;
  sales_channel?: { name?: string | null } | null;
};

/** RFC 4180: quote every field, double the quotes inside it. */
const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '""';
  }

  const text = value instanceof Date ? value.toISOString() : String(value);

  return `"${text.replace(/"/g, '""')}"`;
};

const toCsv = (rows: ExportRow[]): string => {
  const lines = [CSV_COLUMNS.map(csvCell).join(",")];

  for (const row of rows) {
    lines.push(
      [
        csvCell(row.display_id),
        csvCell(row.created_at),
        csvCell(row.status),
        csvCell(row.payment_status),
        csvCell(row.fulfillment_status),
        csvCell(row.email),
        csvCell(row.currency_code),
        csvCell(row.total),
        csvCell((row.items ?? []).length),
        csvCell(row.sales_channel?.name),
      ].join(","),
    );
  }

  return `${lines.join("\n")}\n`;
};

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const ownedIds = await listTenantOrderIds(req);
  const ids = scopeIdFilter(ownedIds, req.filterableFields?.id);

  let rows: ExportRow[] = [];

  if (ids.length > 0) {
    const { result } = await getOrdersListWorkflow(req.scope).run({
      input: {
        fields: EXPORT_FIELDS,
        variables: {
          filters: {
            ...req.filterableFields,
            id: ids,
            is_draft_order: false,
          },
        },
      },
    });

    // Without pagination the workflow returns the bare array; the paginated
    // shape is kept as the other branch so a later middleware change cannot
    // turn the rows into `undefined` silently.
    rows = (Array.isArray(result) ? result : result.rows) as unknown as ExportRow[];
  }

  const csv = toCsv(rows ?? []);
  const filename = `orders-export-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;

  // The bytes go back in this response, never to the file module: a stored
  // file got a public, unauthenticated URL, and this CSV holds buyers' personal
  // data (audit 2026-09-23, A-01/A-02).
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="${filename}"`);
  // The panel reads it to report the row count without parsing the body.
  res.setHeader("x-export-count", String(rows.length));
  res.setHeader("access-control-expose-headers", "content-disposition, x-export-count");

  res.status(200).send(csv);
};
