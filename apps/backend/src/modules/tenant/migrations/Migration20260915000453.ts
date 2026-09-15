import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260915000453 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tenant_product_attribute_value" drop constraint if exists "tenant_product_attribute_value_product_id_attribute_id_unique";`);
    this.addSql(`alter table if exists "tenant_product_attribute_option" drop constraint if exists "tenant_product_attribute_option_attribute_id_value_unique";`);
    this.addSql(`alter table if exists "tenant_product_attribute" drop constraint if exists "tenant_product_attribute_tenant_id_key_unique";`);
    this.addSql(`create table if not exists "tenant_product_attribute" ("id" text not null, "key" text not null, "name" text not null, "type" text check ("type" in ('text', 'number', 'select', 'boolean')) not null, "unit" text null, "position" integer not null default 0, "category_id" text null, "show_on_product" boolean not null default true, "use_as_filter" boolean not null default false, "tenant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_product_attribute_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_product_attribute_tenant_id" ON "tenant_product_attribute" ("tenant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_product_attribute_deleted_at" ON "tenant_product_attribute" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_product_attribute_tenant_id_key_unique" ON "tenant_product_attribute" ("tenant_id", "key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_product_attribute_tenant_id_use_as_filter" ON "tenant_product_attribute" ("tenant_id", "use_as_filter") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "tenant_product_attribute_option" ("id" text not null, "value" text not null, "label" text not null, "position" integer not null default 0, "attribute_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_product_attribute_option_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_product_attribute_option_attribute_id" ON "tenant_product_attribute_option" ("attribute_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_product_attribute_option_deleted_at" ON "tenant_product_attribute_option" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_product_attribute_option_attribute_id_value_unique" ON "tenant_product_attribute_option" ("attribute_id", "value") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "tenant_product_attribute_value" ("id" text not null, "tenant_id" text not null, "product_id" text not null, "value_text" text null, "value_number" real null, "value_boolean" boolean null, "attribute_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_product_attribute_value_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_product_attribute_value_attribute_id" ON "tenant_product_attribute_value" ("attribute_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_product_attribute_value_deleted_at" ON "tenant_product_attribute_value" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_product_attribute_value_product_id_attribute_id_unique" ON "tenant_product_attribute_value" ("product_id", "attribute_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_product_attribute_value_tenant_id_attribute_id_value_text" ON "tenant_product_attribute_value" ("tenant_id", "attribute_id", "value_text") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_product_attribute_value_tenant_id_attribute_id_value_number" ON "tenant_product_attribute_value" ("tenant_id", "attribute_id", "value_number") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "tenant_product_attribute" add constraint "tenant_product_attribute_tenant_id_foreign" foreign key ("tenant_id") references "tenant" ("id") on update cascade;`);

    this.addSql(`alter table if exists "tenant_product_attribute_option" add constraint "tenant_product_attribute_option_attribute_id_foreign" foreign key ("attribute_id") references "tenant_product_attribute" ("id") on update cascade;`);

    this.addSql(`alter table if exists "tenant_product_attribute_value" add constraint "tenant_product_attribute_value_attribute_id_foreign" foreign key ("attribute_id") references "tenant_product_attribute" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "tenant_product_attribute_option" drop constraint if exists "tenant_product_attribute_option_attribute_id_foreign";`);

    this.addSql(`alter table if exists "tenant_product_attribute_value" drop constraint if exists "tenant_product_attribute_value_attribute_id_foreign";`);

    this.addSql(`drop table if exists "tenant_product_attribute" cascade;`);

    this.addSql(`drop table if exists "tenant_product_attribute_option" cascade;`);

    this.addSql(`drop table if exists "tenant_product_attribute_value" cascade;`);
  }

}
