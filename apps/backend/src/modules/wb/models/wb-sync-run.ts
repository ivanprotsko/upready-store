import { model } from "@medusajs/framework/utils";

/**
 * One import of one kind, from its first request to its last
 * (w01-wb-readonly-client). The panel's Wildberries card reads the newest row
 * per kind; the acceptor reads the table to see what actually ran.
 *
 * A run that crashed keeps `status = "failed"` and the message in `error`
 * rather than vanishing: a sync that did not happen has to be visible (rule
 * 20a), and an empty mirror with no run row would read as "nothing to import".
 */
/**
 * `fbs_orders` and `supplies` are w23's: the FBS desk. They stand AFTER
 * `orders` because `--kind all` runs this list in order and the FBS import
 * reads supplies to fill in which supply an order sits in.
 */
export const WB_SYNC_KINDS = [
  "cards",
  "prices",
  "stocks",
  "orders",
  "feedbacks",
  "supplies",
  "fbs_orders",
] as const;
export type WbSyncKind = (typeof WB_SYNC_KINDS)[number];

export const WB_SYNC_STATUSES = ["running", "succeeded", "failed"] as const;
export type WbSyncStatus = (typeof WB_SYNC_STATUSES)[number];

const WbSyncRun = model
  .define("wb_sync_run", {
    id: model.id({ prefix: "wbrun" }).primaryKey(),
    tenant_id: model.text(),
    kind: model.enum([...WB_SYNC_KINDS]),
    status: model.enum([...WB_SYNC_STATUSES]).default("running"),
    started_at: model.dateTime(),
    finished_at: model.dateTime().nullable(),
    /** Mirror rows written (inserted plus updated). */
    rows: model.number().default(0),
    /** WB requests this run made, for the rate-limit budget. */
    requests: model.number().default(0),
    error: model.text().nullable(),
  })
  .indexes([
    {
      on: ["tenant_id", "kind", "started_at"],
      where: "deleted_at IS NULL",
    },
  ]);

export default WbSyncRun;
