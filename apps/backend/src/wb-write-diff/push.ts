import type { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { MARKETPLACE_WRITE_MODULE } from "../modules/marketplace-write";
import { createMedusaWriteStore } from "../modules/marketplace-write/medusa-store";
import type MarketplaceWriteModuleService from "../modules/marketplace-write/service";
import {
  MarketplaceWriteRefused,
  type MarketplaceWriteContext,
} from "../modules/marketplace-write/types";
import { WB_MARKETPLACE } from "../modules/wb-write/write-endpoints";
import { wbWrite } from "../modules/wb-write/write-transport";
import { priceBatches, stockBatches, type WbWriteBatch } from "./batches";
import type { PriceDiffRow, StockDiffRow, WbDiffKind, WbDiffResult } from "./types";

/**
 * The FIRST caller of the write core in this repository
 * (w21-wb-write-stocks-prices).
 *
 * w20 built the mechanism and left it with no caller at all, holding the
 * invariant "живой записи нет" as a lint. This file adds the caller for two
 * operation classes, and the invariant does not move: every batch below goes
 * through `wbWrite`, which means through all five gates of
 * `modules/marketplace-write/execute.ts`, the last of which is `WB_WRITE_LIVE=1`
 * in the process environment. No deployment of this repository sets it, and
 * `__tests__/no-live-write-call-site.unit.spec.ts` now checks that too, so the
 * only thing this file can produce is audit rows with `dry_run = true`.
 *
 * A refusal is NOT an error here. The shops have no write credential, so gate
 * (a) closes on the first batch and the run's job is to say so plainly and
 * journal it; the caller gets a counted outcome, never a thrown stack.
 */

export type PushOutcome = {
  kind: WbDiffKind;
  tenant_id: string;
  /** Batches built from the diff. `0` when nothing differs. */
  batches: number;
  /** Diff rows those batches carry. */
  rows: number;
  dry_run: number;
  refused: number;
  sent: number;
  /** One line per batch, in order, for the report and the script's stdout. */
  results: Array<{
    endpoint_id: string;
    params: Record<string, string | number>;
    rows: number;
    outcome: "dry_run" | "refused" | "sent";
    gate: string | null;
    payload_sha256: string | null;
    message: string | null;
  }>;
};

export const batchesFor = (diff: WbDiffResult): WbWriteBatch[] =>
  diff.kind === "stocks"
    ? stockBatches(diff.rows as StockDiffRow[])
    : priceBatches(diff.rows as PriceDiffRow[]);

/**
 * Runs a list of batches through the write core.
 *
 * `dryRun` is not a parameter and cannot be one: whether anything is sent is
 * decided by gate (e) inside `execute.ts`, reading the process environment. A
 * flag here would be a sixth gate that this file owns, which is precisely the
 * arrangement w20 exists to prevent.
 *
 * Kept apart from `pushWbDiff` so the dry-run acceptance can pass its own
 * store and its own `fetch` counter without a database
 * (`__tests__/push.unit.spec.ts`).
 */
export const runWriteBatches = async (
  batches: WbWriteBatch[],
  options: { kind: WbDiffKind; ctx: MarketplaceWriteContext },
): Promise<PushOutcome> => {
  const outcome: PushOutcome = {
    kind: options.kind,
    tenant_id: options.ctx.tenantId,
    batches: batches.length,
    rows: batches.reduce((sum, batch) => sum + batch.rows, 0),
    dry_run: 0,
    refused: 0,
    sent: 0,
    results: [],
  };

  for (const batch of batches) {
    try {
      const result = await wbWrite(
        batch.endpointId,
        { params: batch.params, body: batch.body },
        options.ctx,
      );

      if (result.dryRun) {
        outcome.dry_run += 1;
      } else {
        outcome.sent += 1;
      }

      outcome.results.push({
        endpoint_id: batch.endpointId,
        params: batch.params,
        rows: batch.rows,
        outcome: result.dryRun ? "dry_run" : "sent",
        gate: null,
        payload_sha256: result.payloadSha256,
        message: null,
      });
    } catch (error) {
      if (!(error instanceof MarketplaceWriteRefused)) {
        throw error;
      }
      outcome.refused += 1;
      outcome.results.push({
        endpoint_id: batch.endpointId,
        params: batch.params,
        rows: batch.rows,
        outcome: "refused",
        gate: error.gate,
        payload_sha256: null,
        message: error.message,
      });
    }
  }

  return outcome;
};

/** The same run against the shop's real rows: the store is Postgres, the actor is the caller. */
export const pushWbDiff = async (
  container: MedusaContainer,
  options: { tenantId: string; actor: string; diff: WbDiffResult },
): Promise<PushOutcome> => {
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const service = container.resolve<MarketplaceWriteModuleService>(MARKETPLACE_WRITE_MODULE);

  const store = createMedusaWriteStore({
    pg,
    service,
    tenantId: options.tenantId,
    marketplace: WB_MARKETPLACE,
  });

  return runWriteBatches(batchesFor(options.diff), {
    kind: options.diff.kind,
    ctx: { tenantId: options.tenantId, actor: options.actor, store },
  });
};
