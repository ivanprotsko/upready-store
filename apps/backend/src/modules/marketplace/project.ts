import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { chunk, cursorPages, MP_BATCH_SIZE, pagesOf, type PagedList } from "./batch";
import type {
  JournalPage,
  MarketplaceAdapter,
  MpKind,
  MpOfferDraft,
  MpOrderDraft,
  MpProductDraft,
  MpQuestionDraft,
  MpReviewDraft,
  SyncDeps,
} from "./contract";
import { MP_KINDS } from "./contract";
import { MARKETPLACE_MODULE } from "./index";
import { autoLink } from "./autolink";
import { linkSummary, type LinkReport } from "./link";
import { requireAdapter } from "./registry";
import type MarketplaceModuleService from "./service";

/**
 * Raw mirrors -> the normalized `mp_*` layer (w12-marketplace-core, spec 2.3).
 *
 * IDEMPOTENT BY CONSTRUCTION. Every table is keyed on an identity the
 * marketplace itself owns — `(tenant_id, marketplace, external_id)`, or the
 * derived `offer_key` / `line_key` where one identifier is not enough — so a
 * second run updates the same rows instead of adding a second set. The PR
 * shows two runs with identical counts rather than claiming it.
 *
 * It spends no request. Everything it reads is already in `wb_*` / `ozon_*`,
 * which is exactly why the raw mirrors are kept: a normalisation found wrong
 * later is recomputed here, not re-imported (spec 2.1).
 *
 * The run itself is a row in `mp_sync_run` with `kind = 'projection'`. A run
 * that fails leaves a `failed` row with its message: a projection that did not
 * happen has to be visible, or an empty normalized layer reads as "the
 * marketplace had nothing" (rule 20a).
 */

export type ProjectionCounts = Record<
  MpKind | "order_lines" | "status_events" | "links" | "journal_runs" | "journal_calls",
  number
>;

export type ProjectionResult = {
  tenantId: string;
  marketplace: string;
  runId: string;
  status: "succeeded" | "failed";
  counts: ProjectionCounts;
  link: LinkReport;
  linkSummary: string;
  error: string | null;
};

type Row = Record<string, unknown> & { id: string };

/** See the comment at the single cast site in `projectFromMirrors`. */
type JsonColumnRow = Parameters<MarketplaceModuleService["createMpProducts"]>[0][number];

type Deps = {
  container: SyncDeps["container"];
  tenantId: string;
  logger?: Pick<Console, "info" | "warn" | "error">;
};

const service = (deps: Deps): MarketplaceModuleService =>
  deps.container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);

type Scope = { tenant_id: string; marketplace: string };

/** A generated `list…` method of the core service, shaped for a paged read. */
const paged = (
  mp: MarketplaceModuleService,
  list: (...input: never[]) => Promise<unknown>,
): PagedList<Row> => list.bind(mp) as unknown as PagedList<Row>;

/**
 * Which of a batch of ids one table already holds. One read and no paging: an
 * id names one row, so a batch of `MP_BATCH_SIZE` ids answers with at most
 * that many.
 */
const heldIds = async (list: PagedList<Row>, scope: Scope, ids: string[]): Promise<Set<string>> => {
  const rows = await list(
    { ...scope, id: ids },
    { select: ["id"], take: MP_BATCH_SIZE, order: { id: "ASC" } },
  );
  return new Set(rows.map((row) => row.id));
};

/**
 * The ids of the rows a set of keys already has in one normalized table.
 *
 * A BATCH OF KEYS PER CALL, AND TWO COLUMNS (t-2026-10-06-21). The projector
 * used to read each normalized table whole, every column, to learn which of
 * its drafts exist: 31 061 orders with all they carry, to compare one key. It
 * now asks for the keys of the drafts themselves, `MP_BATCH_SIZE` at a time,
 * and reads back the key and the id.
 *
 * `scope` already holds the tenant and the marketplace, so inside it the key
 * column alone is the identity the unique index is built on.
 */
const idsByKey = async (
  list: PagedList<Row>,
  scope: Scope,
  column: string,
  keys: readonly string[],
): Promise<Map<string, string>> => {
  const ids = new Map<string, string>();
  for (const batch of chunk([...new Set(keys)])) {
    for await (const page of pagesOf(list, { ...scope, [column]: batch }, ["id", column])) {
      for (const row of page) {
        ids.set(String(row[column]), row.id);
      }
    }
  }
  return ids;
};

