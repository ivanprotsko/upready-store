import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Adds the `cdek` slot to `tenant_integration_secret.provider`
 * (i02-apiship-cdek-shipping).
 *
 * `model.enum` renders that list as a CHECK constraint, so without this
 * migration a shop's CDEK credentials cannot be inserted at all — and the
 * failure is a runtime 500 that no typecheck and no unit test reaches, exactly
 * the way `wildberries_write` was measured to fail on 2026-09-16.
 */
export class Migration20260916104500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`);
    this.addSql(`alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'wildberries_write', 'ozon', 'cdek'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`);
    this.addSql(`alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'wildberries_write', 'ozon'));`);
  }
}
