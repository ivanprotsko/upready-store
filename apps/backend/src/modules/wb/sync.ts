import { WB_SYNC_KINDS, type WbSyncKind } from "./models/wb-sync-run";
import { WbApiError } from "./transport";
import {
  type WbSyncDeps,
  type WbSyncOutcome,
  type WbRunCounter,
  readerFor,
  type WbReader,
} from "./sync/core";
import { syncCards, syncPrices, syncStocks } from "./sync/catalog";
import { syncOrders, syncSales } from "./sync/feeds";
import { syncFeedbacks, syncQuestions } from "./sync/feedback";
import { syncAnalytics } from "./sync/analytics";
import { syncSupplies, syncFbsOrders } from "./sync/fbs";

/**
 * The imports (w01-wb-readonly-client), one file per stage in `sync/`
 * (t-2026-10-14-55). Every request in them goes through `wbRead`, which can
 * only send a registered read; there is no other way out of the process
 * towards Wildberries.
 *
 * Each kind writes one `wb_sync_run` row: `running` at the start, then
 * `succeeded` or `failed` with the message. A failed run stays on file rather
 * than disappearing, so an empty mirror is never mistaken for "WB had nothing"
 * (rule 20a).
 *
 * Every mirror upsert is keyed on WB's own identity of the thing (nmID, or
 * warehouse plus sku, or srid, or the feedback id), which is what makes a
 * re-run update rows instead of doubling them.
 */

export { MIRROR_PLURAL, upsertRows } from "./sync/core";
export type {
  WbSyncLimits,
  WbSyncDeps,
  WbSyncOutcome,
  WbRunCounter,
  MirrorEntity,
} from "./sync/core";

const IMPORTS: Record<
  WbSyncKind,
  (deps: WbSyncDeps, read: WbReader, counter: WbRunCounter) => Promise<void>
> = {
  cards: syncCards,
  prices: syncPrices,
  stocks: syncStocks,
  orders: syncOrders,
  sales: syncSales,
  feedbacks: syncFeedbacks,
  questions: syncQuestions,
  analytics: syncAnalytics,
  supplies: syncSupplies,
  fbs_orders: syncFbsOrders,
};

/**
 * Runs one import and records it. The run row exists before the first request,
 * so a process killed mid-import leaves a `running` row rather than no trace.
 */
/**
 * What a thrown import means for the run row (w03-wb-sales-questions-mirror).
 *
 * A 429 is WB's SCHEDULE, not our defect: on a base token the limits are the
 * normal operating condition — questions and feedbacks share five requests an
 * hour, sales get one every two hours — so a run that hits one is waiting, and
 * a run that wrote rows before hitting it is a PARTIAL SUCCESS. Recording both
 * as `failed` put four red "с ошибкой" on the owner's screen for kinds that
 * were merely waiting, which reads as a broken integration.
 *
 * `retryAt` is taken from the 429's own header via `WbApiError.retryAfterMs` —
 * a value WB measured, never one we estimate. A 429 that named no window is
 * still `rate_limited`, just without a time to show.
 */
export const classifyRunFailure = (
  error: unknown,
): { status: "rate_limited" | "failed"; retryAt: Date | null; message: string } => {
  const message = error instanceof Error ? error.message : String(error);

  if (!(error instanceof WbApiError) || error.status !== 429) {
    return { status: "failed", retryAt: null, message };
  }

  return {
    status: "rate_limited",
    retryAt: error.retryAfterMs === null ? null : new Date(Date.now() + error.retryAfterMs),
    message,
  };
};

export const runSync = async (deps: WbSyncDeps, kind: WbSyncKind): Promise<WbSyncOutcome> => {
  const run = (await deps.wb.createWbSyncRuns({
    tenant_id: deps.tenantId,
    kind,
    status: "running",
    started_at: new Date(),
    rows: 0,
    requests: 0,
  })) as { id: string };

  const counter: WbRunCounter = { requests: 0, rows: 0 };
  const read = readerFor(deps, run.id, counter);

  try {
    await IMPORTS[kind](deps, read, counter);
    await deps.wb.updateWbSyncRuns({
      id: run.id,
      status: "succeeded",
      finished_at: new Date(),
      rows: counter.rows,
      requests: counter.requests,
    });
    deps.logger.info(`[wb] ${kind}: ${counter.rows} rows in ${counter.requests} WB requests`);
    return {
      kind,
      runId: run.id,
      rows: counter.rows,
      requests: counter.requests,
      status: "succeeded",
      error: null,
      retryAt: null,
    };
  } catch (error) {
    const { status: outcome, retryAt, message } = classifyRunFailure(error);
    const limited = outcome === "rate_limited";

    await deps.wb.updateWbSyncRuns({
      id: run.id,
      status: outcome,
      finished_at: new Date(),
      rows: counter.rows,
      requests: counter.requests,
      error: message,
      retry_at: retryAt,
    });

    if (limited) {
      const when = retryAt ? `, WB opens the window at ${retryAt.toISOString()}` : "";
      deps.logger.warn(
        `[wb] ${kind}: WB rate limit after ${counter.requests} requests and ${counter.rows} rows ` +
          `written${when}. This is not a failure — run this kind again later.`,
      );
    } else {
      deps.logger.error(
        `[wb] ${kind} failed after ${counter.requests} WB requests and ${counter.rows} rows ` +
          `written: ${message}`,
      );
    }

    return {
      kind,
      runId: run.id,
      rows: counter.rows,
      requests: counter.requests,
      status: outcome,
      error: message,
      retryAt,
    };
  }
};

/**
 * `--kind all` in the order the data depends on itself: stocks need the size
 * ids the cards import writes.
 */
export const ALL_SYNC_KINDS: readonly WbSyncKind[] = WB_SYNC_KINDS;