/**
 * Writes a set of drafts into one table, keyed by `column` inside `scope`.
 *
 * Rows that exist are UPDATED, rows that do not are CREATED, and rows that the
 * mirrors no longer produce are left alone: a card withdrawn from the
 * marketplace is a fact worth keeping, and deleting it here would silently
 * shrink the owner's history. Deleting it is a separate decision with its own
 * screen, not a side effect of a projection.
 *
 * NO `create`/`update` CALL CARRIES MORE THAN `MP_BATCH_SIZE` ROWS. MEASURED,
 * not guessed: a single `updateMpOffers` / `updateMpOrders` call over the
 * whole normalized table (12 035 offers, 29 007 orders on the production
 * mirror) died with `select "m0".* from "mp_offer" as "m0" where
 * ... ("m0"."id" = '…' or "m0"."id" = '…' or …)` — the generated repository
 * loads every targeted row by an OR-chain before it writes, and a chain that
 * long either blows the statement past what the driver will send or the
 * planner will parse. Splitting the call keeps every generated statement
 * bounded regardless of how many rows a projection touches.
 *
 * The ids are resolved for every draft BEFORE the first write, as the single
 * whole-table read did, so which draft is created and which is updated does
 * not depend on where a batch happens to end.
 */
const upsert = async <T extends Record<string, unknown>>(
  list: PagedList<Row>,
  scope: Scope,
  column: string,
  drafts: T[],
  create: (rows: T[]) => Promise<unknown>,
  update: (rows: (T & { id: string })[]) => Promise<unknown>,
): Promise<number> => {
  const byKey = await idsByKey(
    list,
    scope,
    column,
    drafts.map((draft) => String(draft[column])),
  );

  const toCreate: T[] = [];
  const toUpdate: (T & { id: string })[] = [];

  for (const draft of drafts) {
    const id = byKey.get(String(draft[column]));
    if (id) {
      toUpdate.push({ ...draft, id });
    } else {
      toCreate.push(draft);
    }
  }

  for (const batch of chunk(toCreate)) {
    await create(batch);
  }
  for (const batch of chunk(toUpdate)) {
    await update(batch);
  }

  return toCreate.length + toUpdate.length;
};

/**
 * Every variant of every product this tenant owns, with its SKU.
 *
 * Exported because the panel route needs exactly the same set: the linking
 * numbers on the screen have to be the numbers the projector would produce,
 * and two ways of asking "which variants are this shop's" would drift.
 */
export const tenantVariants = async (deps: Deps) => {
  const query = deps.container.resolve<{
    graph: (input: unknown) => Promise<{ data: Record<string, unknown>[] }>;
  }>(ContainerRegistrationKeys.QUERY);

  const { data } = await query.graph({
    entity: "tenant",
    fields: ["id", "products.id", "products.variants.id", "products.variants.sku"],
    filters: { id: [deps.tenantId] },
  });

  const tenant = data?.[0] as
    | { products?: { id: string; variants?: { id: string; sku: string | null }[] }[] }
    | undefined;

  return (tenant?.products ?? []).flatMap((product) =>
    (product.variants ?? []).map((variant) => ({
      id: variant.id,
      product_id: product.id,
      sku: variant.sku ?? null,
    })),
  );
};

/**
 * The adapter's own journal, a page at a time and in id order. `syncRunId`
 * narrows the transport journal to the calls of one run, which is all the
 * scheduler reads after a failure.
 */
export const journalPages = (
  adapter: MarketplaceAdapter,
  syncDeps: SyncDeps,
  of: JournalPage["of"],
  syncRunId?: string,
): AsyncGenerator<Record<string, unknown>[]> =>
  cursorPages(async (after, take) => {
    const answer = await adapter.loadJournal(syncDeps, {
      of,
      after,
      take,
      ...(syncRunId ? { syncRunId } : {}),
    });
    return answer[of];
  });

