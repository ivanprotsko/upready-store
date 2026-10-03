import { model } from "@medusajs/framework/utils";

/**
 * One Telegram update a shop's bot has already claimed (t-cherk-23, phase 1).
 * Telegram redelivers an update it never got a `200` for in time, so
 * `claimUpdate` (`src/shop-bot/updates.ts`) needs a row to conflict on: the
 * unique `(tenant_id, update_id)` pair below, enforced by Postgres, is the
 * whole idempotency guarantee — no read-then-write race between two webhook
 * deliveries that land at once.
 *
 * `tenant_id` is a plain column, not a link, for the same reason
 * `wishlist_item` keeps one: every reader already has the tenant id in hand
 * (the webhook route resolved it from the URL's handle), so a link would add
 * nothing. Rows are hard-deleted by `claimUpdate`'s own sweep after 7 days,
 * never soft-deleted, so `deleted_at` only exists because every model gets
 * one — nothing here ever sets it.
 */
const TelegramBotUpdate = model
  .define("telegram_bot_update", {
    id: model.id({ prefix: "tgu" }).primaryKey(),
    tenant_id: model.text(),
    update_id: model.number(),
  })
  .indexes([
    {
      on: ["tenant_id", "update_id"],
      unique: true,
    },
  ]);

export default TelegramBotUpdate;
