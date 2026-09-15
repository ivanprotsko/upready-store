import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260914211626 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "product_review" drop constraint if exists "product_review_tenant_id_product_id_source_key_language_unique";`);
    this.addSql(`create table if not exists "product_review" ("id" text not null, "tenant_id" text not null, "product_id" text not null, "author_name" text not null, "rating" integer not null, "title" text null, "body" text not null, "language" text not null default 'en', "status" text check ("status" in ('pending', 'published', 'hidden')) not null default 'pending', "source" text check ("source" in ('shop', 'imported')) not null default 'shop', "customer_id" text null, "order_id" text null, "reply" text null, "replied_at" timestamptz null, "review_date" timestamptz null, "source_key" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_review_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_review_deleted_at" ON "product_review" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_review_tenant_id_product_id_status" ON "product_review" ("tenant_id", "product_id", "status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_review_tenant_id_product_id_source_key_language_unique" ON "product_review" ("tenant_id", "product_id", "source_key", "language") WHERE deleted_at IS NULL AND source_key IS NOT NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "product_review" cascade;`);
  }

}
