import { model } from "@medusajs/framework/utils";

/**
 * One import of one kind, from its first request to its last
 * (w01-wb-readonly-client). The panel's Wildberries card reads the newest row
 * per kind; the acceptor reads the table to see what actually ran.
 *
 * A run that crashed keeps `status = "failed"` and the message in `error`
 * rather than vanishing: a sync that did not happen has to be visible (rule
 * 20a), and an empty mirror with no run row would read as "nothing to import".
 *
 * A run stopped by WB's rate limit is NOT that (w03). On a base token the
 * limits are the normal operating condition — questions and feedbacks share
 * five requests an hour, sales get one every two hours — so hitting one means
 * "come back at HH:MM", not "the integration is broken". It gets its own
 * status `rate_limited` and its own `retry_at`, because the owner reading a
 * red "с ошибкой" against four of eight kinds concludes the wrong thing, and a
 * run that wrote 1000 rows before the limit is a PARTIAL SUCCESS, not a
 * failure.
 */
/**
 * The import kinds, in the order `--kind all` runs them (w01, extended by
 * w03). The order is the dependency order: `stocks` needs the size ids the
 * `cards` import writes, and `analytics` needs the listing numbers, so both
 * stand after `cards`.
 */
export const WB_SYNC_KINDS = [
  "cards",
  "prices",
  "stocks",
  "orders",
  "sales",
  "feedbacks",
  "questions",
  "analytics",
] as const;
export type WbSyncKind = (typeof WB_SYNC_KINDS)[number];

export const WB_SYNC_STATUSES = ["running", "succeeded", "rate_limited", "failed"] as const;
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
    /**
     * When WB said this kind may be read again. Set only for `rate_limited`,
     * from the 429's own `Retry-After` / `X-RateLimit-Retry` header — a
     * measured value, never an estimate.
     */
    retry_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      on: ["tenant_id", "kind", "started_at"],
      where: "deleted_at IS NULL",
    },
  ]);

export default WbSyncRun;
