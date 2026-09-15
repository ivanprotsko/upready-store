import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { decryptJson, keyFromEnv } from "./crypto";

/**
 * One shop's credentials for one integration SLOT, whatever the integration
 * (w20-wb-write-core).
 *
 * `readWildberriesSecret` and `readRobokassaSecret` each know their own field
 * names; this reader knows only that a slot is a row of
 * `tenant_integration_secret` whose `payload` is an AES-256-GCM blob of a JSON
 * object. The write core needs exactly that, because the slot it reads is the
 * adapter's business: `wildberries_write` today, `ozon_write` next.
 *
 * A disabled row is `null` by default, the same rule the other readers follow:
 * a credential the owner switched off is a credential nobody may use.
 */
export type TenantSecretSlot = {
  id: string;
  tenant_id: string;
  provider: string;
  is_enabled: boolean;
  credentials: Record<string, unknown>;
};

export const readTenantSecretSlot = async (
  pg: Knex,
  tenantId: string,
  provider: string,
  options: { includeDisabled?: boolean } = {},
): Promise<TenantSecretSlot | null> => {
  const row = (await pg("tenant_integration_secret")
    .select("id", "tenant_id", "provider", "payload", "is_enabled")
    .where({ tenant_id: tenantId, provider })
    .whereNull("deleted_at")
    .first()) as
    | { id: string; tenant_id: string; provider: string; payload: string; is_enabled: boolean }
    | undefined;

  if (!row || (!row.is_enabled && !options.includeDisabled)) {
    return null;
  }

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    provider: row.provider,
    is_enabled: row.is_enabled,
    credentials: decryptJson<Record<string, unknown>>(row.payload, keyFromEnv()),
  };
};
