import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * t-cherk-22, combined with t-2026-10-02-telegram-auth's own migration on
 * merge (the lead's instruction after reviewing PR #225): the
 * `tenant_integration_secret_provider_check` CHECK constraint is rewritten
 * WHOLE by every migration that touches it (see `Migration20260929230000.ts`'s
 * own doc comment, and `migration-names-unique.unit.spec.ts`'s doc comment for
 * the collision this exact pattern already caused once, with `telegram-bot`).
 *
 * This branch's original `Migration20261003130500.ts` (deleted, replaced by
 * this file) added `tribute` to the list as it stood BEFORE
 * `Migration20261003030000.ts` (telegram-auth's `telegram` slot, merged in
 * from `merge/cherk-night-into-dev` / PR #223) existed on this branch. Left
 * as two separate migrations, `Migration20261003030000` runs first
 * (chronologically earlier) and sets the list to `[...pochta, telegram]`;
 * the old `Migration20261003130500` would then run second and overwrite it
 * with `[...pochta, tribute]` — silently dropping `telegram`, the exact
 * failure this task's own report flagged as a hazard rather than fixed, and
 * exactly what `migration-names-unique.unit.spec.ts` already caught ONE
 * occurrence of on the stand (`t-cherk-telegram-login`, `PUT
 * /tenants/telegram-bot` → 500 `CheckConstraintViolation`).
 *
 * Resolved here with ONE migration, timestamped after `Migration20261003030000`,
 * that carries BOTH new values on top of the base list
 * `Migration20260929230000` left in force.
 *
 * `down()` restores the list `Migration20261003030000` (telegram-auth) wrote,
 * the state immediately before this migration, and removes `tribute`'s own
 * rows first so the narrower CHECK can be added back.
 */
export class Migration20261003140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`,
    );
    this.addSql(
      `alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'wildberries_write', 'ozon', 'cdek', 'apiship', 'pochta', 'telegram', 'tribute'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`delete from "tenant_integration_secret" where "provider" = 'tribute';`);
    this.addSql(
      `alter table if exists "tenant_integration_secret" drop constraint if exists "tenant_integration_secret_provider_check";`,
    );
    this.addSql(
      `alter table if exists "tenant_integration_secret" add constraint "tenant_integration_secret_provider_check" check("provider" in ('robokassa', 'wildberries', 'wildberries_write', 'ozon', 'cdek', 'apiship', 'pochta', 'telegram'));`,
    );
  }
}
