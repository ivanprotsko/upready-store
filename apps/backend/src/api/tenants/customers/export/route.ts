import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { getTenantCustomerAggregates, zeroAggregate } from "../helpers";
import type { TenantExportCustomersQuery } from "../validators";

/**
 * `POST /tenants/customers/export` — a CSV of the tenant's own customers,
 * built synchronously and answered as the FILE (`text/csv` attachment, row
 * count in `x-export-count`), same contract as `POST /tenants/orders/export`.
 * The panel saves it from its own authenticated fetch.
 *
 * Ships every row that matches the search, not one page — this is the one
 * route under `/tenants/customers` that is allowed to read the whole set,
 * because a CSV export is meant to hold everything the owner searched for.
 */

const CSV_COLUMNS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "orders_count",
  "canceled_orders_count",
  "total_spent",
  "currency_code",
  "has_account",
  "created_at",
] as const;

/** RFC 4180: quote every field, double the quotes inside it. */
const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '""';
  }

  const text = value instanceof Date ? value.toISOString() : String(value);

  return `"${text.replace(/"/g, '""')}"`;
};

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const aggregates = await getTenantCustomerAggregates(req);
  const ownedCustomerIds = Array.from(aggregates.keys());

  const { q } = req.validatedQuery as unknown as TenantExportCustomersQuery;

  let rows: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    has_account?: boolean | null;
    created_at?: string | Date | null;
  }[] = [];

  if (ownedCustomerIds.length > 0) {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({
      entity: "customer",
      fields: ["id", "first_name", "last_name", "email", "phone", "has_account", "created_at"],
      filters: { id: ownedCustomerIds, ...(q ? { q } : {}) },
    });
    rows = data;
  }

  const lines = [CSV_COLUMNS.map(csvCell).join(",")];

  for (const row of rows) {
    const agg = aggregates.get(row.id) ?? zeroAggregate;
    lines.push(
      [
        csvCell(row.first_name),
        csvCell(row.last_name),
        csvCell(row.email),
        csvCell(row.phone),
        csvCell(agg.ordersCount),
        csvCell(agg.canceledOrdersCount),
        csvCell(agg.totalSpent),
        csvCell(agg.currencyCode),
        csvCell(Boolean(row.has_account)),
        csvCell(row.created_at),
      ].join(","),
    );
  }

  const csv = `${lines.join("\n")}\n`;
  const filename = `customers-export-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;

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
