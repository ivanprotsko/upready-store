import { model } from "@medusajs/framework/utils";

/**
 * The transport journal of every marketplace: one row per request that left
 * this process (w12-marketplace-core).
 *
 * This is the EVIDENCE half of the read-only invariant. The registries and the
 * transports make a write impossible to express; this table lets anyone CHECK
 * it after the fact, for every marketplace at once, without trusting the code:
 *
 *     select marketplace, method, endpoint_id, count(*)
 *     from mp_api_call group by 1, 2, 3;
 *
 * One table rather than `wb_api_call` plus `ozon_api_call` for the same reason
 * `mp_sync_run` is one table: two journals are two queries and one marketplace
 * nobody checked.
 *
 * No key is ever written here. The row holds a host, a path and a status; the
 * transports log `Authorization: ***`.
 */
const MpApiCall = model
  .define("mp_api_call", {
    id: model.id({ prefix: "mpcall" }).primaryKey(),
    tenant_id: model.text().nullable(),
    marketplace: model.text(),
    /** The `mp_sync_run` this call belongs to, when it was part of one. */
    sync_run_id: model.text().nullable(),
    endpoint_id: model.text(),
    host: model.text(),
    method: model.text(),
    /** The path as sent, with `:param` placeholders already substituted. */
    path: model.text(),
    status: model.number().nullable(),
    ms: model.number().default(0),
    error: model.text().nullable(),
    is_fixture: model.boolean().default(false),
    fetched_at: model.dateTime(),
  })
  .indexes([
    {
      on: ["tenant_id", "marketplace", "fetched_at"],
      where: "deleted_at IS NULL",
    },
  ]);

export default MpApiCall;
