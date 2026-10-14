import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * t-2026-10-14-41: the `developer` role, the platform's super admin inside a
 * shop (`models/tenant-admin.ts`, `PLATFORM_ROLES`).
 *
 * The CHECK that `Migration20261008010000` added with the column is named
 * `tenant_admin_role_check` by Postgres, measured on both production
 * databases on 14.10.2026. It is rewritten with the fourth value. No row
 * changes role here: who becomes a developer is
 * `src/scripts/assign-developer-role.ts`.
 *
 * `down` turns every developer back into an owner first, the role each of
 * them had before, or the old CHECK would refuse the table.
 */
export class Migration20261014060000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tenant_admin" drop constraint if exists "tenant_admin_role_check";`);
    this.addSql(
      `alter table if exists "tenant_admin" add constraint "tenant_admin_role_check" check ("role" in ('owner', 'manager', 'operator', 'developer'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`update "tenant_admin" set "role" = 'owner' where "role" = 'developer';`);
    this.addSql(`alter table if exists "tenant_admin" drop constraint if exists "tenant_admin_role_check";`);
    this.addSql(
      `alter table if exists "tenant_admin" add constraint "tenant_admin_role_check" check ("role" in ('owner', 'manager', 'operator'));`,
    );
  }
}
