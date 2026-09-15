import type { Knex } from "@medusajs/framework/mikro-orm/knex";

/**
 * How the owner's own money is counted, in ONE place (b01-owner-numbers).
 *
 * Two screens read the same fact — «Обзор» (`analytics/summary`) and «Клиенты»
 * (`customers/helpers.ts`) — and both got it wrong the same way, because both
 * wrote the join themselves.
 *
 * ## `order_summary` holds one row PER ORDER VERSION
 *
 * `order.total` is not a stored column: it lives in `order_summary.totals`, a
 * jsonb blob keyed `current_order_total`. That table is versioned — its own
 * index says so (`IDX_order_summary_order_id_version` on
 * `(order_id, version) where deleted_at is null`) — and every order change
 * (a cancellation is one) appends a row for the new version instead of
 * updating the old one. `order.version` is the pointer to the current one, and
 * Medusa's own module reads summaries that way (`listOrderSummaries({
 * order_id, version })` in `@medusajs/order` 2.19
 * `dist/services/order-module-service.js:1712`).
 *
 * A join on `order_id` alone therefore multiplies the order by the number of
 * versions it has been through. Measured on a clone of the live platform
 * database (`medusa_mt`, dumped 2026-09-15): the shop's six orders carry two
 * summary rows each, so «Обзор» reported 12 orders and ₽16 100 where the shop
 * has 6 orders and ₽8 050, and a customer with one ₽1 094 order was listed as
 * «2 заказа, ₽ 2 188».
 *
 * `order_item` is versioned the same way and had the same defect in the
 * «Топ товаров» query of `analytics/summary` — fixed there, in the one place
 * that reads it (rule 20: the class, not the instance). Everything else goes
 * through `query.graph`, and `GET /tenants/orders/:id/line-items` already
 * deduplicates by version the way the Admin does.
 *
 * ## A canceled order is not revenue
 *
 * The same queries had no status filter, so a canceled order kept counting as
 * money the shop earned. It is excluded from revenue, order count and average
 * order value here — and counted SEPARATELY (`canceled`), never dropped in
 * silence: the panel prints that line under the cards, so a period whose
 * orders were all canceled shows an honest zero WITH its reason next to it
 * rather than a zero that looks like a loss (rule 20a).
 */

/** `order.status` of a canceled order. Equal to `canceled_at is not null` on the live data (6 of 6 rows). */
export const CANCELED_ORDER_STATUS = "canceled";

/**
 * `left join order_summary` narrowed to the order's CURRENT version, so one
 * order contributes exactly one row.
 *
 * Left, not inner: an order whose summary row is missing stays in the count
 * with a zero total (`coalesce` below) instead of vanishing from the shop's
 * own numbers.
 */
export const joinCurrentOrderSummary = (
  qb: Knex.QueryBuilder,
  orderAlias = "o",
  summaryAlias = "os",
): Knex.QueryBuilder =>
  qb.leftJoin({ [summaryAlias]: "order_summary" }, function joinSummary(this: Knex.JoinClause) {
    this.on(`${summaryAlias}.order_id`, `${orderAlias}.id`)
      .andOn(`${summaryAlias}.version`, `${orderAlias}.version`)
      .andOnNull(`${summaryAlias}.deleted_at`);
  });

/** The order's total as a number, from the summary joined above. */
export const currentOrderTotalSql = (summaryAlias = "os"): string =>
  `coalesce((${summaryAlias}.totals->>'current_order_total')::numeric, 0)`;

/** Whether this order is one the shop cancelled, decided by the same column the panel shows. */
export const isCanceledOrder = (status: string | null | undefined): boolean =>
  status === CANCELED_ORDER_STATUS;