/**
 * Carries the adapter's OWN run log and transport journal into the shared
 * tables, on every projection.
 *
 * WHY THIS RUNS EVERY TIME. `Migration20260916000100` carried the rows that
 * existed when it ran, once. The imports were not rewritten by this task —
 * `modules/wb/sync.ts` and `modules/ozon/sync.ts` keep writing their own
 * tables — so without this the shared journal would age into a lie the day
 * after the migration: the acceptor's one query would answer with yesterday's
 * imports and call it everything.
 *
 * The id is DERIVED from the adapter's own (`mprun_<id>`, `mpcall_<id>`),
 * exactly as the migration derives it, so a row carried by the migration and a
 * row carried here are the same row and copying twice is impossible.
 */
const carryJournal = async (
  mp: MarketplaceModuleService,
  adapter: MarketplaceAdapter,
  deps: Deps,
  syncDeps: SyncDeps,
): Promise<{ runs: number; calls: number }> => {
  const scope: Scope = { tenant_id: deps.tenantId, marketplace: adapter.id };
  const storedRuns = paged(mp, mp.listMpSyncRuns);
  const storedCalls = paged(mp, mp.listMpApiCalls);

  let carriedRuns = 0;
  let carriedCalls = 0;

  /**
   * A PAGE OF THE ADAPTER'S JOURNAL AT A TIME (t-2026-10-06-21). Both journals
   * and both shared tables used to be read whole on every projection, to
   * subtract one set of ids from the other: 154 506 transport rows and 11 002
   * run rows with their error texts on the Russian host on 2026-10-06. Each
   * page is now checked against the shared table by its own ids, and what is
   * missing is written before the next page is read.
   */
  for await (const runs of journalPages(adapter, syncDeps, "runs")) {
    /**
     * A `running` row in the ADAPTER'S OWN log is not history yet, carried or
     * not: it is either a sync genuinely in flight (its terminal row will
     * carry cleanly once it finishes) or a process that crashed without
     * closing it (`modules/wb/sync.ts` is untouched by this task, so a stuck
     * row there stays stuck). Either way this table only carries ONE running
     * row per (tenant, marketplace, kind) — the scheduler's own lock — and the
     * adapter's log can hold many, one per triple, going back to whenever a
     * process last died mid-run. Carrying them all made every single one of
     * them a duplicate `running` insert of the SAME triple within the SAME
     * batch, and the partial unique index of `Migration20260916014707` refused
     * it with `Mp sync run with tenant_id: …, kind: orders, already exists.`
     * — the projection died on its own bookkeeping, having read no mirror row
     * yet (measured on `upready_store_w28_wbsync`, 34 stuck `orders` rows in
     * `wb_sync_run` going back to 2026-09-16).
     */
    const finished = runs.filter((run) => String(run.status) !== "running");
    if (!finished.length) {
      continue;
    }

    /**
     * A run the SCHEDULER already recorded is not carried a second time
     * (w16-mp-scheduler-ops). Its row holds `source_run_id` — the adapter's own
     * run id — and the id this function would derive from that adapter run is
     * exactly `mprun_<source_run_id>`. Without this line one scheduled import
     * would leave two rows in the shared table, the scheduler's and the carried
     * one, and the sync screen would show every sync twice.
     */
    const knownRuns = await heldIds(
      storedRuns,
      scope,
      finished.map((run) => `mprun_${String(run.id)}`),
    );
    for await (const page of pagesOf(
      storedRuns,
      { ...scope, source_run_id: finished.map((run) => String(run.id)) },
      ["id", "source_run_id"],
    )) {
      for (const row of page) {
        knownRuns.add(`mprun_${String(row.source_run_id)}`);
      }
    }

    const runDrafts = finished
      .map((run) => ({
        id: `mprun_${String(run.id)}`,
        tenant_id: String(run.tenant_id),
        marketplace: adapter.id,
        kind: String(run.kind),
        status: String(run.status),
        is_fixture: Boolean(run.is_fixture),
        started_at: run.started_at as Date,
        finished_at: (run.finished_at ?? null) as Date | null,
        rows: Number(run.rows ?? 0),
        requests: Number(run.requests ?? 0),
        error: (run.error ?? null) as string | null,
      }))
      .filter((run) => !knownRuns.has(run.id));

    if (runDrafts.length) {
      await mp.createMpSyncRuns(runDrafts);
      carriedRuns += runDrafts.length;
    }
  }

  for await (const calls of journalPages(adapter, syncDeps, "calls")) {
    const knownCalls = await heldIds(
      storedCalls,
      scope,
      calls.map((call) => `mpcall_${String(call.id)}`),
    );

    const callDrafts = calls
      .map((call) => ({
        id: `mpcall_${String(call.id)}`,
        tenant_id: (call.tenant_id ?? null) as string | null,
        marketplace: adapter.id,
        sync_run_id: call.sync_run_id ? `mprun_${String(call.sync_run_id)}` : null,
        endpoint_id: String(call.endpoint_id),
        host: String(call.host),
        method: String(call.method),
        path: String(call.path),
        status: (call.status ?? null) as number | null,
        ms: Number(call.ms ?? 0),
        error: (call.error ?? null) as string | null,
        is_fixture: Boolean(call.is_fixture),
        fetched_at: call.fetched_at as Date,
      }))
      .filter((call) => !knownCalls.has(call.id));

    if (callDrafts.length) {
      await mp.createMpApiCalls(callDrafts);
      carriedCalls += callDrafts.length;
    }
  }

  return { runs: carriedRuns, calls: carriedCalls };
};

