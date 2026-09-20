import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import {
  CANCELED_ORDER_STATUS,
  currentOrderTotalSql,
  joinCurrentOrderSummary,
} from "../order-totals";
import { listTenantOrderIds } from "../tenant-scope";

/**
 * A customer belongs to the tenant exactly when one of the tenant's own
 * orders (`linkOrderToTenantWorkflow`) names them as `customer_id`. There is
 * no direct tenant-customer link: a customer is a store-wide row, and this is
 * the one place that rule is applied, so every route under
 * `/tenants/customers` reuses it rather than re-deriving ownership.
 *
 * A guest checkout still gets a `customer_id` — Medusa creates a
 * `has_account: false` customer for it — so a guest buyer is aggregated the
 * same as a registered one here; the routes mark them apart by that flag
 * rather than dropping them (step 6 of the task).
 */

export type CustomerAggregate = {
  /** Orders that are revenue: the canceled ones are counted in `canceledOrdersCount`. */
  ordersCount: number;
  totalSpent: number;
  /** Orders this customer placed and the shop cancelled. Shown apart, never folded in. */
  canceledOrdersCount: number;
  currencyCode: string | null;
  lastOrderAt: string | null;
};

export const zeroAggregate: CustomerAggregate = {
  ordersCount: 0,
  totalSpent: 0,
  canceledOrdersCount: 0,
  currencyCode: null,
  lastOrderAt: null,
};

type AggregateRow = {
  customer_id: string;
  orders_count: string;
  canceled_orders_count: string;
  total_spent: string | null;
  currency_code: string | null;
  last_order_at: string | Date | null;
};

/**
 * One `GROUP BY o.customer_id` query over the tenant's own order ids — never a
 * fetch of every order's full row, and never one query per customer, which is
 * the shape of the product list's 14-45s problem
 * (`research/upready-store-capabilities.md`). `total` on the order entity is
 * not a stored column: it lives in `order_summary.totals`, a JSON blob keyed
 * `current_order_total` (verified against the live schema —
 * `apps/backend/node_modules/.pnpm/@medusajs+order@.../dist/utils/calculate-order-change.js`
 * writes that key onto the summary object that becomes this column, and
 * `\d order_summary` on the stand DB shows `totals` as the one jsonb column)
 * — so the cast happens in SQL rather than through a second workflow call per
 * row.
 *
 * That table is VERSIONED, and the join that narrows it to the order's current
 * version lives in `../order-totals.ts` together with the rule that a canceled
 * order is not revenue — the same module `analytics/summary` reads, because
 * this fact was wrong on both screens at once (b01-owner-numbers).
 *
 * `last_order_at` counts EVERY order, canceled ones included: it answers «when
 * did this person last order from me», which a cancellation does not undo.
 */
export const getTenantCustomerAggregates = async (
  req: AuthenticatedMedusaRequest,
): Promise<Map<string, CustomerAggregate>> => {
  const ownedOrderIds = await listTenantOrderIds(req);
  const byCustomer = new Map<string, CustomerAggregate>();

  if (ownedOrderIds.length === 0) {
    return byCustomer;
  }

  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const rows: AggregateRow[] = await joinCurrentOrderSummary(pg({ o: "order" }))
    .whereIn("o.id", ownedOrderIds)
    .whereNull("o.deleted_at")
    .whereNotNull("o.customer_id")
    .groupBy("o.customer_id")
    .select("o.customer_id")
    .select(
      pg.raw("count(o.id) filter (where o.status <> ?) as orders_count", [
        CANCELED_ORDER_STATUS,
      ]),
      pg.raw("count(o.id) filter (where o.status = ?) as canceled_orders_count", [
        CANCELED_ORDER_STATUS,
      ]),
      pg.raw(`coalesce(sum(${currentOrderTotalSql()}) filter (where o.status <> ?), 0) as total_spent`, [
        CANCELED_ORDER_STATUS,
      ]),
    )
    .max({ currency_code: "o.currency_code" })
    .max({ last_order_at: "o.created_at" });

  for (const row of rows) {
    byCustomer.set(row.customer_id, {
      ordersCount: Number(row.orders_count ?? 0),
      totalSpent: Number(row.total_spent ?? 0),
      canceledOrdersCount: Number(row.canceled_orders_count ?? 0),
      currencyCode: row.currency_code ?? null,
      lastOrderAt: row.last_order_at ? new Date(row.last_order_at).toISOString() : null,
    });
  }

  return byCustomer;
};
