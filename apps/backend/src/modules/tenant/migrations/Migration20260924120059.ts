import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * t-2026-09-24-n12: `tenant_group` and the nullable `tenant.group_id`
 * (`models/tenant-group.ts`). Additive only: every existing tenant keeps
 * `group_id` null and behaves as before.
 */
export class Migration20260924120059 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_group" ("id" text not null, "name" text not null, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tenant_group_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_group_deleted_at" ON "tenant_group" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "tenant" add column if not exists "group_id" text null;`);
    this.addSql(`alter table if exists "tenant" add constraint "tenant_group_id_foreign" foreign key ("group_id") references "tenant_group" ("id") on update cascade on delete set null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tenant_group_id" ON "tenant" ("group_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "tenant" drop constraint if exists "tenant_group_id_foreign";`);

    this.addSql(`drop table if exists "tenant_group" cascade;`);

    this.addSql(`drop index if exists "IDX_tenant_group_id";`);
    this.addSql(`alter table if exists "tenant" drop column if exists "group_id";`);
  }

}
