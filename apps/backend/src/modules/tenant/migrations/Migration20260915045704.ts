import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Per-shop notification settings (t08-order-notifications):
 * `models/tenant-notification-settings.ts`. One row per tenant, holding the
 * sender identity of its customer e-mails and the Telegram chat its owner
 * linked. No credential of the shop lives here — the platform's SMTP account
 * and the platform bot do the sending.
 *
 * Hand-written in the shape `medusa db:generate tenant` emits, the way
 * `Migration20260914193724` was: the generator re-emits unrelated statements
 * whenever the checked-in snapshot lags, and only this table's statements
 * belong in this file.
 */
export class Migration20260915045704 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_notification_settings" ("id" text not null, "email_from_name" text null, "email_reply_to" text null, "telegram_chat_id" text null, "telegram_chat_title" text null, "telegram_linked_at" timestamptz null, "link_code" text null, "link_code_expires_at" timestamptz null, "email_last_status" text null, "email_last_at" timestamptz null, "email_last_error" text null, "email_last_order" text null, "telegram_last_status" text null, "telegram_last_at" timestamptz null, "telegram_last_error" text null, "telegram_last_order" text null, "tenant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_notification_settings_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_notification_settings_deleted_at" ON "tenant_notification_settings" ("deleted_at") WHERE deleted_at IS NULL;`);
    // One row per shop, and only while the row is alive.
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_notification_settings_tenant_id_unique" ON "tenant_notification_settings" ("tenant_id") WHERE deleted_at IS NULL;`);
    // A pending link code is looked up by the BOT, with nothing else to go on,
    // so it has to be unique across every shop — and only while it is pending.
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_notification_settings_link_code_unique" ON "tenant_notification_settings" ("link_code") WHERE deleted_at IS NULL AND link_code IS NOT NULL;`);
    this.addSql(`alter table if exists "tenant_notification_settings" add constraint "tenant_notification_settings_tenant_id_foreign" foreign key ("tenant_id") references "tenant" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_notification_settings" cascade;`);
  }

}
