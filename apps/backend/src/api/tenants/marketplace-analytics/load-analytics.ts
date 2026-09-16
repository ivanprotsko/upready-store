import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { MARKETPLACE_MODULE } from "../../../modules/marketplace";
import type MarketplaceModuleService from "../../../modules/marketplace/service";
import { MARKETPLACES } from "../../../modules/marketplace/registry";
import {
  ABC_FORMULA,
  REVENUE_FORMULA,
  STOCK_FORMULA,
  abcClasses,
  cardKey,
  cardRowsOf,
  resolvePeriod,
  saleRowsOf,
  salesByCard,
  salesByDay,
  totalsOf,
  turnoverRows,
  xyzClasses,
  type AnalyticsTotals,
  type CardRow,
  type DayPoint,
  type RawLineWithOrder,
  type ResolvedPeriod,
} from "../../../modules/marketplace/analytics";
import {
  RATING_ENDPOINTS,
  pnlBlock,
  ratingBlock,
  type LastCall,
  type SourceBlock,
} from "../../../modules/marketplace/analytics-sources";
import { getTenantScope } from "../tenant-scope";

/**
 * Loads the seller dashboard of one shop (w19-mp-analytics).
 *
 * ONE LOADER, like the order desk's: the screen and any later export must
 * answer with the same numbers, or the two become two different reports.
 *
 * IT READS OUR OWN TABLES. `mp_order`, `mp_order_line`, `mp_offer`,
 * `mp_product` and the journal `mp_api_call` / `mp_sync_run` — all filled by
 * an import script. NOTHING HERE REACHES A MARKETPLACE: not even
 * `inspectCredentials`, which on Ozon is a live `POST /v1/roles` and would
 * turn every page open into a marketplace request. `readCredentials` is the
 * one adapter member used, and it reads our own database. The analytics
 * methods are rate-limited (2 requests an hour on a base token), so they are
 * asked by an import and this screen shows what the import got.
 *
 * WHY THE FOLD IS IN MEMORY, not in SQL. Every block on the screen is a fold
 * over the same list of order lines, and the pure module holds the
 * definitions so the unit suite can pin them. The set is one shop's orders
 * inside one period; the PR quotes the wall time this costs on the client's
 * own 26 812 Wildberries orders.
 */

export type MarketplaceFacet = { marketplace: string; label: string; orders: number; revenue: number };

export type AbcSummaryRow = {
  /** `A` | `B` | `C`, or `X` | `Y` | `Z` | `null` for the XYZ half. */
  group: string | null;
  cards: number;
  units: number;
  revenue: number;
  revenue_share: number;
};

export type AnalyticsConnection = {
  marketplace: string;
  label: string;
  connected: boolean;
  /** The last ORDER import of this marketplace, whatever its outcome. */
  last_run: {
    kind: string;
    status: string;
    started_at: string | null;
    finished_at: string | null;
    rows: number | null;
    error: string | null;
    is_fixture: boolean;
  } | null;
  orders_in_period: number;
};

