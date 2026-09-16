import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260915235331 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "mp_review" drop constraint if exists "mp_review_tenant_id_marketplace_external_id_unique";`);
    this.addSql(`alter table if exists "mp_question" drop constraint if exists "mp_question_tenant_id_marketplace_external_id_unique";`);
    this.addSql(`alter table if exists "mp_product" drop constraint if exists "mp_product_tenant_id_marketplace_external_id_unique";`);
    this.addSql(`alter table if exists "mp_order_line" drop constraint if exists "mp_order_line_tenant_id_marketplace_line_key_unique";`);
    this.addSql(`alter table if exists "mp_order" drop constraint if exists "mp_order_tenant_id_marketplace_external_id_unique";`);
    this.addSql(`alter table if exists "mp_offer" drop constraint if exists "mp_offer_tenant_id_marketplace_offer_key_unique";`);
    this.addSql(`alter table if exists "mp_link" drop constraint if exists "mp_link_tenant_id_marketplace_external_id_unique";`);
    this.addSql(`create table if not exists "mp_api_call" ("id" text not null, "tenant_id" text null, "marketplace" text not null, "sync_run_id" text null, "endpoint_id" text not null, "host" text not null, "method" text not null, "path" text not null, "status" integer null, "ms" integer not null default 0, "error" text null, "is_fixture" boolean not null default false, "fetched_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mp_api_call_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_api_call_deleted_at" ON "mp_api_call" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_api_call_tenant_id_marketplace_fetched_at" ON "mp_api_call" ("tenant_id", "marketplace", "fetched_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mp_link" ("id" text not null, "tenant_id" text not null, "marketplace" text not null, "external_id" text not null, "product_id" text not null, "variant_id" text null, "matched_by" text not null, "confidence" integer not null default 1, "linked_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mp_link_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_link_deleted_at" ON "mp_link" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mp_link_tenant_id_marketplace_external_id_unique" ON "mp_link" ("tenant_id", "marketplace", "external_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_link_tenant_id_product_id" ON "mp_link" ("tenant_id", "product_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mp_offer" ("id" text not null, "tenant_id" text not null, "marketplace" text not null, "offer_key" text not null, "external_id" text not null, "vendor_code" text null, "size_external" text null, "sku_external" text null, "storage_type" text null, "warehouse_id" text null, "warehouse_name" text null, "price" numeric null, "discount_price" numeric null, "currency" text null, "stock" integer null, "reserved" integer null, "measured_at" timestamptz null, "source_row_id" text not null, "synced_at" timestamptz not null, "raw_price" jsonb null, "raw_discount_price" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mp_offer_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_offer_deleted_at" ON "mp_offer" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mp_offer_tenant_id_marketplace_offer_key_unique" ON "mp_offer" ("tenant_id", "marketplace", "offer_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_offer_tenant_id_marketplace_external_id" ON "mp_offer" ("tenant_id", "marketplace", "external_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mp_order" ("id" text not null, "tenant_id" text not null, "marketplace" text not null, "external_id" text not null, "scheme" text null, "status" text null, "status_changed_at" timestamptz null, "ordered_at" timestamptz null, "buyer_region" text null, "warehouse_name" text null, "total" numeric null, "currency" text null, "is_cancelled" boolean not null default false, "source_row_id" text not null, "synced_at" timestamptz not null, "raw_total" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mp_order_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_order_deleted_at" ON "mp_order" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mp_order_tenant_id_marketplace_external_id_unique" ON "mp_order" ("tenant_id", "marketplace", "external_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_order_tenant_id_marketplace_ordered_at" ON "mp_order" ("tenant_id", "marketplace", "ordered_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mp_order_line" ("id" text not null, "tenant_id" text not null, "marketplace" text not null, "order_id" text not null, "line_key" text not null, "vendor_code" text null, "external_id" text null, "qty" integer null, "price" numeric null, "discount" numeric null, "source_row_id" text not null, "synced_at" timestamptz not null, "raw_price" jsonb null, "raw_discount" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mp_order_line_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_order_line_deleted_at" ON "mp_order_line" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mp_order_line_tenant_id_marketplace_line_key_unique" ON "mp_order_line" ("tenant_id", "marketplace", "line_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_order_line_order_id" ON "mp_order_line" ("order_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mp_product" ("id" text not null, "tenant_id" text not null, "marketplace" text not null, "external_id" text not null, "vendor_code" text null, "sku_external" text null, "title" text null, "brand" text null, "category_name" text null, "photos" jsonb null, "attributes" jsonb null, "mp_updated_at" timestamptz null, "source_row_id" text not null, "synced_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mp_product_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_product_deleted_at" ON "mp_product" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mp_product_tenant_id_marketplace_external_id_unique" ON "mp_product" ("tenant_id", "marketplace", "external_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_product_tenant_id_marketplace_vendor_code" ON "mp_product" ("tenant_id", "marketplace", "vendor_code") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mp_question" ("id" text not null, "tenant_id" text not null, "marketplace" text not null, "external_id" text not null, "vendor_code" text null, "question_text" text null, "author" text null, "created_at_mp" timestamptz null, "is_answered" boolean not null default false, "answer_draft" text null, "answer_draft_at" timestamptz null, "source_row_id" text not null, "synced_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mp_question_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_question_deleted_at" ON "mp_question" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mp_question_tenant_id_marketplace_external_id_unique" ON "mp_question" ("tenant_id", "marketplace", "external_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mp_review" ("id" text not null, "tenant_id" text not null, "marketplace" text not null, "external_id" text not null, "vendor_code" text null, "rating" integer null, "text" text null, "pros" text null, "cons" text null, "author" text null, "created_at_mp" timestamptz null, "is_answered" boolean not null default false, "answer_draft" text null, "answer_draft_at" timestamptz null, "source_row_id" text not null, "synced_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mp_review_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_review_deleted_at" ON "mp_review" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mp_review_tenant_id_marketplace_external_id_unique" ON "mp_review" ("tenant_id", "marketplace", "external_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mp_sync_run" ("id" text not null, "tenant_id" text not null, "marketplace" text not null, "kind" text not null, "status" text not null default 'running', "is_fixture" boolean not null default false, "started_at" timestamptz not null, "finished_at" timestamptz null, "rows" integer not null default 0, "requests" integer not null default 0, "error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mp_sync_run_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_sync_run_deleted_at" ON "mp_sync_run" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mp_sync_run_tenant_id_marketplace_kind_started_at" ON "mp_sync_run" ("tenant_id", "marketplace", "kind", "started_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "mp_api_call" cascade;`);

    this.addSql(`drop table if exists "mp_link" cascade;`);

    this.addSql(`drop table if exists "mp_offer" cascade;`);

    this.addSql(`drop table if exists "mp_order" cascade;`);

    this.addSql(`drop table if exists "mp_order_line" cascade;`);

    this.addSql(`drop table if exists "mp_product" cascade;`);

    this.addSql(`drop table if exists "mp_question" cascade;`);

    this.addSql(`drop table if exists "mp_review" cascade;`);

    this.addSql(`drop table if exists "mp_sync_run" cascade;`);
  }

}
