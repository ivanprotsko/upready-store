import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { getTenantScope } from "../../tenant-scope";

/**
 * `GET /tenants/wb/tables` — the three mirrors the owner actually reads
 * (w03-wb-sales-questions-mirror): sales, customer questions and the per-day
 * sales funnel.
 *
 * Separate from `GET /tenants/wb/status`, which answers "is the connection
 * healthy": that one is small and safe to poll, this one aggregates tables
 * that grow to tens of thousands of rows.
 *
 * The aggregates are SQL, not JavaScript over `listWb…`: the sales feed alone
 * can hold 80 000 lines per WB answer, and loading them into the process to
 * add up a column is how a status page becomes a slow one.
 *
 * Every query is scoped to the tenant AND to `deleted_at is null`, which is
 * what the mirrors' own unique indexes are scoped to.
 *
 * The numbers carry their window, and the window is named in the response
 * rather than assumed by the screen: "30 days" is a decision of this route,
 * and a reader who sees a count has to be able to ask "of what period".
 */

/** How far back the sales table looks. WB keeps 90 days; the card shows a month. */
const SALES_WINDOW_DAYS = 30;

/** How many rows each table hands to the screen. */
const ROW_LIMIT = 50;

const asNumber = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asIso = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const since = new Date(Date.now() - SALES_WINDOW_DAYS * 86_400_000);

  const salesTotals = await pg("wb_sale")
    .where({ tenant_id: tenant.id })
    .whereNull("deleted_at")
    .where("sale_date", ">=", since)
    .select(
      pg.raw("count(*)::int as lines"),
      pg.raw("coalesce(sum(finished_price), 0) as customer_paid"),
      pg.raw("coalesce(sum(for_pay), 0) as for_pay"),
      pg.raw("count(*) filter (where for_pay < 0)::int as negative_lines"),
      pg.raw("min(sale_date) as first_sale"),
      pg.raw("max(sale_date) as last_sale"),
    )
    .first();

  const salesRows = await pg("wb_sale")
    .where({ tenant_id: tenant.id })
    .whereNull("deleted_at")
    .where("sale_date", ">=", since)
    .orderBy("sale_date", "desc")
    .limit(ROW_LIMIT)
    .select(
      "srid",
      "sale_id",
      "nm_id",
      "supplier_article",
      "subject",
      "brand",
      "tech_size",
      "finished_price",
      "for_pay",
      "region_name",
      "warehouse_name",
      "sale_date",
    );

  const questionCounts = await pg("wb_question")
    .where({ tenant_id: tenant.id })
    .whereNull("deleted_at")
    .select(
      pg.raw("count(*) filter (where is_answered = false)::int as unanswered"),
      pg.raw("count(*) filter (where is_answered = true)::int as answered"),
    )
    .first();

  /**
   * Unanswered first, then the newest: the owner's question about this table
   * is "what is waiting for me", and a date sort alone buries it.
   */
  const questionRows = await pg("wb_question")
    .where({ tenant_id: tenant.id })
    .whereNull("deleted_at")
    .orderBy([
      { column: "is_answered", order: "asc" },
      { column: "created_date", order: "desc" },
    ])
    .limit(ROW_LIMIT)
    .select(
      "question_id",
      "nm_id",
      "product_name",
      "supplier_article",
      "text",
      "answer_text",
      "state",
      "is_answered",
      "was_viewed",
      "created_date",
    );

  const funnelPeriod = await pg("wb_analytics_daily")
    .where({ tenant_id: tenant.id })
    .whereNull("deleted_at")
    .select(
      pg.raw("min(date) as period_start"),
      pg.raw("max(date) as period_end"),
      pg.raw("count(distinct nm_id)::int as listings"),
      pg.raw("count(*)::int as day_rows"),
    )
    .first();

  const funnelRows = await pg("wb_analytics_daily")
    .where({ tenant_id: tenant.id })
    .whereNull("deleted_at")
    .groupBy("nm_id", "title", "vendor_code")
    .orderByRaw("sum(orders) desc nulls last, sum(open_card) desc nulls last")
    .limit(ROW_LIMIT)
    .select(
      "nm_id",
      "title",
      "vendor_code",
      pg.raw("sum(open_card)::int as open_card"),
      pg.raw("sum(add_to_cart)::int as add_to_cart"),
      pg.raw("sum(orders)::int as orders"),
      pg.raw("coalesce(sum(ordered_sum), 0) as ordered_sum"),
      pg.raw("sum(buyouts)::int as buyouts"),
      pg.raw("coalesce(sum(buyout_sum), 0) as buyout_sum"),
      pg.raw("count(*)::int as days"),
    );

  res.json({
    sales: {
      window_days: SALES_WINDOW_DAYS,
      lines: asNumber(salesTotals?.lines),
      customer_paid: asNumber(salesTotals?.customer_paid),
      for_pay: asNumber(salesTotals?.for_pay),
      /**
       * WB's own words about this feed: "The method returns sale and return
       * information." A line with a negative `for_pay` is the return half, so
       * the count is shown rather than quietly folded into the sum.
       */
      return_lines: asNumber(salesTotals?.negative_lines),
      first_sale: asIso(salesTotals?.first_sale as Date | null),
      last_sale: asIso(salesTotals?.last_sale as Date | null),
      rows: salesRows.map((row) => ({
        ...row,
        finished_price: row.finished_price === null ? null : asNumber(row.finished_price),
        for_pay: row.for_pay === null ? null : asNumber(row.for_pay),
        sale_date: asIso(row.sale_date),
      })),
    },
    questions: {
      unanswered: asNumber(questionCounts?.unanswered),
      answered: asNumber(questionCounts?.answered),
      rows: questionRows.map((row) => ({
        ...row,
        created_date: asIso(row.created_date),
      })),
    },
    analytics: {
      period_start: (funnelPeriod?.period_start as string | null) ?? null,
      period_end: (funnelPeriod?.period_end as string | null) ?? null,
      listings: asNumber(funnelPeriod?.listings),
      day_rows: asNumber(funnelPeriod?.day_rows),
      rows: funnelRows.map((row) => ({
        ...row,
        ordered_sum: asNumber(row.ordered_sum),
        buyout_sum: asNumber(row.buyout_sum),
      })),
    },
  });
};
