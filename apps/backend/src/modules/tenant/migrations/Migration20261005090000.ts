import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * ask-20261005-070255-438f: the `btcpay` slot of `tenant_integration_secret`.
 *
 * The CHECK constraint is rewritten WHOLE, the way `Migration20261003140000.ts`
 * explains: every migration that touches it carries the full list in force
 * before it plus its own value, so the order two of them run in can never drop
 * a slot. The list below is that migration's list with `btcpay` added.
 *
 * Schema only. No row is written, so no shop gets BTCPay switched on by this.
 *
 * `down()` removes the `btcpay` rows first, so the narrower CHECK can be added
 * back, and restores `Migration20261003140000`'s list.
 */
export class Migration20261005090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`,
    );
    this.addSql(
      `alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'wildberries_write', 'ozon', 'cdek', 'apiship', 'pochta', 'telegram', 'tribute', 'btcpay'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`delete from "tenant_integration_secret" where "provider" = 'btcpay';`);
    this.addSql(
      `alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`,
    );
    this.addSql(
      `alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'wildberries_write', 'ozon', 'cdek', 'apiship', 'pochta', 'telegram', 'tribute'));`,
    );
  }
}
