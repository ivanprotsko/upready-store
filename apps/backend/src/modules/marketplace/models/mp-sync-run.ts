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
    /** `running` | `succeeded` | `failed`. */
    status: model.text().default("running"),
    /** True when the rows came from recorded fixtures rather than the network. */
    is_fixture: model.boolean().default(false),
    started_at: model.dateTime(),
    finished_at: model.dateTime().nullable(),
    rows: model.number().default(0),
    requests: model.number().default(0),
    error: model.text().nullable(),
  })
  .indexes([
    {
      on: ["tenant_id", "marketplace", "kind", "started_at"],
      where: "deleted_at IS NULL",
    },
  ]);

export default MpSyncRun;
