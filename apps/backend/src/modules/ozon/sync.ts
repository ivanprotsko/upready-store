import { OZON_SYNC_KINDS, type OzonSyncKind } from "./models/ozon-sync-run";
import {
  type OzonSyncDeps,
  type OzonSyncOutcome,
  type OzonRunCounter,
  readerFor,
  type OzonReader,
} from "./sync/core";
import { syncProducts, syncPrices, syncStocks } from "./sync/catalog";
import { syncPostings } from "./sync/postings";
import { syncReviews, syncQuestions } from "./sync/feedback";

/**
 * The imports (w11-ozon-readonly-client), one file per stage in `sync/`
 * (t-2026-10-14-55). Every request in them goes through `ozonRead`, which can
 * only send a registered read; there is no other way out of the process
 * towards Ozon.
 *
 * Each kind writes one `ozon_sync_run` row: `running` at the start, then
 * `succeeded` or `failed` with the message. A failed run stays on file rather
 * than disappearing, so an empty mirror is never mistaken for "Ozon had
 * nothing" (rule 20a). Reviews and questions sit behind Ozon subscriptions, so
 * a failed run with Ozon's own error is the NORMAL outcome for a cabinet
 * without one, and it has to be visible rather than silently empty.
 *
 * Every mirror upsert is keyed on Ozon's own identity of the thing
 * (product_id, or sku plus scheme, or posting_number, or the review id), which
 * is what makes a re-run update rows instead of doubling them.
 *
 * FIXTURE MODE. Ozon documents no sandbox. `mode: "fixtures"` answers from
 * `fixtures.ts` instead of the network — but still through `resolveEndpoint`,
 * so an unregistered id is refused exactly as it is on the wire, and still
 * through the journal, so the run leaves the same evidence with
 * `is_fixture = true` on every row.
 */

export { upsertRows } from "./sync/core";
export type { OzonSyncMode, OzonSyncDeps, OzonSyncOutcome, OzonRunCounter } from "./sync/core";

const IMPORTS: Record<
  OzonSyncKind,
  (deps: OzonSyncDeps, read: OzonReader, counter: OzonRunCounter) => Promise<void>
> = {
  products: syncProducts,
  prices: syncPrices,
  stocks: syncStocks,
  postings: syncPostings,
  reviews: syncReviews,
  questions: syncQuestions,
};

/**
 * Runs one import and records it. The run row exists before the first request,
 * so a process killed mid-import leaves a `running` row rather than no trace.
 */
export const runSync = async (
  deps: OzonSyncDeps,
  kind: OzonSyncKind,
): Promise<OzonSyncOutcome> => {
  const isFixture = deps.mode === "fixtures";

  const run = (await deps.ozon.createOzonSyncRuns({
    tenant_id: deps.tenantId,
    kind,
    status: "running",
    is_fixture: isFixture,
    started_at: new Date(),
    rows: 0,
    requests: 0,
  })) as { id: string };

  const counter: OzonRunCounter = { requests: 0, rows: 0 };
  const read = readerFor(deps, run.id, counter);

  try {
    await IMPORTS[kind](deps, read, counter);
    await deps.ozon.updateOzonSyncRuns({
      id: run.id,
      status: "succeeded",
      finished_at: new Date(),
      rows: counter.rows,
      requests: counter.requests,
    });
    deps.logger.info(
      `[ozon] ${kind}: ${counter.rows} rows in ${counter.requests} ` +
        `${isFixture ? "fixture reads" : "Ozon requests"}`,
    );
    return {
      kind,
      runId: run.id,
      rows: counter.rows,
      requests: counter.requests,
      status: "succeeded",
      isFixture,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.ozon.updateOzonSyncRuns({
      id: run.id,
      status: "failed",
      finished_at: new Date(),
      rows: counter.rows,
      requests: counter.requests,
      error: message,
    });
    deps.logger.error(
      `[ozon] ${kind} failed after ${counter.requests} requests and ${counter.rows} rows ` +
        `written: ${message}`,
    );
    return {
      kind,
      runId: run.id,
      rows: counter.rows,
      requests: counter.requests,
      status: "failed",
      isFixture,
      error: message,
    };
  }
};

/**
 * `--kind all` in the order the data depends on itself: prices and stocks read
 * better once the cards they belong to are mirrored.
 */
export const ALL_SYNC_KINDS: readonly OzonSyncKind[] = OZON_SYNC_KINDS;
