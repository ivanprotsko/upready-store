import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260911004426 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tenant_page" drop constraint if exists "tenant_page_tenant_id_key_locale_unique";`);
    this.addSql(`alter table if exists "tenant_home_config" drop constraint if exists "tenant_home_config_tenant_id_unique";`);
    this.addSql(`alter table if exists "tenant_domain" drop constraint if exists "tenant_domain_host_unique";`);
    this.addSql(`create table if not exists "tenant_domain" ("id" text not null, "host" text not null, "tenant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_domain_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_domain_host_unique" ON "tenant_domain" ("host") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_domain_tenant_id" ON "tenant_domain" ("tenant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_domain_deleted_at" ON "tenant_domain" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "tenant_home_config" ("id" text not null, "config" jsonb not null, "tenant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_home_config_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_home_config_tenant_id_unique" ON "tenant_home_config" ("tenant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_home_config_deleted_at" ON "tenant_home_config" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "tenant_page" ("id" text not null, "key" text not null, "locale" text not null default 'en', "title" text not null, "body" text not null, "published" boolean not null default false, "tenant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_page_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_page_tenant_id" ON "tenant_page" ("tenant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_page_deleted_at" ON "tenant_page" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_page_tenant_id_key_locale_unique" ON "tenant_page" ("tenant_id", "key", "locale") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "tenant_domain" add constraint "tenant_domain_tenant_id_foreign" foreign key ("tenant_id") references "tenant" ("id") on update cascade;`);

    this.addSql(`alter table if exists "tenant_home_config" add constraint "tenant_home_config_tenant_id_foreign" foreign key ("tenant_id") references "tenant" ("id") on update cascade;`);

    this.addSql(`alter table if exists "tenant_page" add constraint "tenant_page_tenant_id_foreign" foreign key ("tenant_id") references "tenant" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_domain" cascade;`);

    this.addSql(`drop table if exists "tenant_home_config" cascade;`);

    this.addSql(`drop table if exists "tenant_page" cascade;`);
  }

}
