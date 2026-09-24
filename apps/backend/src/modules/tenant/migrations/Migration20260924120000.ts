import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * `tenant_admin.email` moves from platform-wide unique to unique per
 * `tenant_id` (o25-platform-admin-all-shops): the same emailpass auth
 * identity (`PLATFORM_ADMIN_EMAIL`) needs one `tenant_admin` row in every
 * tenant, and a single-column unique index made that impossible.
 */
export class Migration20260924120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`drop index if exists "IDX_tenant_admin_email_unique";`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_admin_email_tenant_id_unique" ON "tenant_admin" ("email", "tenant_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_tenant_admin_email_tenant_id_unique";`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_tenant_admin_email_unique" ON "tenant_admin" ("email") WHERE deleted_at IS NULL;`);
  }

}
