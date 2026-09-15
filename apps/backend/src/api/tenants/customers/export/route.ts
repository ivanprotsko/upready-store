import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows";
import { getTenantCustomerAggregates, zeroAggregate } from "../helpers";
import type { TenantExportCustomersQuery } from "../validators";

/**
 * `POST /tenants/customers/export` — a CSV of the tenant's own customers,
 * built synchronously and stored through the file module, same contract as
 * `POST /tenants/orders/export` (`{ url, filename, count }`, opened by the
 * panel directly since it has no notification feed).
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

  const { result: files } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: [
        {
          filename,
          mimeType: "text/csv",
          content: Buffer.from(csv, "utf8").toString("base64"),
          access: "public",
        },
      ],
    },
  });

  res.status(200).json({ url: files[0]?.url, filename, count: rows.length });
};
