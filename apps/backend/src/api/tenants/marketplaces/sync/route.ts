import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace";
import { MARKETPLACES } from "../../../../modules/marketplace/registry";
import type MarketplaceModuleService from "../../../../modules/marketplace/service";
import { getTenantScope } from "../../tenant-scope";
import { buildSyncPayload, startSyncNow, syncInProgress } from "../sync-payload";

export type { SyncNowResult } from "../sync-payload";

/**
 * `GET /tenants/marketplaces/sync` — the «Синхронизация» screen
 * (w16-mp-scheduler-ops, spec 2.6 and 2.7).
 *
 * ONE ROW PER (MARKETPLACE, KIND), for every marketplace at once. The card
 * screen answers "what is this marketplace", this one answers "is the data
 * fresh, and if not, why" — and it is built so that the second question can be
 * answered NEGATIVELY. The body is built in `../sync-payload.ts`, which
 * `GET /tenants/marketplaces/:marketplace/sync` shares for one marketplace
 * (task-07 of ask-20261005-023327-f02b); the rules it keeps are written there.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);

  res.json(await buildSyncPayload({ pg, mp, tenantId: tenant.id }, MARKETPLACES));
};

/**
 * `POST /tenants/marketplaces/sync` — «Обновить сейчас» (t-2026-09-24-n6).
 *
 * Ivan, 2026-09-24: after saving a key the owner had no way to ask for the
 * first import without waiting for the scheduler's own tick, up to ten
 * minutes away for orders and up to an hour for cards and prices. This starts
 * every connected marketplace's every kind at once, for THIS tenant only
 * (`startSyncNow` in `../sync-payload.ts`, which says what it does not
 * override and why it does not wait for the sync itself).
 *
 * «Уже идёт» is tenant-wide here: any kind of any marketplace still inside a
 * `running` row younger than the stale-lock timeout answers 409.
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const now = new Date();

  if (await syncInProgress(mp, tenant.id, now)) {
    res.status(409).json({
      type: "sync_in_progress",
      message: "Обмен уже идёт для этого магазина — дождитесь, пока текущий прогон закончится.",
    });
    return;
  }

  const results = await startSyncNow(
    { container: req.scope, tenantId: tenant.id, logger, pg },
    MARKETPLACES,
  );

  res.json({ results, now: now.toISOString() });
};
