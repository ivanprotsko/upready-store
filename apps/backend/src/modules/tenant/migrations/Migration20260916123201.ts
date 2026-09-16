import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * p01-settings-integrations-restructure: the `apiship` slot of
 * `tenant_integration_secret`.
 *
 * `provider` is a `model.enum`, which Postgres carries as a CHECK constraint,
 * so adding a name to `TENANT_INTEGRATION_PROVIDERS` in the model alone leaves
 * the INSERT dying at runtime with every typecheck, unit test and lint green
 * (measured in w20 on `wildberries_write`, recorded in
 * `~/upready/memory/upready-store-model-enum-and-missing-migration-2026-09-16.md`).
 *
 * `down()` IS NOT THE GENERATED ONE. `medusa db:generate` wrote the previous
 * list from `.snapshot-tenant.json`, which had not been refreshed when `cdek`
 * was added, so the generated rollback would have dropped `cdek` from the CHECK
 * and made every stored CDEK account un-writable — a rollback that breaks rows
 * a different task shipped. The list below is the one that was actually in
 * force before this migration, read off the stand
 * (`select pg_get_constraintdef(oid) … 'tenant_integration_secret_provider_check'`
 * on `upready_store_p01`, 2026-09-16: robokassa, wildberries, wildberries_write,
 * ozon, cdek).
 */
export class Migration20260916123201 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`,
    );
    this.addSql(
      `alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'wildberries_write', 'ozon', 'cdek', 'apiship'));`,
    );
  }

  override async down(): Promise<void> {
    // A row in the slot being removed would fail the narrower CHECK, so it goes
    // first. Soft-deleted rows count: the constraint covers every row of the
    // table, not only the live ones.
    this.addSql(`delete from "tenant_integration_secret" where "provider" = 'apiship';`);
    this.addSql(
      `alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`,
    );
    this.addSql(
      `alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'wildberries_write', 'ozon', 'cdek'));`,
    );
  }
}
