import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * t-2026-10-07-11: `tenant_admin.role`, what a login may do in its shop.
 *
 * Every login that exists before this migration saw the whole shop, so every
 * one of them becomes an `owner`: the column is added NOT NULL with that
 * default, which is also how Postgres fills the rows already in the table.
 * Nobody loses access by this migration, and the platform's own row in each
 * shop (`PLATFORM_ADMIN_EMAIL`) stays an owner too.
 *
 * The CHECK is the one `model.enum` renders for the model
 * (`models/tenant-admin.ts`, `TENANT_ADMIN_ROLES`); a new role is a new
 * migration that rewrites it.
 */
export class Migration20261008010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "tenant_admin" add column if not exists "role" text check ("role" in ('owner', 'manager', 'operator')) not null default 'owner';`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "tenant_admin" drop column if exists "role";`);
  }
}
