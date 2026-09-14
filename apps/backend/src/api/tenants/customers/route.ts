import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { emptyPage } from "../tenant-scope";
import { getTenantCustomerAggregates, zeroAggregate, type CustomerAggregate } from "./helpers";
import type { TenantCustomersQuery } from "./validators";

/**
 * `GET /tenants/customers` — the tenant's own customer base: everyone who has
 * bought from it, registered or as a guest, with order count and total
 * spent. Ownership comes from `getTenantCustomerAggregates`
 * (`customers/helpers.ts`), never from a query parameter naming a customer.
 *
 * Only the columns the table shows are selected (`DISPLAY_FIELDS`), and only
 * one page of customer rows is ever fetched — the product list's 14-45s
 * problem (`research/upready-store-capabilities.md`) is a full unpaginated
 * scan plus a fetch of every row's relations; this route pages at the
 * database for its default sort and narrows to an id-only lookup before
 * paging in memory for the one sort that is a computed column
 * (`orders_count`), never both at once.
 */

const DISPLAY_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "email",
  "phone",
  "has_account",
  "created_at",
] as const;

type CustomerRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  has_account?: boolean | null;
  created_at?: string | Date | null;
};

const toResponseRow = (row: CustomerRow, aggregates: Map<string, CustomerAggregate>) => {
  const agg = aggregates.get(row.id) ?? zeroAggregate;

  return {
    id: row.id,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    has_account: Boolean(row.has_account),
    created_at: row.created_at ?? null,
    orders_count: agg.ordersCount,
    total_spent: agg.totalSpent,
    currency_code: agg.currencyCode,
    last_order_at: agg.lastOrderAt,
  };
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const aggregates = await getTenantCustomerAggregates(req);
  const ownedCustomerIds = Array.from(aggregates.keys());

  if (ownedCustomerIds.length === 0) {
    res.json({ customers: [], ...emptyPage(req) });
    return;
  }

  const { q, order } = req.validatedQuery as unknown as TenantCustomersQuery;
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const pagination = req.queryConfig.pagination as { skip: number; take: number };
  const searchFilter = q ? { q } : {};

  if (order === "orders_count" || order === "-orders_count") {
    // A computed column has no database index to sort by. Narrow to the
    // matching ids first (id only — cheap even at a few thousand rows),
    // sort those against the aggregate already in memory, then fetch full
    // rows for exactly the one page that survives.
    const { data: matches } = await query.graph({
      entity: "customer",
      fields: ["id"],
      filters: { id: ownedCustomerIds, ...searchFilter },
    });

    const matchingIds = matches.map((row) => row.id as string);
    const direction = order.startsWith("-") ? -1 : 1;

    matchingIds.sort(
      (a, b) =>
        direction *
        ((aggregates.get(a)?.ordersCount ?? 0) - (aggregates.get(b)?.ordersCount ?? 0)),
    );

    const pageIds = matchingIds.slice(pagination.skip, pagination.skip + pagination.take);

    const { data: rows } = pageIds.length
      ? await query.graph({
          entity: "customer",
          fields: [...DISPLAY_FIELDS],
          filters: { id: pageIds },
        })
      : { data: [] as CustomerRow[] };

    const byId = new Map((rows as CustomerRow[]).map((row) => [row.id, row]));
    const orderedRows = pageIds
      .map((id) => byId.get(id))
      .filter((row): row is CustomerRow => Boolean(row));

    res.json({
      customers: orderedRows.map((row) => toResponseRow(row, aggregates)),
      count: matchingIds.length,
      offset: pagination.skip,
      limit: pagination.take,
    });
    return;
  }

  const direction = order.startsWith("-") ? "DESC" : "ASC";

  const { data: rows, metadata } = await query.graph({
    entity: "customer",
    fields: [...DISPLAY_FIELDS],
    filters: { id: ownedCustomerIds, ...searchFilter },
    pagination: { skip: pagination.skip, take: pagination.take, order: { created_at: direction } },
  });

  res.json({
    customers: (rows as CustomerRow[]).map((row) => toResponseRow(row, aggregates)),
    count: metadata?.count ?? rows.length,
    offset: metadata?.skip ?? pagination.skip,
    limit: metadata?.take ?? pagination.take,
  });
};
