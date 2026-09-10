import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260910140113 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tenant_admin" drop constraint if exists "tenant_admin_email_unique";`);
    this.addSql(`alter table if exists "tenant" drop constraint if exists "tenant_publishable_api_key_id_unique";`);
    this.addSql(`alter table if exists "tenant" drop constraint if exists "tenant_sales_channel_id_unique";`);
    this.addSql(`alter table if exists "tenant" drop constraint if exists "tenant_handle_unique";`);
    this.addSql(`create table if not exists "tenant" ("id" text not null, "handle" text not null, "name" text not null, "sales_channel_id" text not null, "publishable_api_key_id" text not null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_handle_unique" ON "tenant" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_sales_channel_id_unique" ON "tenant" ("sales_channel_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_publishable_api_key_id_unique" ON "tenant" ("publishable_api_key_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_deleted_at" ON "tenant" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "tenant_admin" ("id" text not null, "email" text not null, "first_name" text null, "last_name" text null, "tenant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_admin_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_admin_email_unique" ON "tenant_admin" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_admin_tenant_id" ON "tenant_admin" ("tenant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_admin_deleted_at" ON "tenant_admin" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "tenant_admin" add constraint "tenant_admin_tenant_id_foreign" foreign key ("tenant_id") references "tenant" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "tenant_admin" drop constraint if exists "tenant_admin_tenant_id_foreign";`);

    this.addSql(`drop table if exists "tenant" cascade;`);

    this.addSql(`drop table if exists "tenant_admin" cascade;`);
  }

}