export type LoadedAnalytics = {
  period: ResolvedPeriod;
  applied: { marketplace: string[] };
  totals: AnalyticsTotals;
  by_day: DayPoint[];
  cards: CardRow[];
  abc: AbcSummaryRow[];
  xyz: AbcSummaryRow[];
  xyz_bucket: string;
  formulas: { revenue: string; stock: string; abc: string; xyz: string };
  facets: MarketplaceFacet[];
  connections: AnalyticsConnection[];
  rating: SourceBlock[];
  pnl: SourceBlock[];
  /** Orders the marketplace sent without a date: they fall in no period. */
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
 * The import kinds that produce ORDER rows, per marketplace's own vocabulary.
 * Same list as the order desk uses, and for the same reason: a failed `prices`
 * run says nothing about why this screen is empty.
 */
const ORDER_RUN_KINDS: Record<string, string[]> = {
  wb: ["fbs_orders", "orders"],
  ozon: ["postings"],
};

/**
 * The finance read of each marketplace, once one is registered. Empty today:
 * WB's `finance-api` answered 403 on this key (w03, 2026-09-16) and Ozon has
 * no key at all, and we register a read only after it has answered 200.
 */
const FINANCE_ENDPOINTS: Record<string, string | null> = { wb: null, ozon: null };

const summarise = (
  rows: CardRow[],
  groupOf: (row: CardRow) => string | null,
  order: (string | null)[],
): AbcSummaryRow[] => {
  const total = rows.reduce((sum, row) => sum + row.revenue, 0);
  const groups = new Map<string | null, AbcSummaryRow>();
  for (const key of order) {
    groups.set(key, { group: key, cards: 0, units: 0, revenue: 0, revenue_share: 0 });
  }
  for (const row of rows) {
    const key = groupOf(row);
    const slot =
      groups.get(key) ?? (groups.set(key, { group: key, cards: 0, units: 0, revenue: 0, revenue_share: 0 }), groups.get(key)!);
    slot.cards += 1;
    slot.units += row.units;
    slot.revenue += row.revenue;
  }
  return [...groups.values()]
    .filter((slot) => slot.cards > 0)
    .map((slot) => ({
      ...slot,
      revenue_share: total > 0 ? (slot.revenue / total) * 100 : 0,
    }));
};

export const loadAnalytics = async (
  req: AuthenticatedMedusaRequest,
  now: Date = new Date(),
): Promise<LoadedAnalytics> => {
  const tenant = await getTenantScope(req);
  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);

  const period = resolvePeriod(req.query as Record<string, unknown>, now);

  const asked = String((req.query as Record<string, unknown>).marketplace ?? "")
    .split(",")
    .map((one) => one.trim())
    .filter(Boolean);
  const known = MARKETPLACES.map((adapter) => adapter.id as string);
  const wanted = asked.filter((one) => known.includes(one));
  const labels = new Map(MARKETPLACES.map((adapter) => [adapter.id as string, adapter.label]));

  /* ---------------- the rows every block is folded over ---------------- */

  const orders = (await mp.listMpOrders({ tenant_id: tenant.id })) as Record<string, unknown>[];
  const lines = (await mp.listMpOrderLines({ tenant_id: tenant.id })) as Record<string, unknown>[];
  const offers = (await mp.listMpOffers({ tenant_id: tenant.id })) as Record<string, unknown>[];
  const products = (await mp.listMpProducts({ tenant_id: tenant.id })) as Record<string, unknown>[];

  const orderById = new Map(orders.map((order) => [String(order.id), order]));

  /** Card titles live on `mp_product`; an order line carries only the number. */
  const titleByCard = new Map<string, { title: string | null; vendor_code: string | null }>();
  for (const product of products) {
    titleByCard.set(cardKey(String(product.marketplace), String(product.external_id)), {
      title: (product.title ?? null) as string | null,
      vendor_code: (product.vendor_code ?? null) as string | null,
    });
  }

  let undated = 0;
  const raw: RawLineWithOrder[] = [];
  for (const line of lines) {
    const order = orderById.get(String(line.order_id));
    if (!order) {
      /* A line whose order is gone is a projector defect, not a silent skip. */
      logger.warn(
        `[mp-analytics] order line ${String(line.id)} points at a missing order ${String(line.order_id)}`,
      );
      continue;
    }
    const marketplace = String(order.marketplace);
    if (wanted.length && !wanted.includes(marketplace)) {
      continue;
    }
    if (!order.ordered_at) {
      undated += 1;
      continue;
    }
    const cardId = (line.external_id ?? null) as string | null;
    const known = cardId ? titleByCard.get(cardKey(marketplace, cardId)) : undefined;

    raw.push({
      marketplace,
      ordered_at: order.ordered_at as Date,
      is_cancelled: Boolean(order.is_cancelled),
      currency: (order.currency ?? null) as string | null,
      card_id: cardId,
      vendor_code: ((line.vendor_code ?? known?.vendor_code) ?? null) as string | null,
      title: (known?.title ?? null) as string | null,
      qty: line.qty === null || line.qty === undefined ? null : Number(line.qty),
      price: line.price === null || line.price === undefined ? null : Number(line.price),
    });
  }

  const saleRows = saleRowsOf(raw, period);
  const byDay = salesByDay(saleRows, period);
  const cards = salesByCard(saleRows);
  const abc = abcClasses(cards);
  const xyz = xyzClasses(saleRows, cards, period);

  const stockRows = offers
    .filter((offer) => !wanted.length || wanted.includes(String(offer.marketplace)))
    .map((offer) => ({
      marketplace: String(offer.marketplace),
      card_id: (offer.external_id ?? null) as string | null,
      stock: offer.stock === null || offer.stock === undefined ? null : Number(offer.stock),
      reserved: offer.reserved === null || offer.reserved === undefined ? null : Number(offer.reserved),
      measured_at: (offer.measured_at ?? offer.synced_at ?? null) as Date | null,
    }));

  const turnover = turnoverRows(cards, stockRows, period);
  const cardRows = cardRowsOf(cards, abc, xyz.rows, turnover);
  const totals = totalsOf(saleRows, cards, turnover, period);

  /* ---------------- what the owner must be told about each source -------- */

  const runs = (await mp.listMpSyncRuns({ tenant_id: tenant.id })) as Record<string, unknown>[];
  const calls = (await mp.listMpApiCalls({ tenant_id: tenant.id })) as Record<string, unknown>[];

  const connections: AnalyticsConnection[] = [];
  const rating: SourceBlock[] = [];
  const pnl: SourceBlock[] = [];
  const facets: MarketplaceFacet[] = [];

  for (const adapter of MARKETPLACES) {
    const id = adapter.id as string;
    const slot = await adapter.readCredentials(pg, tenant.id);
    const hasKey = Boolean(slot?.credentials);

    const kinds = ORDER_RUN_KINDS[id] ?? [];
    const last =
      runs
        .filter((run) => run.marketplace === id && kinds.includes(String(run.kind)))
        .sort(
          (a, b) =>
            new Date(String(b.started_at)).getTime() - new Date(String(a.started_at)).getTime(),
        )[0] ?? null;

    connections.push({
      marketplace: id,
      label: adapter.label,
      connected: hasKey,
      last_run: last
        ? {
            kind: String(last.kind),
            status: String(last.status),
            started_at: iso(last.started_at),
            finished_at: iso(last.finished_at),
            rows: last.rows === null || last.rows === undefined ? null : Number(last.rows),
            error: (last.error ?? null) as string | null,
            is_fixture: Boolean(last.is_fixture),
          }
        : null,
      orders_in_period: saleRows.filter((row) => row.marketplace === id && !row.is_cancelled).length,
    });

    facets.push({
      marketplace: id,
      label: adapter.label,
      orders: saleRows.filter((row) => row.marketplace === id && !row.is_cancelled).length,
      revenue: saleRows
        .filter((row) => row.marketplace === id && !row.is_cancelled)
        .reduce((sum, row) => sum + (row.revenue ?? 0), 0),
    });

    /**
     * The last recorded answer of the rating method of THIS marketplace, read
     * out of our own journal. The method itself is not called here: it is
     * rate-limited (WB gives a base token 3 requests a minute on the rating
     * and 2 an hour on the stocks report), so it is asked by an import and
     * this screen shows what the import got.
     */
    const lastCallFor = (endpointId: string | null): LastCall | null => {
      if (!endpointId) {
        return null;
      }
      const row = calls
        .filter((call) => call.marketplace === id && String(call.endpoint_id) === endpointId)
        .sort(
          (a, b) =>
            new Date(String(b.fetched_at)).getTime() - new Date(String(a.fetched_at)).getTime(),
        )[0];
      return row
        ? {
            endpoint_id: String(row.endpoint_id),
            status: row.status === null || row.status === undefined ? null : Number(row.status),
            error: (row.error ?? null) as string | null,
            fetched_at: iso(row.fetched_at),
          }
        : null;
    };

    rating.push(
      ratingBlock({
        marketplace: id,
        label: adapter.label,
        hasKey,
        lastCall: lastCallFor(RATING_ENDPOINTS[id] ?? null),
        /**
         * No rating is stored anywhere yet, and pretending otherwise would be
         * the invented number this task forbids. WB refused the method on this
         * key (403, measured 2026-09-16); when a key of the right kind exists,
         * an import mirrors the answer and this is where it arrives.
         */
        rating: null,
      }),
    );

    pnl.push(
      pnlBlock({
        marketplace: id,
        label: adapter.label,
        hasKey,
        /**
         * No finance method of any marketplace is registered, so this is
         * `null` today and the block says why in one measured sentence. The
         * lookup is here rather than in the pure module so that the day a
         * finance read IS registered, its recorded answer reaches the screen
         * without a second place to edit.
         */
        lastCall: lastCallFor(FINANCE_ENDPOINTS[id] ?? null),
      }),
    );
  }

  return {
    period,
    applied: { marketplace: wanted },
    totals,
    by_day: byDay,
    cards: cardRows,
    abc: summarise(cardRows, (row) => row.abc, ["A", "B", "C"]),
    xyz: summarise(cardRows, (row) => row.xyz, ["X", "Y", "Z", null]),
    xyz_bucket: xyz.bucket,
    formulas: { revenue: REVENUE_FORMULA, stock: STOCK_FORMULA, abc: ABC_FORMULA, xyz: xyz.formula },
    facets,
    connections,
    rating,
    pnl,
    undated,
  };
};
