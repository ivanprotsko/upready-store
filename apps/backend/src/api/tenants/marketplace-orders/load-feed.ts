import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { MARKETPLACE_MODULE } from "../../../modules/marketplace";
import type MarketplaceModuleService from "../../../modules/marketplace/service";
import { MARKETPLACES } from "../../../modules/marketplace/registry";
import {
  byDateDesc,
  compactLinkedRows,
  facetsOf,
  inPeriod,
  matchesFilters,
  mpOrderToRow,
  connectionNotice,
  resolveFilters,
  shopOrderToRow,
  type ConnectionNotice,
  type FeedFacets,
  type FeedRow,
} from "../../../modules/marketplace/order-feed";
import { getTenantScope } from "../tenant-scope";

/**
 * Loads the single order feed for one shop (w15-mp-orders-desk).
 *
 * WHY ONE LOADER FOR THREE ROUTES. The list, the CSV and the counts on the
 * screen have to answer with the SAME set, or the export quietly becomes a
 * different report from the table above it. One function, three callers, and
 * the PR proves the equality by counting the rows of the file against the
 * count on the screen.
 *
 * IT READS OUR OWN TABLES AND NOTHING ELSE. `mp_order` / `mp_order_line` are
 * filled by the projector from mirrors an import script wrote; no adapter, no
 * endpoint and no credential appears anywhere below. That is what makes this
 * screen read-only by construction rather than by promise (Ivan,
 * 2026-09-16 02:46 WITA).
 *
 * WHY THE MERGE IS IN MEMORY. The two halves live in different modules with
 * different identity columns, so one SQL statement over both would mean
 * reaching past Medusa's module boundary into another module's table. The set
 * is one shop's orders inside one period; the PR quotes the wall time this
 * costs on the client's own 8075 Wildberries orders. If a shop ever outgrows
 * that, the fix is a paged query per source with a merge sort, not a join
 * across modules.
 */

export type FeedConnection = {
  marketplace: string;
  label: string;
  /** False when the shop has no key for this marketplace: «нет подключения». */
  connected: boolean;
  /** The last import of ORDERS for this marketplace, whatever its outcome. */
  last_run: {
    kind: string;
    status: string;
    started_at: string | null;
    finished_at: string | null;
    rows: number | null;
    error: string | null;
    is_fixture: boolean;
  } | null;
  /** How many rows of this marketplace are in the period at all. */
  rows_in_period: number;
  /**
   * What the screen must SAY about this marketplace, decided in one pure
   * function the unit suite covers. `null` means «connected, imported, nothing
   * to announce» — and a banner that is always there stops being read.
   */
  notice: ConnectionNotice | null;
};

export type LoadedFeed = {
  rows: FeedRow[];
  /** The rows of the period, before the source/scheme/status filters. */
  periodRows: FeedRow[];
  facets: FeedFacets;
  filters: ReturnType<typeof resolveFilters>;
  connections: FeedConnection[];
  /** Orders the marketplace never dated, and which therefore fall in no period. */
  undated: number;
};

const iso = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  const at = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

/**
 * The kinds of run that produce ORDER rows, per adapter's own vocabulary.
 * Wildberries imports `orders` (statistics) and `fbs_orders` (assembly), Ozon
 * imports `postings`. Named here rather than guessed from the kind string,
 * because a run named `prices` failing says nothing about this screen.
 */
const ORDER_RUN_KINDS: Record<string, string[]> = {
  wb: ["fbs_orders", "orders"],
  ozon: ["postings"],
};

export const loadFeed = async (
  req: AuthenticatedMedusaRequest,
  now: Date = new Date(),
): Promise<LoadedFeed> => {
  const tenant = await getTenantScope(req);
  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const filters = resolveFilters(req.query as Record<string, unknown>, now);

  /* ---------------- marketplace half ---------------- */

  const mpOrders = (await mp.listMpOrders({ tenant_id: tenant.id })) as Record<string, unknown>[];
  const mpLines = (await mp.listMpOrderLines({ tenant_id: tenant.id })) as Record<
    string,
    unknown
  >[];

  const linesByOrder = new Map<string, number>();
  for (const line of mpLines) {
    const key = String(line.order_id);
    linesByOrder.set(key, (linesByOrder.get(key) ?? 0) + 1);
  }

  let undated = 0;
  const marketplaceRows: FeedRow[] = [];
  for (const order of mpOrders) {
    if (!order.ordered_at) {
      undated += 1;
      continue;
    }
    if (!inPeriod(order.ordered_at as Date, filters.from, filters.to)) {
      continue;
    }
    marketplaceRows.push(
      mpOrderToRow(
        order as never,
        linesByOrder.get(String(order.id)) ?? 0,
      ),
    );
  }

  /* ---------------- shop half ---------------- */

  /**
   * The tenant's own orders, through the same link the rest of `/tenants/*`
   * walks (`tenant.orders`). Asked with the period already in the filter, so a
   * shop with a long history does not load it all to throw it away.
   */
  const { data: tenantRows } = await query.graph({
    entity: "tenant",
    fields: [
      "id",
      "orders.id",
      "orders.display_id",
      "orders.status",
      "orders.fulfillment_status",
      "orders.created_at",
      "orders.currency_code",
      "orders.total",
      "orders.items.id",
      "orders.shipping_address.province",
      "orders.shipping_address.city",
    ],
    filters: { id: [tenant.id] },
  });

  const shopOrders = compactLinkedRows(
    (tenantRows?.[0] as { orders?: unknown[] } | undefined)?.orders,
  ) as Record<string, unknown>[];

  const shopRows: FeedRow[] = [];
  for (const order of shopOrders) {
    if (!order.created_at) {
      undated += 1;
      continue;
    }
    if (!inPeriod(order.created_at as Date, filters.from, filters.to)) {
      continue;
    }
    shopRows.push(shopOrderToRow(order as never));
  }

  const periodRows = [...marketplaceRows, ...shopRows].sort(byDateDesc);
  const rows = periodRows.filter((row) => matchesFilters(row, filters));

  /* ---------------- what the owner must be told about each marketplace ---- */

  const runs = (await mp.listMpSyncRuns({ tenant_id: tenant.id })) as Record<string, unknown>[];

  const connections: FeedConnection[] = [];
  for (const adapter of MARKETPLACES) {
    const slot = await adapter.readCredentials(pg, tenant.id);
    const kinds = ORDER_RUN_KINDS[adapter.id] ?? [];

    const ownRuns = runs
      .filter((run) => run.marketplace === adapter.id && kinds.includes(String(run.kind)))
      .sort(
        (a, b) =>
          new Date(String(b.started_at)).getTime() - new Date(String(a.started_at)).getTime(),
      );

    const last = ownRuns[0] ?? null;

    const lastRun = last
      ? {
          kind: String(last.kind),
          status: String(last.status),
          started_at: iso(last.started_at),
          finished_at: iso(last.finished_at),
          rows: last.rows === null || last.rows === undefined ? null : Number(last.rows),
          error: (last.error ?? null) as string | null,
          is_fixture: Boolean(last.is_fixture),
        }
      : null;

    const connected = Boolean(slot?.credentials);

    connections.push({
      marketplace: adapter.id,
      label: adapter.label,
      connected,
      last_run: lastRun,
      rows_in_period: periodRows.filter((row) => row.source === adapter.id).length,
      notice: connectionNotice({ connected, last_run: lastRun }),
    });
  }

  return { rows, periodRows, facets: facetsOf(periodRows), filters, connections, undated };
};
