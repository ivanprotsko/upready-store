import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * t-2026-10-03-33: the `x402` slot of `tenant_integration_secret`.
 *
 * The CHECK constraint is rewritten WHOLE, the way `Migration20261003140000.ts`
 * explains: every migration that touches it carries the full list in force
 * before it plus its own value, so the order two of them run in can never drop
 * a slot. The list below is `Migration20261005100000`'s list (the one that
 * added `bitcart`) with `x402` added.
 *
 * Schema only. No row is written, so no shop gets x402 switched on by this.
 *
 * `down()` removes the `x402` rows first, so the narrower CHECK can be added
 * back, and restores `Migration20261005100000`'s list.
 */
export class Migration20261005120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`,
    );
    this.addSql(
      `alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'wildberries_write', 'ozon', 'cdek', 'apiship', 'pochta', 'telegram', 'tribute', 'btcpay', 'bitcart', 'x402'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`delete from "tenant_integration_secret" where "provider" = 'x402';`);
    this.addSql(
      `alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`,
    );
    this.addSql(
      `alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'wildberries_write', 'ozon', 'cdek', 'apiship', 'pochta', 'telegram', 'tribute', 'btcpay', 'bitcart'));`,
    );
  }
}