/**
 * The status history the order card shows, appended rather than rewritten
 * (w15-mp-orders-desk).
 *
 * Neither marketplace hands us a status LOG — both answer with the status an
 * order has right now — so the only history we can honestly own is the one we
 * observed. A row is written the first time an order is seen and then only
 * when the pair (`status`, `status_detail`) has actually changed, which makes
 * this a change log instead of one row per projection run.
 *
 * `observed_at` is the mirror's own `synced_at`: the moment the marketplace
 * ANSWERED, not the moment this projection ran. Stamping it with the
 * projector's clock would date every event of a replay to today and quietly
 * rewrite the history it exists to preserve (rule 17a).
 *
 * IDEMPOTENT. `event_key` is `${order_id}|${observed_at}`, so replaying the
 * same mirrors writes the same keys and nothing doubles.
 */
const recordStatusEvents = async (
  mp: MarketplaceModuleService,
  scope: { tenant_id: string; marketplace: string },
  orders: MpOrderDraft[],
  orderIdByExternal: Map<string, string>,
): Promise<number> => {
  /**
   * The events of the orders this run carries, by a batch of order ids and a
   * page of events at a time (t-2026-10-06-21). The whole history of every
   * order of the shop used to be read on every projection.
   */
  const orderIds = [
    ...new Set(
      orders.flatMap((order) => {
        const orderId = orderIdByExternal.get(order.external_id);
        return orderId ? [orderId] : [];
      }),
    ),
  ];

  /** The newest observation per order, which is what a change is measured against. */
  const latestByOrder = new Map<string, Row>();
  const known = new Set<string>();

  for (const batch of chunk(orderIds)) {
    for await (const page of pagesOf(
      paged(mp, mp.listMpOrderStatusEvents),
      { ...scope, order_id: batch },
      ["id", "order_id", "event_key", "status", "status_detail", "observed_at"],
    )) {
      for (const event of page) {
        const orderId = String(event.order_id);
        const current = latestByOrder.get(orderId);
        if (
          !current ||
          new Date(String(event.observed_at)) > new Date(String(current.observed_at))
        ) {
          latestByOrder.set(orderId, event);
        }
        known.add(String(event.event_key));
      }
    }
  }

  const drafts: Record<string, unknown>[] = [];

  for (const order of orders) {
    const orderId = orderIdByExternal.get(order.external_id);
    if (!orderId) {
      continue;
    }

    const latest = latestByOrder.get(orderId);
    const unchanged =
      latest &&
      (latest.status ?? null) === order.status &&
      (latest.status_detail ?? null) === order.status_detail;
    if (unchanged) {
      continue;
    }

    const eventKey = `${orderId}|${order.synced_at.toISOString()}`;
    if (known.has(eventKey)) {
      continue;
    }
    known.add(eventKey);

    drafts.push({
      tenant_id: order.tenant_id,
      marketplace: order.marketplace,
      order_id: orderId,
      event_key: eventKey,
      status: order.status,
      status_detail: order.status_detail,
      status_changed_at: order.status_changed_at,
      observed_at: order.synced_at,
    });
  }

  for (const batch of chunk(drafts)) {
    await mp.createMpOrderStatusEvents(batch);
  }

  return drafts.length;
};

