import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260915230611 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "ozon_stock" drop constraint if exists "ozon_stock_tenant_id_sku_stock_type_shipment_type_unique";`);
    this.addSql(`alter table if exists "ozon_review" drop constraint if exists "ozon_review_tenant_id_review_id_unique";`);
    this.addSql(`alter table if exists "ozon_question" drop constraint if exists "ozon_question_tenant_id_question_id_unique";`);
    this.addSql(`alter table if exists "ozon_product" drop constraint if exists "ozon_product_tenant_id_product_id_unique";`);
    this.addSql(`alter table if exists "ozon_price" drop constraint if exists "ozon_price_tenant_id_product_id_unique";`);
    this.addSql(`alter table if exists "ozon_posting" drop constraint if exists "ozon_posting_tenant_id_posting_number_unique";`);
    this.addSql(`create table if not exists "ozon_api_call" ("id" text not null, "tenant_id" text null, "sync_run_id" text null, "endpoint_id" text not null, "host" text not null, "method" text not null, "path" text not null, "status" integer null, "ms" integer not null default 0, "error" text null, "is_fixture" boolean not null default false, "fetched_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ozon_api_call_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ozon_api_call_deleted_at" ON "ozon_api_call" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ozon_api_call_tenant_id_fetched_at" ON "ozon_api_call" ("tenant_id", "fetched_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ozon_posting" ("id" text not null, "tenant_id" text not null, "posting_number" text not null, "order_number" text null, "order_id" text null, "scheme" text not null, "status" text null, "substatus" text null, "products" jsonb null, "analytics_data" jsonb null, "financial_data" jsonb null, "posting_created_at" timestamptz null, "in_process_at" timestamptz null, "cancel_reason_id" text null, "source" text not null default 'ozon', "fetched_at" timestamptz not null, "raw" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ozon_posting_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ozon_posting_deleted_at" ON "ozon_posting" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ozon_posting_tenant_id_posting_number_unique" ON "ozon_posting" ("tenant_id", "posting_number") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ozon_price" ("id" text not null, "tenant_id" text not null, "product_id" text not null, "offer_id" text null, "price" numeric null, "old_price" numeric null, "min_price" numeric null, "currency_code" text null, "vat" text null, "commissions" jsonb null, "price_indexes" jsonb null, "marketing_actions" jsonb null, "source" text not null default 'ozon', "fetched_at" timestamptz not null, "raw" jsonb not null, "raw_price" jsonb null, "raw_old_price" jsonb null, "raw_min_price" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ozon_price_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ozon_price_deleted_at" ON "ozon_price" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ozon_price_tenant_id_product_id_unique" ON "ozon_price" ("tenant_id", "product_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ozon_product" ("id" text not null, "tenant_id" text not null, "product_id" text not null, "offer_id" text null, "sku" text null, "name" text null, "description" text null, "barcodes" jsonb null, "category_id" text null, "type_id" text null, "images" jsonb null, "primary_image" text null, "statuses" jsonb null, "attributes" jsonb null, "archived" boolean not null default false, "source" text not null default 'ozon', "fetched_at" timestamptz not null, "ozon_updated_at" timestamptz null, "raw" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ozon_product_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ozon_product_deleted_at" ON "ozon_product" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ozon_product_tenant_id_product_id_unique" ON "ozon_product" ("tenant_id", "product_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ozon_question" ("id" text not null, "tenant_id" text not null, "question_id" text not null, "sku" text null, "text" text null, "author_name" text null, "answers_count" integer not null default 0, "status" text null, "product_url" text null, "question_link" text null, "published_at" timestamptz null, "source" text not null default 'ozon', "fetched_at" timestamptz not null, "raw" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ozon_question_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ozon_question_deleted_at" ON "ozon_question" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ozon_question_tenant_id_question_id_unique" ON "ozon_question" ("tenant_id", "question_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ozon_review" ("id" text not null, "tenant_id" text not null, "review_id" text not null, "sku" text null, "text" text null, "rating" integer null, "status" text null, "order_status" text null, "comments_amount" integer not null default 0, "photos_amount" integer not null default 0, "videos_amount" integer not null default 0, "is_rating_participant" boolean null, "published_at" timestamptz null, "source" text not null default 'ozon', "fetched_at" timestamptz not null, "raw" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ozon_review_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ozon_review_deleted_at" ON "ozon_review" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ozon_review_tenant_id_review_id_unique" ON "ozon_review" ("tenant_id", "review_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ozon_stock" ("id" text not null, "tenant_id" text not null, "product_id" text not null, "offer_id" text null, "sku" text not null, "stock_type" text not null, "shipment_type" text not null default '', "present" integer not null default 0, "reserved" integer not null default 0, "source" text not null default 'ozon', "fetched_at" timestamptz not null, "raw" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ozon_stock_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ozon_stock_deleted_at" ON "ozon_stock" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ozon_stock_tenant_id_sku_stock_type_shipment_type_unique" ON "ozon_stock" ("tenant_id", "sku", "stock_type", "shipment_type") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ozon_sync_run" ("id" text not null, "tenant_id" text not null, "kind" text check ("kind" in ('products', 'prices', 'stocks', 'postings', 'reviews', 'questions')) not null, "status" text check ("status" in ('running', 'succeeded', 'failed')) not null default 'running', "is_fixture" boolean not null default false, "started_at" timestamptz not null, "finished_at" timestamptz null, "rows" integer not null default 0, "requests" integer not null default 0, "error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ozon_sync_run_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ozon_sync_run_deleted_at" ON "ozon_sync_run" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ozon_sync_run_tenant_id_kind_started_at" ON "ozon_sync_run" ("tenant_id", "kind", "started_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "ozon_api_call" cascade;`);

    this.addSql(`drop table if exists "ozon_posting" cascade;`);

    this.addSql(`drop table if exists "ozon_price" cascade;`);

    this.addSql(`drop table if exists "ozon_product" cascade;`);

    this.addSql(`drop table if exists "ozon_question" cascade;`);

    this.addSql(`drop table if exists "ozon_review" cascade;`);

    this.addSql(`drop table if exists "ozon_stock" cascade;`);

    this.addSql(`drop table if exists "ozon_sync_run" cascade;`);
  }

}
