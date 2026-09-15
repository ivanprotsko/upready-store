import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * A WB rate limit stops being a failure (w03-wb-sales-questions-mirror).
 *
 * `rate_limited` joins the status enum and `retry_at` records the window WB
 * itself named in the 429 header. Existing rows are re-classified by their own
 * evidence: a run whose `error` carries a 429 was waiting, not broken.
 */
export class Migration20260916064500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "wb_sync_run" drop constraint if exists "wb_sync_run_status_check";`,
    );
    this.addSql(
      `alter table if exists "wb_sync_run" add constraint "wb_sync_run_status_check" ` +
        `check ("status" in ('running', 'succeeded', 'rate_limited', 'failed'));`,
    );
    this.addSql(
      `alter table if exists "wb_sync_run" add column if not exists "retry_at" timestamptz null;`,
    );
    this.addSql(
      `update "wb_sync_run" set "status" = 'rate_limited' ` +
        `where "status" = 'failed' and "error" like '%429%';`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`update "wb_sync_run" set "status" = 'failed' where "status" = 'rate_limited';`);
    this.addSql(`alter table if exists "wb_sync_run" drop column if exists "retry_at";`);
    this.addSql(
      `alter table if exists "wb_sync_run" drop constraint if exists "wb_sync_run_status_check";`,
    );
    this.addSql(
      `alter table if exists "wb_sync_run" add constraint "wb_sync_run_status_check" ` +
        `check ("status" in ('running', 'succeeded', 'failed'));`,
    );
  }
}
