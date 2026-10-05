import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * ask-20261005-070255-438f, stage 2: the `bitcart` slot of
 * `tenant_integration_secret`.
 *
 * The CHECK constraint is rewritten WHOLE, the way `Migration20261003140000.ts`
 * explains: every migration that touches it carries the full list in force
 * before it plus its own value, so the order two of them run in can never drop
 * a slot. The list below is `Migration20261005090000`'s list with `bitcart`
 * added.
 *
 * Schema only. No row is written, so no shop gets Bitcart switched on by this.
 *
 * `down()` removes the `bitcart` rows first, so the narrower CHECK can be added
 * back, and restores `Migration20261005090000`'s list.
 */
export class Migration20261005100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`,
    );
    this.addSql(
      `alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'wildberries_write', 'ozon', 'cdek', 'apiship', 'pochta', 'telegram', 'tribute', 'btcpay', 'bitcart'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`delete from "tenant_integration_secret" where "provider" = 'bitcart';`);
    this.addSql(
      `alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`,
    );
    this.addSql(
      `alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'wildberries_write', 'ozon', 'cdek', 'apiship', 'pochta', 'telegram', 'tribute', 'btcpay'));`,
    );
  }
}
