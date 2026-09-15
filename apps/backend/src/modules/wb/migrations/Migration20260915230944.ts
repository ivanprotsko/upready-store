import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260915230944 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "wb_supply" drop constraint if exists "wb_supply_tenant_id_supply_id_unique";`);
    this.addSql(`alter table if exists "wb_fbs_order" drop constraint if exists "wb_fbs_order_tenant_id_order_id_unique";`);
    this.addSql(`create table if not exists "wb_fbs_order" ("id" text not null, "tenant_id" text not null, "order_id" text not null, "rid" text null, "order_uid" text null, "supply_id" text null, "supplier_status" text null, "wb_status" text null, "is_cancellable" boolean null, "is_transferable" boolean null, "nm_id" text null, "chrt_id" text null, "article" text null, "skus" jsonb null, "price" numeric null, "converted_price" numeric null, "currency_code" text null, "delivery_type" text null, "cargo_type" integer null, "warehouse_id" text null, "office_id" text null, "wb_created_at" timestamptz null, "status_fetched_at" timestamptz null, "source" text not null default 'wb', "fetched_at" timestamptz not null, "raw" jsonb not null, "raw_price" jsonb null, "raw_converted_price" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wb_fbs_order_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_fbs_order_deleted_at" ON "wb_fbs_order" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wb_fbs_order_tenant_id_order_id_unique" ON "wb_fbs_order" ("tenant_id", "order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_fbs_order_tenant_id_supplier_status" ON "wb_fbs_order" ("tenant_id", "supplier_status") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "wb_supply" ("id" text not null, "tenant_id" text not null, "supply_id" text not null, "name" text null, "done" boolean not null default false, "cargo_type" integer null, "destination_office_id" text null, "wb_created_at" timestamptz null, "closed_at" timestamptz null, "scan_dt" timestamptz null, "source" text not null default 'wb', "fetched_at" timestamptz not null, "raw" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wb_supply_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_supply_deleted_at" ON "wb_supply" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wb_supply_tenant_id_supply_id_unique" ON "wb_supply" ("tenant_id", "supply_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "wb_sync_run" drop constraint if exists "wb_sync_run_kind_check";`);

    this.addSql(`alter table if exists "wb_sync_run" add constraint "wb_sync_run_kind_check" check("kind" in ('cards', 'prices', 'stocks', 'orders', 'feedbacks', 'supplies', 'fbs_orders'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "wb_fbs_order" cascade;`);

    this.addSql(`drop table if exists "wb_supply" cascade;`);

    this.addSql(`alter table if exists "wb_sync_run" drop constraint if exists "wb_sync_run_kind_check";`);

    this.addSql(`alter table if exists "wb_sync_run" add constraint "wb_sync_run_kind_check" check("kind" in ('cards', 'prices', 'stocks', 'orders', 'feedbacks'));`);
  }

}
