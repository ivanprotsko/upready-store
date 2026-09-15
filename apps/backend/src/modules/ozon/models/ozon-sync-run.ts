import { model } from "@medusajs/framework/utils";

/**
 * One import of one kind, from its first request to its last
 * (w11-ozon-readonly-client). The panel's Ozon card reads the newest row per
 * kind; the acceptor reads the table to see what actually ran.
 *
 * A run that crashed keeps `status = "failed"` and the message in `error`
 * rather than vanishing: a sync that did not happen has to be visible (rule
 * 20a), and an empty mirror with no run row would read as "Ozon had nothing".
 *
 * `is_fixture` is the honest half. Ozon documents NO sandbox, so this module
 * can be exercised end to end on recorded fixtures shaped from the saved
 * reference. A fixture run is a real run of our code and a fake run of the
 * API, and the difference has to survive into the database: a fixture run
 * reported as a live one is the failure this task exists to prevent.
 */
export const OZON_SYNC_KINDS = [
  "products",
  "prices",
  "stocks",
  "postings",
  "reviews",
  "questions",
] as const;
export type OzonSyncKind = (typeof OZON_SYNC_KINDS)[number];

export const OZON_SYNC_STATUSES = ["running", "succeeded", "failed"] as const;
export type OzonSyncStatus = (typeof OZON_SYNC_STATUSES)[number];

const OzonSyncRun = model
  .define("ozon_sync_run", {
    id: model.id({ prefix: "ozrun" }).primaryKey(),
    tenant_id: model.text(),
    kind: model.enum([...OZON_SYNC_KINDS]),
    status: model.enum([...OZON_SYNC_STATUSES]).default("running"),
    /** true when the run read recorded fixtures instead of api-seller.ozon.ru. */
    is_fixture: model.boolean().default(false),
    started_at: model.dateTime(),
    finished_at: model.dateTime().nullable(),
    /** Mirror rows written (inserted plus updated). */
    rows: model.number().default(0),
    /** Ozon requests this run made, for the 50-per-second budget. */
    requests: model.number().default(0),
    error: model.text().nullable(),
  })
  .indexes([
    {
      on: ["tenant_id", "kind", "started_at"],
      where: "deleted_at IS NULL",
    },
  ]);

export default OzonSyncRun;
