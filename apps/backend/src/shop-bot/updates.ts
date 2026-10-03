import type { Knex } from "@medusajs/framework/mikro-orm/knex";

/**
 * Telegram redelivers an update it never got a `200` for in time, so the same
 * `update_id` can reach the webhook more than once (t-cherk-23). `claimUpdate`
 * is the one gate every call goes through: the first caller for a given
 * `(tenant_id, update_id)` gets `true` and must act on it, every later one
 * gets `false` and must do nothing.
 *
 * `INSERT ... ON CONFLICT (tenant_id, update_id) DO NOTHING RETURNING id` is
 * the whole mechanism — one round trip, no read-then-write race between two
 * webhook deliveries that land at once. It needs a PLAIN unique index on
 * exactly those two columns (`modules/tenant/models/telegram-bot-update.ts`):
 * Postgres only matches a conflict target against a full index, and this
 * insert names no `WHERE` predicate to match a partial one.
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** 1-in-100 calls sweep old rows: a bot sees far more updates than housekeeping needs. */
const PRUNE_SAMPLE_RATE = 0.01;

export const claimUpdate = async (
  pg: Knex,
  tenantId: string,
  updateId: number,
): Promise<boolean> => {
  const inserted: Array<{ id: string }> = await pg("telegram_bot_update")
    .insert({ tenant_id: tenantId, update_id: updateId })
    .onConflict(["tenant_id", "update_id"])
    .ignore()
    .returning("id");

  if (Math.random() < PRUNE_SAMPLE_RATE) {
    // Best-effort housekeeping: a failed sweep must never turn into a failed
    // webhook reply, so its own error is swallowed here.
    await pg("telegram_bot_update")
      .where("created_at", "<", new Date(Date.now() - SEVEN_DAYS_MS))
      .del()
      .catch(() => undefined);
  }

  return inserted.length > 0;
};
