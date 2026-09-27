import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * t-2026-09-27-05: the tariff a tenant was created on and when its trial ends
 * (`tenant.plan_id`, `tenant.plan_trial_ends_at`), stamped by the onboarding
 * wizard's server route. Additive only: every existing tenant keeps both
 * columns null and behaves as before — no backfill.
 */
export class Migration20260926225740 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tenant" add column if not exists "plan_id" text null, add column if not exists "plan_trial_ends_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "tenant" drop column if exists "plan_id", drop column if exists "plan_trial_ends_at";`);
  }

}
