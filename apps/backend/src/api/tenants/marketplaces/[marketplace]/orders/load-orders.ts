import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace";
import type MarketplaceModuleService from "../../../../../modules/marketplace/service";
import type { MarketplaceAdapter } from "../../../../../modules/marketplace/contract";
import { MARKETPLACE_IDS, adapterFor } from "../../../../../modules/marketplace/registry";
import {
  connectionNotice,
  mpOrderToRow,
  resolveMpOrdersQuery,
  selectMpOrders,
  type ConnectionNotice,
  type FeedRow,
  type MpOrderRow,
  type MpOrdersQuery,
  type MpOrdersSelection,
} from "../../../../../modules/marketplace/order-feed";
import { getTenantScope } from "../../../tenant-scope";

/**
 * Loads the orders of ONE marketplace for one shop («Wildberries → Заказы»,
 * mp-section-design task-04).
 *
 * WHY ONE LOADER FOR TWO ROUTES. The list and the CSV have to answer with the
 * SAME set, or the export quietly becomes a different report from the table
 * above it. One function, two callers, and the PR proves the equality by
 * counting the rows of the file against the count on the screen.
 *
 * IT READS OUR OWN TABLES AND NOTHING ELSE. `mp_order` / `mp_order_line` are
 * filled by the projector from mirrors an import script wrote; no adapter
 * network member, no endpoint and no credential VALUE appears anywhere below
 * (`readCredentials` reads the shop's own database to say whether a key is
 * saved). That is what makes this screen read-only by construction rather
 * than by promise (Ivan, 2026-09-16 02:46 WITA).
 *
 * WHY ONE SQL STATEMENT AND THE FILTERS IN MEMORY. The facets are counted over
 * every order of the marketplace before any filter, and the common status key
 * is computed from two raw columns by `statusKeyOf`, so the whole set is read
 * either way. Read through the module's `list…` it is one entity per row
 * (30 382 orders and as many lines on the stand, 2026-10-05); read here it is
 * one statement over the columns the list shows.
 *
 * THE LINES ARE COUNTED FOR THE ROWS ANSWERED, NOT FOR ALL OF THEM. A
 * correlated count per order cost ~10 s over the stand's 30 382 orders
 * (`EXPLAIN ANALYZE`, 2026-10-05), and the list shows 20. So `loadMpOrders`
 * leaves `lines_count` unset and each route runs `withLineCounts` over exactly
 * the rows it sends: one page, or the rows of the file.
 */

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
  /**
   * How many orders of this marketplace the shop holds. The field keeps its
   * w15 name because the panel's `FeedConnection` type is shared; the list no
   * longer has a period, so it is every order.
   */
  rows_in_period: number;
  /**
   * What the screen must SAY about this marketplace, decided in one pure
   * function the unit suite covers. `null` means «connected, imported, nothing
   * to announce» — and a banner that is always there stops being read.
   */
  notice: ConnectionNotice | null;
};

export type LoadedMpOrders = MpOrdersSelection & {
  query: MpOrdersQuery;
  connection: FeedConnection;
};

const iso = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  const at = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

/**
 * The adapter the path names, or a 404 that lists what there is. `wb` and
 * `ozon` are the ids, the same the rest of `/tenants/marketplaces/:marketplace/*`
 * answers to.
 */
