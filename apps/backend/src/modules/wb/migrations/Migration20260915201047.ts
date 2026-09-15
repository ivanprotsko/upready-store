import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260915201047 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "wb_stock" drop constraint if exists "wb_stock_tenant_id_warehouse_id_sku_unique";`);
    this.addSql(`alter table if exists "wb_product" drop constraint if exists "wb_product_tenant_id_nm_id_unique";`);
    this.addSql(`alter table if exists "wb_price" drop constraint if exists "wb_price_tenant_id_nm_id_unique";`);
    this.addSql(`alter table if exists "wb_order" drop constraint if exists "wb_order_tenant_id_srid_unique";`);
    this.addSql(`alter table if exists "wb_feedback" drop constraint if exists "wb_feedback_tenant_id_feedback_id_unique";`);
    this.addSql(`create table if not exists "wb_api_call" ("id" text not null, "tenant_id" text null, "sync_run_id" text null, "endpoint_id" text not null, "host" text not null, "method" text not null, "path" text not null, "status" integer null, "ms" integer not null default 0, "error" text null, "fetched_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wb_api_call_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_api_call_deleted_at" ON "wb_api_call" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_api_call_tenant_id_fetched_at" ON "wb_api_call" ("tenant_id", "fetched_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "wb_feedback" ("id" text not null, "tenant_id" text not null, "feedback_id" text not null, "nm_id" text null, "product_valuation" integer null, "text" text null, "pros" text null, "cons" text null, "user_name" text null, "is_answered" boolean not null default false, "created_date" timestamptz null, "source" text not null default 'wb', "fetched_at" timestamptz not null, "raw" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wb_feedback_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_feedback_deleted_at" ON "wb_feedback" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wb_feedback_tenant_id_feedback_id_unique" ON "wb_feedback" ("tenant_id", "feedback_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "wb_order" ("id" text not null, "tenant_id" text not null, "srid" text not null, "nm_id" text null, "supplier_article" text null, "barcode" text null, "total_price" numeric null, "discount_percent" integer null, "finished_price" numeric null, "is_cancel" boolean not null default false, "warehouse_name" text null, "region_name" text null, "order_date" timestamptz null, "last_change_date" timestamptz null, "source" text not null default 'wb', "fetched_at" timestamptz not null, "raw" jsonb not null, "raw_total_price" jsonb null, "raw_finished_price" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wb_order_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_order_deleted_at" ON "wb_order" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wb_order_tenant_id_srid_unique" ON "wb_order" ("tenant_id", "srid") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "wb_price" ("id" text not null, "tenant_id" text not null, "nm_id" text not null, "vendor_code" text null, "currency_iso" text null, "discount" integer null, "club_discount" integer null, "editable_size_price" boolean null, "sizes" jsonb null, "source" text not null default 'wb', "fetched_at" timestamptz not null, "raw" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wb_price_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_price_deleted_at" ON "wb_price" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wb_price_tenant_id_nm_id_unique" ON "wb_price" ("tenant_id", "nm_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "wb_product" ("id" text not null, "tenant_id" text not null, "nm_id" text not null, "imt_id" text null, "vendor_code" text null, "title" text null, "brand" text null, "subject_id" text null, "subject_name" text null, "photos" jsonb null, "dimensions" jsonb null, "sizes" jsonb null, "source" text not null default 'wb', "fetched_at" timestamptz not null, "wb_updated_at" timestamptz null, "raw" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wb_product_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_product_deleted_at" ON "wb_product" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wb_product_tenant_id_nm_id_unique" ON "wb_product" ("tenant_id", "nm_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "wb_stock" ("id" text not null, "tenant_id" text not null, "warehouse_id" text not null, "warehouse_name" text null, "sku" text not null, "chrt_id" text null, "nm_id" text null, "amount" integer not null default 0, "source" text not null default 'wb', "fetched_at" timestamptz not null, "raw" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wb_stock_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_stock_deleted_at" ON "wb_stock" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wb_stock_tenant_id_warehouse_id_sku_unique" ON "wb_stock" ("tenant_id", "warehouse_id", "sku") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "wb_sync_run" ("id" text not null, "tenant_id" text not null, "kind" text check ("kind" in ('cards', 'prices', 'stocks', 'orders', 'feedbacks')) not null, "status" text check ("status" in ('running', 'succeeded', 'failed')) not null default 'running', "started_at" timestamptz not null, "finished_at" timestamptz null, "rows" integer not null default 0, "requests" integer not null default 0, "error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wb_sync_run_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_sync_run_deleted_at" ON "wb_sync_run" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_sync_run_tenant_id_kind_started_at" ON "wb_sync_run" ("tenant_id", "kind", "started_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "wb_api_call" cascade;`);

    this.addSql(`drop table if exists "wb_feedback" cascade;`);

    this.addSql(`drop table if exists "wb_order" cascade;`);

    this.addSql(`drop table if exists "wb_price" cascade;`);

    this.addSql(`drop table if exists "wb_product" cascade;`);

    this.addSql(`drop table if exists "wb_stock" cascade;`);

    this.addSql(`drop table if exists "wb_sync_run" cascade;`);
  }

}
