import { model } from "@medusajs/framework/utils";

/**
 * The transport journal: one row per request the Ozon client made
 * (w11-ozon-readonly-client).
 *
 * This is the evidence half of the read-only invariant. `endpoints.ts` and
 * `transport.ts` make a write impossible to express; this table lets anyone
 * CHECK it after the fact, without trusting the code:
 *
 *     select endpoint_id, method, count(*) from ozon_api_call group by 1, 2;
 *
 * Every row must name an id that stands in `OZON_READ_ENDPOINTS`, because the
 * values are copied from the registry entry rather than from the caller. On
 * Ozon that check is the only one worth anything: every row will say POST, so
 * reading the VERB column proves nothing and reading the ENDPOINT column
 * proves everything.
 *
 * `is_fixture` separates a recorded read from a real one, so a query over this
 * table can never mistake a fixture run for traffic that left the machine.
 *
 * Neither credential is ever written here: the journal holds a host, a path
 * and a status, and `transport.ts` logs `Client-Id: ***, Api-Key: ***`.
 */
const OzonApiCall = model
  .define("ozon_api_call", {
    id: model.id({ prefix: "ozcall" }).primaryKey(),
    tenant_id: model.text().nullable(),
    /** The `ozon_sync_run` this call belongs to, when it was part of one. */
    sync_run_id: model.text().nullable(),
    endpoint_id: model.text(),
    host: model.text(),
    method: model.text(),
    /** The path as sent, with `:param` placeholders already substituted. */
    path: model.text(),
    status: model.number().nullable(),
    ms: model.number().default(0),
    error: model.text().nullable(),
    /** true when the answer came from a recorded fixture and no socket opened. */
    is_fixture: model.boolean().default(false),
    fetched_at: model.dateTime(),
  })
  .indexes([
    {
      on: ["tenant_id", "fetched_at"],
      where: "deleted_at IS NULL",
    },
  ]);

export default OzonApiCall;