export const marketplaceOf = (req: AuthenticatedMedusaRequest): MarketplaceAdapter => {
  const id = String(req.params.marketplace ?? "");
  const adapter = adapterFor(id);
  if (!adapter) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Маркетплейс ${id} не подключён. Есть: ${MARKETPLACE_IDS.join(", ")}.`,
    );
  }
  return adapter;
};

/**
 * Every order of one marketplace of one shop, in the shape of the list, with
 * `lines_count` still 0: see `withLineCounts`.
 */
const readRows = async (
  pg: Knex,
  tenantId: string,
  marketplace: string,
  sellerCurrency: string | null,
): Promise<FeedRow[]> => {
  const rows = (await pg("mp_order")
    .select(
      "id",
      "marketplace",
      "external_id",
      "scheme",
      "status",
      "status_detail",
      "ordered_at",
      "buyer_region",
      "warehouse_name",
      "total",
      "currency",
      "is_cancelled",
    )
    .where({ tenant_id: tenantId, marketplace })
    .whereNull("deleted_at")) as MpOrderRow[];

  return rows.map((row) => mpOrderToRow(row, 0, sellerCurrency));
};

/**
 * The currency the shop's own prices on this marketplace are in, the most
 * common `mp_offer.currency` — the same rule «Аналитика» prints its sums by
 * (`sellerCurrencyOf`). `null` when no price was ever imported.
 */
export const readSellerCurrency = async (
  pg: Knex,
  tenantId: string,
  marketplace: string,
): Promise<string | null> => {
  const [top] = (await pg("mp_offer")
    .select("currency")
    .count({ n: "*" })
    .where({ tenant_id: tenantId, marketplace })
    .whereNotNull("currency")
    .whereNull("deleted_at")
    .groupBy("currency")
    .orderBy("n", "desc")
    .limit(1)) as { currency: string; n: string | number }[];
  return top?.currency ?? null;
};

/** At most this many ids in one `IN (…)`, well under Postgres' 65 535 bind parameters. */
const ID_BATCH = 5_000;

/**
 * The same rows with their real `lines_count`, read for exactly these ids
 * over the `order_id` index. Every route answers through this, so a 0 the
 * owner sees is a 0 the table holds (rule 20a), never the placeholder.
 */
export const withLineCounts = async (
  req: AuthenticatedMedusaRequest,
  rows: FeedRow[],
): Promise<FeedRow[]> => {
  if (!rows.length) {
    return rows;
  }
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const counts = new Map<string, number>();
  for (let i = 0; i < rows.length; i += ID_BATCH) {
    const ids = rows.slice(i, i + ID_BATCH).map((row) => row.id);
    const found = (await pg("mp_order_line")
      .select("order_id")
      .count({ lines: "*" })
      .whereIn("order_id", ids)
      .whereNull("deleted_at")
      .groupBy("order_id")) as { order_id: string; lines: string | number }[];
    for (const one of found) {
      counts.set(String(one.order_id), Number(one.lines));
    }
  }
  return rows.map((row) => ({ ...row, lines_count: counts.get(row.id) ?? 0 }));
};

/** Whether the shop has a key, and how the last ORDER import of this marketplace ended. */
const readConnection = async (
  req: AuthenticatedMedusaRequest,
  adapter: MarketplaceAdapter,
  tenantId: string,
  orders: number,
): Promise<FeedConnection> => {
  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const slot = await adapter.readCredentials(pg, tenantId);
  const kinds = ORDER_RUN_KINDS[adapter.id] ?? [];

  const [last] = kinds.length
    ? ((await mp.listMpSyncRuns(
        { tenant_id: tenantId, marketplace: adapter.id, kind: kinds },
        { order: { started_at: "DESC" }, take: 1 },
      )) as Record<string, unknown>[])
    : [];

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

  return {
    marketplace: adapter.id,
    label: adapter.label,
    connected,
    last_run: lastRun,
    rows_in_period: orders,
    notice: connectionNotice({ connected, last_run: lastRun }),
  };
};

export const loadMpOrders = async (req: AuthenticatedMedusaRequest): Promise<LoadedMpOrders> => {
  const adapter = marketplaceOf(req);
  /** Read before the tenant, so a malformed filter answers 400 without a database round trip. */
  const query = resolveMpOrdersQuery(req.query as Record<string, unknown>);
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  const sellerCurrency = await readSellerCurrency(pg, tenant.id, adapter.id);
  const all = await readRows(pg, tenant.id, adapter.id, sellerCurrency);
  const selection = selectMpOrders(all, query);
  const connection = await readConnection(req, adapter, tenant.id, selection.total);

  return { ...selection, query, connection };
};
