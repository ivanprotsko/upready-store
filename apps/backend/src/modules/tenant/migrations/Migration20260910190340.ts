import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * The tenant's sales channel and publishable key move from two text columns to
 * the module links tenant-sales-channel and tenant-api-key.
 *
 * Link tables are created by the link sync, which `medusa db:migrate` runs
 * AFTER module migrations, so this migration cannot write the links itself. It
 * parks the mapping in `tenant_link_backfill` before dropping the columns, and
 * the migration script `src/migration-scripts/backfill-tenant-links.ts` (run
 * after the link sync) turns that table into link rows and drops it. On a
 * database with no tenants the parking table is created empty and the script
 * removes it again.
 */
export class Migration20260910190340 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_link_backfill" ("tenant_id" text not null, "sales_channel_id" text not null, "publishable_api_key_id" text not null, constraint "tenant_link_backfill_pkey" primary key ("tenant_id"));`);
    this.addSql(`insert into "tenant_link_backfill" ("tenant_id", "sales_channel_id", "publishable_api_key_id") select "id", "sales_channel_id", "publishable_api_key_id" from "tenant" where "deleted_at" is null on conflict ("tenant_id") do nothing;`);
    this.addSql(`drop index if exists "IDX_tenant_sales_channel_id_unique";`);
    this.addSql(`drop index if exists "IDX_tenant_publishable_api_key_id_unique";`);
    this.addSql(`alter table if exists "tenant" drop column if exists "sales_channel_id", drop column if exists "publishable_api_key_id";`);
  }

  override async down(): Promise<void> {
    // The columns come back nullable and are refilled from the link tables when
    // those exist; the link rows themselves are left in place.
    this.addSql(`alter table if exists "tenant" add column if not exists "sales_channel_id" text null, add column if not exists "publishable_api_key_id" text null;`);
    this.addSql(`do $$ begin
      if to_regclass('public.tenant_tenant_sales_channel_sales_channel') is not null then
        update "tenant" t set "sales_channel_id" = l."sales_channel_id" from "tenant_tenant_sales_channel_sales_channel" l where l."tenant_id" = t."id" and l."deleted_at" is null;
      end if;
      if to_regclass('public.tenant_tenant_api_key_api_key') is not null then
        update "tenant" t set "publishable_api_key_id" = l."api_key_id" from "tenant_tenant_api_key_api_key" l where l."tenant_id" = t."id" and l."deleted_at" is null;
      end if;
    end $$;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_sales_channel_id_unique" ON "tenant" ("sales_channel_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_publishable_api_key_id_unique" ON "tenant" ("publishable_api_key_id") WHERE deleted_at IS NULL;`);
    this.addSql(`drop table if exists "tenant_link_backfill";`);
  }

}
