import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260916014707 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "mp_sync_run" drop constraint if exists "mp_sync_run_tenant_id_marketplace_kind_unique";`);
    this.addSql(`alter table if exists "mp_sync_run" add column if not exists "retry_at" timestamptz null, add column if not exists "attempts" integer not null default 1, add column if not exists "source_run_id" text null;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mp_sync_run_tenant_id_marketplace_kind_unique" ON "mp_sync_run" ("tenant_id", "marketplace", "kind") WHERE status = 'running' AND deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_mp_sync_run_tenant_id_marketplace_kind_unique";`);
    this.addSql(`alter table if exists "mp_sync_run" drop column if exists "retry_at", drop column if exists "attempts", drop column if exists "source_run_id";`);
  }

}
