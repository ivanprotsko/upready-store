import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260915211047 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "wb_sale" drop constraint if exists "wb_sale_tenant_id_srid_unique";`);
    this.addSql(`alter table if exists "wb_question" drop constraint if exists "wb_question_tenant_id_question_id_unique";`);
    this.addSql(`alter table if exists "wb_analytics_daily" drop constraint if exists "wb_analytics_daily_tenant_id_nm_id_date_unique";`);
    this.addSql(`create table if not exists "wb_analytics_daily" ("id" text not null, "tenant_id" text not null, "nm_id" text not null, "date" text not null, "title" text null, "vendor_code" text null, "brand_name" text null, "subject_id" text null, "subject_name" text null, "open_card" integer null, "add_to_cart" integer null, "orders" integer null, "ordered_sum" numeric null, "buyouts" integer null, "buyout_sum" numeric null, "buyout_percent" integer null, "add_to_cart_percent" integer null, "cart_to_order_percent" integer null, "add_to_wishlist" integer null, "currency" text null, "period_start" text null, "period_end" text null, "source" text not null default 'wb', "fetched_at" timestamptz not null, "raw" jsonb not null, "raw_ordered_sum" jsonb null, "raw_buyout_sum" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wb_analytics_daily_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_analytics_daily_deleted_at" ON "wb_analytics_daily" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wb_analytics_daily_tenant_id_nm_id_date_unique" ON "wb_analytics_daily" ("tenant_id", "nm_id", "date") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_analytics_daily_tenant_id_date" ON "wb_analytics_daily" ("tenant_id", "date") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "wb_question" ("id" text not null, "tenant_id" text not null, "question_id" text not null, "nm_id" text null, "imt_id" text null, "product_name" text null, "supplier_article" text null, "brand_name" text null, "text" text null, "answer_text" text null, "state" text null, "is_answered" boolean not null default false, "was_viewed" boolean null, "is_warned" boolean null, "created_date" timestamptz null, "source" text not null default 'wb', "fetched_at" timestamptz not null, "raw" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wb_question_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_question_deleted_at" ON "wb_question" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wb_question_tenant_id_question_id_unique" ON "wb_question" ("tenant_id", "question_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_question_tenant_id_is_answered_created_date" ON "wb_question" ("tenant_id", "is_answered", "created_date") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "wb_sale" ("id" text not null, "tenant_id" text not null, "srid" text not null, "sale_id" text null, "nm_id" text null, "supplier_article" text null, "barcode" text null, "tech_size" text null, "category" text null, "subject" text null, "brand" text null, "total_price" numeric null, "discount_percent" integer null, "spp" integer null, "price_with_disc" numeric null, "finished_price" numeric null, "for_pay" numeric null, "payment_sale_amount" numeric null, "is_supply" boolean null, "is_realization" boolean null, "warehouse_name" text null, "warehouse_type" text null, "country_name" text null, "oblast_okrug_name" text null, "region_name" text null, "sale_date" timestamptz null, "last_change_date" timestamptz null, "source" text not null default 'wb', "fetched_at" timestamptz not null, "raw" jsonb not null, "raw_total_price" jsonb null, "raw_price_with_disc" jsonb null, "raw_finished_price" jsonb null, "raw_for_pay" jsonb null, "raw_payment_sale_amount" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wb_sale_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_sale_deleted_at" ON "wb_sale" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wb_sale_tenant_id_srid_unique" ON "wb_sale" ("tenant_id", "srid") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wb_sale_tenant_id_sale_date" ON "wb_sale" ("tenant_id", "sale_date") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "wb_sync_run" drop constraint if exists "wb_sync_run_kind_check";`);

    this.addSql(`alter table if exists "wb_sync_run" add constraint "wb_sync_run_kind_check" check("kind" in ('cards', 'prices', 'stocks', 'orders', 'sales', 'feedbacks', 'questions', 'analytics'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "wb_analytics_daily" cascade;`);

    this.addSql(`drop table if exists "wb_question" cascade;`);

    this.addSql(`drop table if exists "wb_sale" cascade;`);

    this.addSql(`alter table if exists "wb_sync_run" drop constraint if exists "wb_sync_run_kind_check";`);

    this.addSql(`alter table if exists "wb_sync_run" add constraint "wb_sync_run_kind_check" check("kind" in ('cards', 'prices', 'stocks', 'orders', 'feedbacks'));`);
  }

}
