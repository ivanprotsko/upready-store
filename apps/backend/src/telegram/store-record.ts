/**
 * Where a store's Mini App lives: `store.metadata.telegramMiniApp`. The single
 * store of this starter has no tenant row, and `store.metadata` is already the
 * home of the site-wide composition (`storefrontSettings`). On the multi-tenant
 * branches the same document belongs on the tenant record.
 *
 * The bot token stays inside the document (the DELETE route needs it to reset
 * the menu button) and is stripped from every API response by `toPublic`.
 * Encryption at rest is a follow-up on the tenant model, not here.
 */

import { Modules, MedusaError } from "@medusajs/framework/utils";
import type { IStoreModuleService } from "@medusajs/framework/types";
import type { MedusaRequest } from "@medusajs/framework/http";

import type { ProvisionResult } from "./provision";

export const METADATA_KEY = "telegramMiniApp";

export type TelegramMiniAppRecord = {
  botId: number;
  botUsername: string;
  botName: string;
  botToken: string;
  storefrontUrl: string;
  launch: ProvisionResult["launch"];
  provisionedAt: string;
  /** Timings of the last provisioning run, for the record. */
  steps: ProvisionResult["steps"];
  totalMs: number;
};

export type TelegramMiniAppPublic = Omit<TelegramMiniAppRecord, "botToken">;

export function toPublic(record: TelegramMiniAppRecord): TelegramMiniAppPublic {
  const { botToken: _botToken, ...rest } = record;
  return rest;
}

export async function readStoreRecord(req: MedusaRequest) {
  const storeModuleService: IStoreModuleService = req.scope.resolve(Modules.STORE);
  const [store] = await storeModuleService.listStores();
  const metadata = (store?.metadata ?? {}) as Record<string, unknown>;
  const record = (metadata[METADATA_KEY] as TelegramMiniAppRecord | undefined) ?? null;
  return { storeModuleService, store, metadata, record };
}

export async function writeStoreRecord(
  req: MedusaRequest,
  record: TelegramMiniAppRecord | null
): Promise<void> {
  const { storeModuleService, store, metadata } = await readStoreRecord(req);
  if (!store) throw new MedusaError(MedusaError.Types.INVALID_DATA, "No store to attach the Mini App to");
  const next: Record<string, unknown> = { ...metadata };
  if (record) {
    next[METADATA_KEY] = record;
  } else {
    delete next[METADATA_KEY];
  }
  await storeModuleService.updateStores(store.id, { metadata: next });
}
