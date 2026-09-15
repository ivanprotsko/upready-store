import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260915223734 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "marketplace_write_setting" drop constraint if exists "marketplace_write_setting_tenant_id_marketplace_unique";`);
    this.addSql(`alter table if exists "marketplace_write_consent" drop constraint if exists "marketplace_write_consent_tenant_id_marketplace_op_class_unique";`);
    this.addSql(`create table if not exists "marketplace_write_audit" ("id" text not null, "tenant_id" text not null, "marketplace" text not null, "op_class" text not null, "endpoint_id" text not null, "method" text not null, "path" text not null, "payload" jsonb null, "payload_sha256" text not null, "dry_run" boolean not null default true, "outcome" text not null default 'dry_run', "gate" text null, "actor" text not null, "status" integer null, "response" text null, "error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "marketplace_write_audit_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketplace_write_audit_deleted_at" ON "marketplace_write_audit" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketplace_write_audit_tenant_id_marketplace_created_at" ON "marketplace_write_audit" ("tenant_id", "marketplace", "created_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "marketplace_write_consent" ("id" text not null, "tenant_id" text not null, "marketplace" text not null, "op_class" text not null, "confirmed_by" text not null, "confirmed_at" timestamptz not null, "note" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "marketplace_write_consent_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketplace_write_consent_deleted_at" ON "marketplace_write_consent" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_marketplace_write_consent_tenant_id_marketplace_op_class_unique" ON "marketplace_write_consent" ("tenant_id", "marketplace", "op_class") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "marketplace_write_setting" ("id" text not null, "tenant_id" text not null, "marketplace" text not null, "is_enabled" boolean not null default false, "updated_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "marketplace_write_setting_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_marketplace_write_setting_deleted_at" ON "marketplace_write_setting" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_marketplace_write_setting_tenant_id_marketplace_unique" ON "marketplace_write_setting" ("tenant_id", "marketplace") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "marketplace_write_audit" cascade;`);

    this.addSql(`drop table if exists "marketplace_write_consent" cascade;`);

    this.addSql(`drop table if exists "marketplace_write_setting" cascade;`);
  }

}
