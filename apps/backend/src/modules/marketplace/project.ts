import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type {
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
  MpKind | "order_lines" | "links" | "journal_runs" | "journal_calls",
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

/**
 * Writes a set of drafts into one table, keyed by `keyOf`.
 *
 * Rows that exist are UPDATED, rows that do not are CREATED, and rows that the
 * mirrors no longer produce are left alone: a card withdrawn from the
 * marketplace is a fact worth keeping, and deleting it here would silently
 * shrink the owner's history. Deleting it is a separate decision with its own
 * screen, not a side effect of a projection.
 */
const upsert = async <T extends Record<string, unknown>>(
  existing: Row[],
  drafts: T[],
  keyOf: (row: Record<string, unknown>) => string,
  create: (rows: T[]) => Promise<unknown>,
  update: (rows: (T & { id: string })[]) => Promise<unknown>,
): Promise<number> => {
  const byKey = new Map(existing.map((row) => [keyOf(row), row.id]));

  const toCreate: T[] = [];
  const toUpdate: (T & { id: string })[] = [];

  for (const draft of drafts) {
    const id = byKey.get(keyOf(draft));
    if (id) {
      toUpdate.push({ ...draft, id });
    } else {
      toCreate.push(draft);
    }
  }

  if (toCreate.length) {
    await create(toCreate);
  }
  if (toUpdate.length) {
    await update(toUpdate);
  }

  return toCreate.length + toUpdate.length;
};

const identity = (row: Record<string, unknown>): string =>
  `${row.tenant_id}|${row.marketplace}|${row.external_id}`;

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
  const { runs, calls } = await adapter.loadJournal(syncDeps);

  const scope = { tenant_id: deps.tenantId, marketplace: adapter.id };
  const [storedRuns, storedCalls] = await Promise.all([
    mp.listMpSyncRuns(scope) as Promise<Row[]>,
    mp.listMpApiCalls(scope) as Promise<Row[]>,
  ]);

  const knownRuns = new Set(storedRuns.map((row) => row.id));
  const knownCalls = new Set(storedCalls.map((row) => row.id));

  const runDrafts = runs
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

  if (runDrafts.length) {
    await mp.createMpSyncRuns(runDrafts);
  }
  if (callDrafts.length) {
    await mp.createMpApiCalls(callDrafts);
  }

  return { runs: runDrafts.length, calls: callDrafts.length };
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
): Promise<ProjectionResult> => {
  const adapter: MarketplaceAdapter = requireAdapter(marketplace);
  const mp = service(deps);
  const logger = deps.logger ?? console;
  const startedAt = new Date();

  const run = (await mp.createMpSyncRuns({
    tenant_id: deps.tenantId,
    marketplace: adapter.id,
    kind: "projection",
    status: "running",
    started_at: startedAt,
    rows: 0,
    requests: 0,
  })) as { id: string };

  const counts: ProjectionCounts = {
    products: 0,
    offers: 0,
    orders: 0,
    reviews: 0,
    questions: 0,
    order_lines: 0,
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
          (await mp.listMpProducts(scope)) as Row[],
          drafts as MpProductDraft[],
          identity,
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
          (await mp.listMpOffers(scope)) as Row[],
          drafts as MpOfferDraft[],
          (row) => `${row.tenant_id}|${row.marketplace}|${row.offer_key}`,
          (created) => mp.createMpOffers(created),
          (updated) => mp.updateMpOffers(updated),
        );
        continue;
      }

      if (kind === "orders") {
        const orders = drafts as MpOrderDraft[];
        counts.orders = await upsert(
          (await mp.listMpOrders(scope)) as Row[],
          orders.map(({ lines: _lines, ...order }) => order),
          identity,
          (created) => mp.createMpOrders(created),
          (updated) => mp.updateMpOrders(updated),
        );

        /**
         * Lines are written after their orders, because a line names the
         * `mp_order.id` of its owner and that id only exists once the order
         * row does.
         */
        const stored = (await mp.listMpOrders(scope)) as Row[];
        const orderIdByExternal = new Map(stored.map((row) => [String(row.external_id), row.id]));

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
          (await mp.listMpOrderLines(scope)) as Row[],
          lineDrafts,
          (row) => `${row.tenant_id}|${row.marketplace}|${row.line_key}`,
          (created) => mp.createMpOrderLines(created),
          (updated) => mp.updateMpOrderLines(updated),
        );
        continue;
      }

      if (kind === "reviews") {
        counts.reviews = await upsert(
          (await mp.listMpReviews(scope)) as Row[],
          (drafts as MpReviewDraft[]).map(({ created_at, ...review }) => ({
            ...review,
            created_at_mp: created_at,
          })),
          identity,
          (created) => mp.createMpReviews(created),
          (updated) => mp.updateMpReviews(updated),
        );
        continue;
      }

      counts.questions = await upsert(
        (await mp.listMpQuestions(scope)) as Row[],
        (drafts as MpQuestionDraft[]).map(({ created_at, ...question }) => ({
          ...question,
          created_at_mp: created_at,
        })),
        identity,
        (created) => mp.createMpQuestions(created),
        (updated) => mp.updateMpQuestions(updated),
      );
    }

    /* The catalog match. One matcher, both marketplaces (spec 2.4). */
    const cards = ((await mp.listMpProducts(scope)) as Row[]).map((row) => ({
      external_id: String(row.external_id),
      vendor_code: row.vendor_code ? String(row.vendor_code) : null,
    }));
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
