import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { decryptJson, keyFromEnv, maskSecret, type MaskedSecret } from "./crypto";
import { readTenantSecretSlot } from "./slot";

/**
 * The Wildberries Seller API key of ONE shop: the plaintext shape of
 * `tenant_integration_secret.payload` for `provider = "wildberries"`
 * (w01-wb-readonly-client).
 *
 * Same mechanism as Robokassa (t03): the row is AES-256-GCM under the
 * platform's `INTEGRATION_ENCRYPTION_KEY`, never plaintext, and no route ever
 * returns the value. `GET /tenants/wb/status` returns what the key SAYS about
 * itself (`src/modules/wb/token.ts`) plus `{ set, last4 }`, nothing more.
 *
 * WB issues one key per token category set; a single JWT carries the whole
 * access bitmask, so one field is the whole credential.
 */
export type WildberriesCredentials = {
  api_key: string;
};

export type ResolvedWildberriesSecret = {
  id: string;
  tenant_id: string;
  is_enabled: boolean;
  credentials: WildberriesCredentials;
};

export type MaskedWildberriesSettings = {
  id: string;
  provider: "wildberries";
  is_enabled: boolean;
  api_key: MaskedSecret;
};

export const maskWildberriesSettings = (
  row: ResolvedWildberriesSecret,
): MaskedWildberriesSettings => ({
  id: row.id,
  provider: "wildberries",
  is_enabled: row.is_enabled,
  api_key: maskSecret(row.credentials.api_key),
});

/**
 * The shop's WB row, read straight off the shared Postgres connection for the
 * same reason `readRobokassaSecret` does: the reader has to work from a
 * container that carries `__pg_connection__` but not every module's service,
 * and one reader for the routes and the sync keeps the two from drifting.
 *
 * Returns `null` when there is no row, it is soft-deleted, or it is disabled.
 */
export const readWildberriesSecret = async (
  pg: Knex,
  tenantId: string,
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedWildberriesSecret | null> => {
  const row = (await pg("tenant_integration_secret")
    .select("id", "tenant_id", "payload", "is_enabled")
    .where({ tenant_id: tenantId, provider: "wildberries" })
    .whereNull("deleted_at")
    .first()) as
    | { id: string; tenant_id: string; payload: string; is_enabled: boolean }
    | undefined;

  if (!row || (!row.is_enabled && !options.includeDisabled)) {
    return null;
  }

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    is_enabled: row.is_enabled,
    credentials: decryptJson<WildberriesCredentials>(row.payload, keyFromEnv()),
  };
};

/**
 * The slot holding the WRITE key (w20-wb-write-core).
 *
 * A SEPARATE secret from `wildberries` on purpose: Ivan's order of
 * 2026-09-16 02:46 WITA is that a read key which happens to carry write
 * rights must not be able to write, so the write path never reads the read
 * slot. No shop has this row today, and the write gates refuse everything
 * while that is true.
 *
 * Same shape as the read credential: WB issues one JWT carrying the whole
 * access bitmask, so one field is the whole credential.
 */
export const WILDBERRIES_READ_SLOT = "wildberries";
export const WILDBERRIES_WRITE_SLOT = "wildberries_write";

export const readWildberriesWriteSecret = async (
  pg: Knex,
  tenantId: string,
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedWildberriesSecret | null> => {
  const slot = await readTenantSecretSlot(pg, tenantId, WILDBERRIES_WRITE_SLOT, options);
  if (!slot) {
    return null;
  }
  return {
    id: slot.id,
    tenant_id: slot.tenant_id,
    is_enabled: slot.is_enabled,
    credentials: slot.credentials as WildberriesCredentials,
  };
};
