import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { MARKETPLACES } from "../modules/marketplace/registry";
import { MP_SCHEDULER_CRON } from "../modules/marketplace/schedule";
import { runDueSyncs } from "../modules/marketplace/scheduler";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";

/**
 * THE MARKETPLACE SCHEDULER (w16-mp-scheduler-ops, spec 2.6).
 *
 * WHAT IT BUYS. Without it the mirror is refreshed by hand, every screen built
 * on the normalized layer shows yesterday, and — worse — a sync that did NOT
 * happen looks exactly like a marketplace with nothing to give. This job makes
 * the data live and makes its absence visible.
 *
 * WHAT IT DOES NOT DO. It calls `adapter.runSync`, which calls registered
 * reads and nothing else. There is no write path here, no host, no method and
 * no endpoint id: Ivan's order of 2026-09-16 02:46 WITA stands unchanged.
 *
 * ONE SCHEDULE PER (TENANT x MARKETPLACE x KIND). The job wakes every five
 * minutes and asks `schedule.ts` which triples are due; the intervals are the
 * spec's, in one named map, and the single-run rule is the `running` row of
 * `mp_sync_run` held by a partial unique index. Nothing about Wildberries or
 * Ozon is written here: the marketplaces come from `registry.ts` and the kinds
 * from each adapter, so a third marketplace is scheduled by being registered
 * (rule 20).
 *
 * MULTI-TENANT. Every shop of the stand is walked, and a shop without a key
 * for a marketplace is skipped rather than failed: not having connected Ozon
 * is a normal state of a shop.
 *
 * MP_SCHEDULER=off (Ivan, 2026-09-25 ~21:30 WITA, t-2026-09-25-23): the local
 * backend now holds a copy of the live database next to the live encryption
 * key, so its own five-minute tick must not call Wildberries or Ozon next to
 * production. Off means off before anything else runs — no tenant lookup, no
 * `runDueSyncs`, no marketplace request, no `mp_sync_run` row — and is logged
 * once per process, not on every tick, or the log would be as noisy as the
 * schedule it replaces. Unset, or any other value, changes nothing: production
 * does not set this variable. `POST /tenants/marketplaces/sync` («Обновить
 * сейчас») does not read it and keeps working with the switch on.
 */
let loggedSchedulerOff = false;

export default async function marketplaceSyncJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  if (process.env.MP_SCHEDULER === "off") {
    if (!loggedSchedulerOff) {
      logger.info(
        "[mp-sync] расписание выключено (MP_SCHEDULER=off) — синхронизация только по кнопке «Обновить сейчас»",
      );
      loggedSchedulerOff = true;
    }
    return;
  }

  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = container.resolve<TenantModuleService>(TENANT_MODULE);

  const tenants = (await tenantModule.listTenants({})) as unknown as {
    id: string;
    handle: string;
  }[];

  if (!tenants.length) {
    /**
     * Zero shops on a stand that has a marketplace module is a setup problem,
     * not a quiet no-op: the job would otherwise report nothing forever and
     * read as "everything is up to date" (rule 20a).
     */
    logger.warn(
      "[mp-sync] на стенде нет ни одного тенанта — планировщик маркетплейсов не запускал ничего",
    );
    return;
  }

  for (const tenant of tenants) {
    const done = await runDueSyncs(
      { container, tenantId: tenant.id, logger },
      MARKETPLACES,
      pg,
    );

    const ran = done.filter((entry) => entry.outcome !== "skipped");
    if (!ran.length) {
      continue;
    }

    logger.info(
      `[mp-sync] ${tenant.handle}: ` +
        ran
          .map(
            (entry) =>
              `${entry.marketplace}.${entry.kind} ${entry.outcome} ` +
              `(${entry.rows} rows, ${entry.requests} requests)`,
          )
          .join("; "),
    );
  }
}

export const config = {
  name: "marketplace-sync",
  schedule: MP_SCHEDULER_CRON,
};
