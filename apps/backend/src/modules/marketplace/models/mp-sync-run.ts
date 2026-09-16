import { model } from "@medusajs/framework/utils";

/**
 * One import of one kind of one marketplace, from its first request to its
 * last (w12-marketplace-core).
 *
 * ONE table for every marketplace, not one per marketplace. The acceptor's
 * question is "what actually ran, everywhere", and two tables are two queries
 * and one forgotten marketplace (spec 2.3). `wb_sync_run` rows are carried
 * into this table by `Migration20260916MarketplaceBackfill` with
 * `marketplace = 'wb'`; the old tables keep their rows and are dropped in a
 * later step, after acceptance.
 *
 * A run that crashed keeps `status = 'failed'` and its message rather than
 * vanishing: an import that did not happen has to be visible, or an empty
 * normalized layer reads as "the marketplace had nothing" (rule 20a).
 *
 * `kind` is text and not an enum because the vocabulary belongs to the
 * adapter: WB imports cards/prices/stocks/orders/feedbacks, Ozon imports
 * products/prices/stocks/postings/reviews/questions, and `projection` is this
 * module's own kind for a run of the projector.
 */
const MpSyncRun = model
  .define("mp_sync_run", {
    id: model.id({ prefix: "mprun" }).primaryKey(),
    tenant_id: model.text(),
    marketplace: model.text(),
    kind: model.text(),
    /**
     * `running` | `succeeded` | `rate_limited` | `failed`.
     *
     * FOUR values, not three. `rate_limited` is a run the marketplace refused
     * to serve right now, which is neither a success nor a defect of ours:
     * WB's base token gives feedbacks five requests an hour, so a limit is the
     * STANDING mode there, and painting it red sends the owner looking for a
     * bug that is not there (w03's acceptance round paid for this lesson; the
     * adapters' own `SyncOutcome` has carried the value since, and this column
     * is where the scheduler records it).
     */
    status: model.text().default("running"),
    /** True when the rows came from recorded fixtures rather than the network. */
    is_fixture: model.boolean().default(false),
    started_at: model.dateTime(),
    finished_at: model.dateTime().nullable(),
    rows: model.number().default(0),
    requests: model.number().default(0),
    error: model.text().nullable(),
    /**
     * When the MARKETPLACE said this kind may be read again, set only on a
     * `rate_limited` run and taken from its own `Retry-After` /
     * `X-Ratelimit-Retry` header, never estimated by us. `schedule.ts` refuses
     * to start the triple before it, which is what keeps a ten-minute interval
     * from hammering a three-hour window.
     */
    retry_at: model.dateTime().nullable(),
    /**
     * How many times the scheduler called the adapter for THIS run, the first
     * try included. A run that ends after three shows `3`, which is the
     * difference between "the marketplace refused once" and "it refused every
     * time we asked".
     */
    attempts: model.number().default(1),
    /**
     * The adapter's OWN run id (`wbrun_…`, `ozrun_…`) when this row was opened
     * by the scheduler for an adapter import.
     *
     * It exists so one run stays ONE row. The imports keep writing their own
     * `wb_sync_run` / `ozon_sync_run`, and `project.ts` carries those rows in
     * here under the derived id `mprun_<their id>`; without this column the
     * scheduler's row and the carried row would be two rows for one import,
     * and the screen would show every scheduled sync twice. `carryJournal`
     * reads it and treats the derived id as already known.
     */
    source_run_id: model.text().nullable(),
  })
  .indexes([
    {
      on: ["tenant_id", "marketplace", "kind", "started_at"],
      where: "deleted_at IS NULL",
    },
    /**
     * ONE RUNNING ROW PER TRIPLE, enforced by the database (spec 2.6).
     *
     * The single-run rule is the `running` row itself, and a rule kept by
     * reading before writing has a window between the read and the write. Two
     * ticks landing together would both see "nothing is running" and both
     * start, and then the two runs share one rate limit and both collect a 429
     * — which is the failure the rule exists to prevent. A partial unique
     * index closes the window in the only place that can: the second INSERT
     * fails with 23505 and `scheduler.ts` reads that as «уже идёт».
     */
    {
      on: ["tenant_id", "marketplace", "kind"],
      where: "status = 'running' AND deleted_at IS NULL",
      unique: true,
    },
  ]);

export default MpSyncRun;
