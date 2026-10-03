import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * t-cherk-22: the `tribute` slot of `tenant_integration_secret`.
 *
 * `provider` is a `model.enum`, carried by Postgres as a CHECK constraint, so a
 * name added to `TENANT_INTEGRATION_PROVIDERS` alone leaves the INSERT dying at
 * runtime with every typecheck and unit test green (see
 * `Migration20260929230000.ts`, which added `pochta` the same way).
 *
 * Cross-branch hazard (flagged for the lead, see report.md): `feat/telegram-auth`
 * (t-cherk-20) was, as of this migration's writing, working on its own rewrite
 * of this same CHECK constraint to add `telegram`, not yet merged into `dev`.
 * Both migrations DROP and re-ADD the whole constraint rather than appending a
 * single value, so whichever of the two branches merges SECOND will, unless its
 * migration is updated at merge time to include both new values, silently drop
 * the other's. This migration's list is only what was on `dev` when it was
 * written (`...'pochta'` + `'tribute'`); it does not know about `telegram`.
 *
 * `down()` restores the list `Migration20260929230000` wrote, and removes the
 * rows of the slot first so the narrower CHECK can be added back.
 */
export class Migration20261003130500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`,
    );
    this.addSql(
      `alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'wildberries_write', 'ozon', 'cdek', 'apiship', 'pochta', 'tribute'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`delete from "tenant_integration_secret" where "provider" = 'tribute';`);
    this.addSql(
      `alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`,
    );
    this.addSql(
      `alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'wildberries_write', 'ozon', 'cdek', 'apiship', 'pochta'));`,
    );
  }
}
