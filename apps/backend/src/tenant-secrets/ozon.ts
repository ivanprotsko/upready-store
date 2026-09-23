import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { decryptJson, keyFromEnv, maskSecret, type MaskedSecret } from "./crypto";

/**
 * The Ozon Seller API credentials of ONE shop: the plaintext shape of
 * `tenant_integration_secret.payload` for `provider = "ozon"`
 * (w11-ozon-readonly-client).
 *
 * Same mechanism as Robokassa (t03) and Wildberries (w01): the row is
 * AES-256-GCM under the platform's `INTEGRATION_ENCRYPTION_KEY`, never
 * plaintext, and no route ever returns the value. `GET /tenants/ozon/status`
 * returns what the key SAYS about itself (`src/modules/ozon/credentials.ts`)
 * plus `{ set, last4 }`, nothing more.
 *
 * Ozon needs TWO values where WB needs one: `Client-Id` identifies the cabinet
 * and `Api-Key` authorises. Both live in one encrypted payload, because they
 * are useless apart and rotating one without the other is not a thing Ozon
 * offers.
 */
export type OzonCredentialsPayload = {
  client_id: string;
  api_key: string;
};

export type ResolvedOzonSecret = {
  id: string;
  tenant_id: string;
  is_enabled: boolean;
  /** When the key was last saved; the scheduler's `auth_failed` gate reads it. */
  updated_at?: Date | null;
  credentials: OzonCredentialsPayload;
};

export type MaskedOzonSettings = {
  id: string;
  provider: "ozon";
  is_enabled: boolean;
  client_id: string;
  api_key: MaskedSecret;
};

export const maskOzonSettings = (row: ResolvedOzonSecret): MaskedOzonSettings => ({
  id: row.id,
  provider: "ozon",
  is_enabled: row.is_enabled,
  client_id: row.credentials.client_id,
  api_key: maskSecret(row.credentials.api_key),
});

/**
 * The shop's Ozon row, read straight off the shared Postgres connection for
 * the same reason `readWildberriesSecret` does: the reader has to work from a
 * container that carries `__pg_connection__` but not every module's service,
 * and one reader for the routes and the sync keeps the two from drifting.
 *
 * Returns `null` when there is no row, it is soft-deleted, or it is disabled.
 */
export const readOzonSecret = async (
  pg: Knex,
  tenantId: string,
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedOzonSecret | null> => {
  const row = (await pg("tenant_integration_secret")
    .select("id", "tenant_id", "payload", "is_enabled", "updated_at")
    .where({ tenant_id: tenantId, provider: "ozon" })
    .whereNull("deleted_at")
    .first()) as
    | {
        id: string;
        tenant_id: string;
        payload: string;
        is_enabled: boolean;
        updated_at?: Date | string | null;
      }
    | undefined;

  if (!row || (!row.is_enabled && !options.includeDisabled)) {
    return null;
  }

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    is_enabled: row.is_enabled,
    updated_at: row.updated_at ? new Date(row.updated_at) : null,
    credentials: decryptJson<OzonCredentialsPayload>(row.payload, keyFromEnv()),
  };
};
