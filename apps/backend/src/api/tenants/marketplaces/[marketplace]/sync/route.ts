import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace";
import type { MarketplaceAdapter } from "../../../../../modules/marketplace/contract";
import { MARKETPLACE_IDS, adapterFor } from "../../../../../modules/marketplace/registry";
import type MarketplaceModuleService from "../../../../../modules/marketplace/service";
import { getTenantScope } from "../../../tenant-scope";
import { buildSyncPayload, startSyncNow, syncInProgress, syncViewOf } from "../../sync-payload";

/**
 * «Wildberries → Обновление» (task-07 of ask-20261005-023327-f02b): the
 * schedule of ONE marketplace, and «Обновить сейчас» for that marketplace
 * only.
 *
 * `GET` answers `{ marketplace, warnings, schedule, now }`: the entry
 * `GET /tenants/marketplaces/sync` carries for this marketplace and that
 * marketplace's own warnings, built by the same `buildSyncPayload`. It reads
 * only this marketplace's key and runs, so opening the Wildberries screen
 * sends nothing to Ozon (its key check is a live request) and nothing to
 * Wildberries (its key is decoded locally).
 *
 * `POST` starts this marketplace's kinds the way the shared `POST` starts all
 * of them, and answers 409 while a run of THIS marketplace is still going:
 * an Ozon import in progress is no reason to refuse the Wildberries button.
 */

const adapterOf = (req: AuthenticatedMedusaRequest): MarketplaceAdapter => {
  const id = String(req.params.marketplace ?? "");
  const adapter = adapterFor(id);
  if (!adapter) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Маркетплейс ${id} не подключён. Есть: ${MARKETPLACE_IDS.join(", ")}.`,
    );
  }
  return adapter;
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const adapter = adapterOf(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);

  const payload = await buildSyncPayload({ pg, mp, tenantId: tenant.id }, [adapter]);

  res.json(syncViewOf(payload, adapter.id));
};

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const tenant = await getTenantScope(req);
  const adapter = adapterOf(req);
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);
  const logger = req.scope.resolve<Logger>(ContainerRegistrationKeys.LOGGER);
  const now = new Date();

  if (await syncInProgress(mp, tenant.id, now, adapter.id)) {
    res.status(409).json({
      type: "sync_in_progress",
      message: `Обновление ${adapter.label} уже идёт. Дождитесь, пока текущий прогон закончится.`,
    });
    return;
  }

  const results = await startSyncNow(
    { container: req.scope, tenantId: tenant.id, logger, pg },
    [adapter],
  );

  res.json({ results, now: now.toISOString() });
};
