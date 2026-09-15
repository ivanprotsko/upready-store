import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260915211002 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "product_marketplace_link" drop constraint if exists "product_marketplace_link_tenant_id_marketplace_product_id_unique";`);
    this.addSql(`create table if not exists "product_marketplace_link" ("id" text not null, "tenant_id" text not null, "product_id" text not null, "variant_id" text null, "marketplace" text check ("marketplace" in ('wb', 'ozon')) not null default 'wb', "external_id" text not null, "vendor_code" text null, "matched_by" text check ("matched_by" in ('sku_nm_id', 'vendor_code', 'metadata_nm_id', 'manual')) not null, "linked_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_marketplace_link_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_marketplace_link_deleted_at" ON "product_marketplace_link" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_marketplace_link_tenant_id_marketplace_product_id_unique" ON "product_marketplace_link" ("tenant_id", "marketplace", "product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_marketplace_link_tenant_id_marketplace_external_id" ON "product_marketplace_link" ("tenant_id", "marketplace", "external_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "product_marketplace_link" cascade;`);
  }

}
