import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260916015254 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "mp_order_status_event" drop constraint if exists "mp_order_status_event_tenant_id_marketplace_event_key_unique";`);
    this.addSql(`create table if not exists "mp_order_status_event" ("id" text not null, "tenant_id" text not null, "marketplace" text not null, "order_id" text not null, "event_key" text not null, "status" text null, "status_detail" text null, "status_changed_at" timestamptz null, "observed_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mp_order_status_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_order_status_event_deleted_at" ON "mp_order_status_event" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mp_order_status_event_tenant_id_marketplace_event_key_unique" ON "mp_order_status_event" ("tenant_id", "marketplace", "event_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_order_status_event_order_id_observed_at" ON "mp_order_status_event" ("order_id", "observed_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "mp_order" add column if not exists "status_detail" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "mp_order_status_event" cascade;`);

    this.addSql(`alter table if exists "mp_order" drop column if exists "status_detail";`);
  }

}
