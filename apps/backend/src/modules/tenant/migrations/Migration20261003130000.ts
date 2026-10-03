import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * `telegram_bot_update` (t-cherk-23, phase 1): one row per Telegram update a
 * shop's bot has already claimed, so a redelivered `update_id` is a no-op
 * (`src/shop-bot/updates.ts`'s `claimUpdate`). Hand-written the way
 * `wishlist_item`'s migration is (`src/modules/wishlist/migrations/Migration20261002120000.ts`):
 * no model generator ran, so there is nothing for it to diff against.
 *
 * The unique index carries NO `WHERE deleted_at IS NULL` on purpose, unlike
 * `wishlist_item`'s: `claimUpdate` relies on a plain `INSERT ... ON CONFLICT
 * (tenant_id, update_id) DO NOTHING`, and Postgres only matches a conflict
 * target against a full index, never a partial one, unless the INSERT itself
 * repeats the same predicate. Rows here are hard-deleted by the sweep in
 * `claimUpdate`, never soft-deleted, so there is no revival case a partial
 * index would be protecting anyway.
 */
export class Migration20261003130000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "telegram_bot_update" ("id" text not null, "tenant_id" text not null, "update_id" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "telegram_bot_update_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_telegram_bot_update_deleted_at" ON "telegram_bot_update" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_telegram_bot_update_tenant_id_update_id_unique" ON "telegram_bot_update" ("tenant_id", "update_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "telegram_bot_update" cascade;`);
  }

}
