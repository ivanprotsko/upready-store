import { Migration } from "@medusajs/framework/mikro-orm/migrations";

/**
 * Carries the per-marketplace run logs and transport journals into the shared
 * ones (w12-marketplace-core, spec 2.3).
 *
 *   wb_sync_run   -> mp_sync_run   with marketplace = 'wb'
 *   wb_api_call   -> mp_api_call   with marketplace = 'wb'
 *   ozon_sync_run -> mp_sync_run   with marketplace = 'ozon'
 *   ozon_api_call -> mp_api_call   with marketplace = 'ozon'
 *
 * DATA IS NOT LOST AND NOTHING IS DROPPED. The source tables keep every row
 * and every reader they have; dropping them is a separate step after
 * acceptance, not this one. The acceptor's question — "did only registered
 * reads leave this process, on every marketplace" — becomes one query instead
 * of two, which is the whole reason the shared tables exist: two journals are
 * two queries and one marketplace nobody checked.
 *
 * IDEMPOTENT. The new id is derived from the old one (`mprun_<old id>`), so a
 * second run of this migration, or a re-run of the whole migration set on a
 * stand, inserts nothing: `on conflict (id) do nothing`. It is written against
 * `to_regclass` too, because a database migrated before `wb`/`ozon` existed
 * has no such table and must not fail here.
 */
export class Migration20260916000100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      do $$
      begin
        if to_regclass('public.wb_sync_run') is not null then
          insert into "mp_sync_run"
            ("id", "tenant_id", "marketplace", "kind", "status", "is_fixture",
             "started_at", "finished_at", "rows", "requests", "error",
             "created_at", "updated_at", "deleted_at")
          select
            'mprun_' || r."id", r."tenant_id", 'wb', r."kind"::text, r."status"::text, false,
            r."started_at", r."finished_at", r."rows", r."requests", r."error",
            r."created_at", r."updated_at", r."deleted_at"
          from "wb_sync_run" r
          on conflict ("id") do nothing;
        end if;

        if to_regclass('public.ozon_sync_run') is not null then
          insert into "mp_sync_run"
            ("id", "tenant_id", "marketplace", "kind", "status", "is_fixture",
             "started_at", "finished_at", "rows", "requests", "error",
             "created_at", "updated_at", "deleted_at")
          select
            'mprun_' || r."id", r."tenant_id", 'ozon', r."kind"::text, r."status"::text, r."is_fixture",
            r."started_at", r."finished_at", r."rows", r."requests", r."error",
            r."created_at", r."updated_at", r."deleted_at"
          from "ozon_sync_run" r
          on conflict ("id") do nothing;
        end if;

        if to_regclass('public.wb_api_call') is not null then
          insert into "mp_api_call"
            ("id", "tenant_id", "marketplace", "sync_run_id", "endpoint_id", "host",
             "method", "path", "status", "ms", "error", "is_fixture", "fetched_at",
             "created_at", "updated_at", "deleted_at")
          select
            'mpcall_' || c."id", c."tenant_id", 'wb',
            case when c."sync_run_id" is null then null else 'mprun_' || c."sync_run_id" end,
            c."endpoint_id", c."host", c."method", c."path", c."status", c."ms", c."error",
            false, c."fetched_at", c."created_at", c."updated_at", c."deleted_at"
          from "wb_api_call" c
          on conflict ("id") do nothing;
        end if;

        if to_regclass('public.ozon_api_call') is not null then
          insert into "mp_api_call"
            ("id", "tenant_id", "marketplace", "sync_run_id", "endpoint_id", "host",
             "method", "path", "status", "ms", "error", "is_fixture", "fetched_at",
             "created_at", "updated_at", "deleted_at")
          select
            'mpcall_' || c."id", c."tenant_id", 'ozon',
            case when c."sync_run_id" is null then null else 'mprun_' || c."sync_run_id" end,
            c."endpoint_id", c."host", c."method", c."path", c."status", c."ms", c."error",
            c."is_fixture", c."fetched_at", c."created_at", c."updated_at", c."deleted_at"
          from "ozon_api_call" c
          on conflict ("id") do nothing;
        end if;
      end
      $$;
    `);
  }

  /**
   * Down removes only the rows this migration could have written — the ones
   * whose id carries the derived prefix. A row a later import wrote into the
   * shared tables is not this migration's to delete.
   */
  override async down(): Promise<void> {
    this.addSql(`delete from "mp_api_call" where "id" like 'mpcall\\_%\\_%';`);
    this.addSql(`delete from "mp_sync_run" where "id" like 'mprun\\_%\\_%';`);
  }
}
