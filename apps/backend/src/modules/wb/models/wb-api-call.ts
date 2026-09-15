import { model } from "@medusajs/framework/utils";

/**
 * The transport journal: one row per request `wbRead` sent to Wildberries
 * (w01-wb-readonly-client).
 *
 * This is the evidence half of the read-only invariant. `endpoints.ts` and
 * `transport.ts` make a write impossible to express; this table lets anyone
 * CHECK it after the fact, without trusting the code:
 *
 *     select endpoint_id, method, count(*) from wb_api_call group by 1, 2;
 *
 * Every row must name an id that stands in `WB_READ_ENDPOINTS`, and no row can
 * carry a method other than GET or a registered read POST, because the values
 * are copied from the registry entry rather than from the caller.
 *
 * The key is never written here: the journal holds a host, a path and a
 * status, and `transport.ts` logs `Authorization: ***`.
 */
const WbApiCall = model
  .define("wb_api_call", {
    id: model.id({ prefix: "wbcall" }).primaryKey(),
    tenant_id: model.text().nullable(),
    /** The `wb_sync_run` this call belongs to, when it was part of one. */
    sync_run_id: model.text().nullable(),
    endpoint_id: model.text(),
    host: model.text(),
    method: model.text(),
    /** The path as sent, with `:param` placeholders already substituted. */
    path: model.text(),
    status: model.number().nullable(),
    ms: model.number().default(0),
    error: model.text().nullable(),
    fetched_at: model.dateTime(),
  })
  .indexes([
    {
      on: ["tenant_id", "fetched_at"],
      where: "deleted_at IS NULL",
    },
  ]);

export default WbApiCall;