/**
 * Recomputes the whole normalized layer of one marketplace for one shop.
 *
 * `marketplace` is resolved through `registry.ts`, so this function knows
 * nothing about Wildberries or Ozon and a third adapter needs no line here.
 */
export const projectFromMirrors = async (
  deps: Deps,
  marketplace: string,
  options: {
    /**
     * An existing `mp_sync_run` row to report into, instead of opening one.
     *
     * The scheduler takes the single-run lock by INSERTING the `running` row
     * itself (`scheduler.ts`), and a second insert for the same triple is
     * refused by the partial unique index — correctly, since that is the lock.
     * So a scheduled projection hands its own row down here and one run stays
     * one row.
     */
    runId?: string;
  } = {},
): Promise<ProjectionResult> => {
  const adapter: MarketplaceAdapter = requireAdapter(marketplace);
  const mp = service(deps);
  const logger = deps.logger ?? console;
  const startedAt = new Date();

  const run = options.runId
    ? { id: options.runId }
    : ((await mp.createMpSyncRuns({
        tenant_id: deps.tenantId,
        marketplace: adapter.id,
        kind: "projection",
        status: "running",
        started_at: startedAt,
        rows: 0,
        requests: 0,
      })) as { id: string });

  const counts: ProjectionCounts = {
    products: 0,
    offers: 0,
    orders: 0,
    reviews: 0,
    questions: 0,
    order_lines: 0,
    status_events: 0,
    links: 0,
    journal_runs: 0,
    journal_calls: 0,
  };

  let report: LinkReport = {
    total: 0,
    linked: [],
    notFound: [],
    ambiguous: [],
    accountedFor: 0,
  };

  try {
    const syncDeps: SyncDeps = {
      container: deps.container,
      tenantId: deps.tenantId,
      credentials: null,
      logger,
    };

    const scope = { tenant_id: deps.tenantId, marketplace: adapter.id };

    const carried = await carryJournal(mp, adapter, deps, syncDeps);
    counts.journal_runs = carried.runs;
    counts.journal_calls = carried.calls;

    for (const kind of MP_KINDS) {
      const rows = await adapter.loadMirror(syncDeps, kind as MpKind);
      const drafts = adapter.normalize[kind](rows);

      if (kind === "products") {
        counts.products = await upsert(
          paged(mp, mp.listMpProducts),
          scope,
          "external_id",
          drafts as MpProductDraft[],
          /**
           * The cast is here and nowhere else. Medusa generates the type of a
           * `model.json()` column as `Record<string, unknown>`, while `jsonb`
           * holds an array just as happily — and WB's `photos` IS an array.
           * Bending the draft to fit a type narrower than the column would
           * change the data to please the compiler, so the narrowing is
           * refused in one named place instead.
           */
          (created) => mp.createMpProducts(created as unknown as JsonColumnRow[]),
          (updated) => mp.updateMpProducts(updated as unknown as JsonColumnRow[]),
        );
        continue;
      }

      if (kind === "offers") {
        counts.offers = await upsert(
          paged(mp, mp.listMpOffers),
          scope,
          "offer_key",
          drafts as MpOfferDraft[],
          (created) => mp.createMpOffers(created),
          (updated) => mp.updateMpOffers(updated),
        );
        continue;
      }

      if (kind === "orders") {
        const orders = drafts as MpOrderDraft[];
        counts.orders = await upsert(
          paged(mp, mp.listMpOrders),
          scope,
          "external_id",
          orders.map(({ lines: _lines, ...order }) => order),
          (created) => mp.createMpOrders(created),
          (updated) => mp.updateMpOrders(updated),
        );

        /**
         * Lines are written after their orders, because a line names the
         * `mp_order.id` of its owner and that id only exists once the order
         * row does.
         */
        const orderIdByExternal = await idsByKey(
          paged(mp, mp.listMpOrders),
          scope,
          "external_id",
          orders.map((order) => order.external_id),
        );

        const lineDrafts = orders.flatMap((order) => {
          const orderId = orderIdByExternal.get(order.external_id);
          if (!orderId) {
            return [];
          }
          return order.lines.map((line) => ({
            tenant_id: order.tenant_id,
            marketplace: order.marketplace,
            order_id: orderId,
            line_key: line.line_key,
            vendor_code: line.vendor_code,
            external_id: line.external_id,
            qty: line.qty,
            price: line.price,
            discount: line.discount,
            source_row_id: order.source_row_id,
            synced_at: order.synced_at,
          }));
        });

        counts.order_lines = await upsert(
          paged(mp, mp.listMpOrderLines),
          scope,
          "line_key",
          lineDrafts,
          (created) => mp.createMpOrderLines(created),
          (updated) => mp.updateMpOrderLines(updated),
        );

        counts.status_events = await recordStatusEvents(mp, scope, orders, orderIdByExternal);
        continue;
      }

      if (kind === "reviews") {
        counts.reviews = await upsert(
          paged(mp, mp.listMpReviews),
          scope,
          "external_id",
          (drafts as MpReviewDraft[]).map(({ created_at, ...review }) => ({
            ...review,
            created_at_mp: created_at,
          })),
          (created) => mp.createMpReviews(created),
          (updated) => mp.updateMpReviews(updated),
        );
        continue;
      }

      counts.questions = await upsert(
        paged(mp, mp.listMpQuestions),
        scope,
        "external_id",
        (drafts as MpQuestionDraft[]).map(({ created_at, ...question }) => ({
          ...question,
          created_at_mp: created_at,
        })),
        (created) => mp.createMpQuestions(created),
        (updated) => mp.updateMpQuestions(updated),
      );
    }

    /* The catalog match. One matcher, both marketplaces (spec 2.4). */
    const cards: { external_id: string; vendor_code: string | null }[] = [];
    for await (const page of pagesOf(paged(mp, mp.listMpProducts), scope, [
      "id",
      "external_id",
      "vendor_code",
    ])) {
      for (const row of page) {
        cards.push({
          external_id: String(row.external_id),
          vendor_code: row.vendor_code ? String(row.vendor_code) : null,
        });
      }
    }
    /**
     * The write goes through `autoLink` and not through the `upsert` above,
     * because a link is the one row here a PERSON can own: `matched_by =
     * 'manual'` is the owner's choice between two candidates, and the upsert
     * keyed on the card alone would have overwritten it on the next import
     * (w14-mp-catalog-link). The same call backs the panel's «Связать всё по
     * артикулу», so the two can no longer drift.
     */
    const outcome = await autoLink(mp, scope, cards, await tenantVariants(deps));
    report = outcome.report;
    counts.links = outcome.written;

    /**
     * `rows` counts the NORMALIZED rows this projection wrote. The journal
     * rows it carried across are counted separately in `counts` and shown, but
     * they are not normalized data and adding them here would inflate a number
     * the panel presents as "how much of your marketplace is in our database".
     */
    const rows = (Object.entries(counts) as [string, number][])
      .filter(([name]) => !name.startsWith("journal_"))
      .reduce((sum, [, value]) => sum + value, 0);

    await mp.updateMpSyncRuns([
      {
        id: run.id,
        status: "succeeded",
        finished_at: new Date(),
        rows,
        /** A projection spends no request; a zero here is the truth, not a gap. */
        requests: 0,
      },
    ]);

    logger.info(
      `[marketplace] projection ${adapter.id} / ${deps.tenantId}: ${rows} rows. ` +
        linkSummary(report),
    );

    return {
      tenantId: deps.tenantId,
      marketplace: adapter.id,
      runId: run.id,
      status: "succeeded",
      counts,
      link: report,
      linkSummary: linkSummary(report),
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await mp.updateMpSyncRuns([
      { id: run.id, status: "failed", finished_at: new Date(), error: message },
    ]);
    logger.error(`[marketplace] projection ${adapter.id} / ${deps.tenantId} failed: ${message}`);

    return {
      tenantId: deps.tenantId,
      marketplace: adapter.id,
      runId: run.id,
      status: "failed",
      counts,
      link: report,
      linkSummary: linkSummary(report),
      error: message,
    };
  }
};
