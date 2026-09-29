import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * 46df-pochta: the `pochta` slot of `tenant_integration_secret`.
 *
 * `provider` is a `model.enum`, carried by Postgres as a CHECK constraint, so a
 * name added to `TENANT_INTEGRATION_PROVIDERS` alone leaves the INSERT dying at
 * runtime with every typecheck and unit test green (see
 * `Migration20260916123201.ts`, which added `apiship` the same way).
 *
 * `down()` restores the list that was in force before this migration, the one
 * `Migration20260916123201` wrote, and removes the rows of the slot first so the
 * narrower CHECK can be added back.
 */
export class Migration20260929230000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`,
    );
    this.addSql(
      `alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'wildberries_write', 'ozon', 'cdek', 'apiship', 'pochta'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`delete from "tenant_integration_secret" where "provider" = 'pochta';`);
    this.addSql(
      `alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`,
    );
    this.addSql(
      `alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'wildberries_write', 'ozon', 'cdek', 'apiship'));`,
    );
  }
}
