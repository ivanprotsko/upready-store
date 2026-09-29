import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { decryptJson, ENCRYPTION_KEY_ENV, keyFromEnv } from "./crypto";
import type { TenantSecretStore } from "./slot";

/**
 * A stored credential this deployment cannot decrypt (46df D1).
 *
 * Every reader in this directory decrypts `tenant_integration_secret.payload`
 * with `INTEGRATION_ENCRYPTION_KEY` and throws when the key does not fit: a
 * database restored under another key, a rotated key, a damaged row. Measured
 * on every stand made from the live snapshot, where three rows of one shop
 * were encrypted with the live key: `GET /tenants/payment-settings`,
 * `/tenants/delivery-settings` and `/tenants/marketplaces` answered 500, and
 * the owner could not even delete the row, because the delete read it first.
 *
 * The owner cannot repair a key, only re-enter what the row held. So the panel
 * routes read through {@link tryReadTenantSecret}, which turns exactly that
 * failure into a state the panel shows («не читается, введите заново»), and
 * write or delete the row by id without ever decrypting the old payload.
 *
 * What stays loud: a missing key (a deployment error, `keyFromEnv` throws as
 * before) and any failure that is not the payload itself, such as the database
 * being down. The payload is checked by decrypting it once more, not by
 * matching an error message.
 */
export type UnreadableTenantSecret = {
  id: string;
  provider: string;
  is_test: boolean;
  is_enabled: boolean;
};

export type TriedTenantSecret<T> = {
  /** What the reader returned, `null` when the row is absent or unreadable. */
  secret: T | null;
  /** Set only when a live row exists and its payload does not decrypt. */
  unreadable: UnreadableTenantSecret | null;
};

type SecretRow = {
  id: string;
  provider: string;
  payload: string;
  is_test: boolean;
  is_enabled: boolean;
};

/** The live row of one slot, payload included, WITHOUT decrypting it. */
export const findTenantSecretRow = async (
  pg: Knex,
  tenantId: string,
  provider: string,
): Promise<SecretRow | null> => {
  const row = (await pg("tenant_integration_secret")
    .select("id", "provider", "payload", "is_test", "is_enabled")
    .where({ tenant_id: tenantId, provider })
    .whereNull("deleted_at")
    .first()) as SecretRow | undefined;
  return row ?? null;
};

const decrypts = (payload: string, key: Buffer): boolean => {
  try {
    decryptJson(payload, key);
    return true;
  } catch {
    return false;
  }
};

/**
 * Runs one of the existing readers (`readRobokassaSecret`, `readCdekSecret`,
 * an adapter's `readCredentials`…) and, when it throws because the slot's row
 * does not decrypt, answers `{ secret: null, unreadable }` instead of the 500.
 * One warning names the row id and never any part of the payload.
 */
export const tryReadTenantSecret = async <T>(
  pg: Knex,
  tenantId: string,
  provider: string,
  read: () => Promise<T | null>,
  logger?: { warn: (message: string) => void },
): Promise<TriedTenantSecret<T>> => {
  try {
    return { secret: await read(), unreadable: null };
  } catch (error) {
    let key: Buffer;
    try {
      key = keyFromEnv();
    } catch {
      throw error;
    }
    const row = await findTenantSecretRow(pg, tenantId, provider);
    if (!row || decrypts(row.payload, key)) {
      throw error;
    }
    logger?.warn(
      `[tenant-secrets] ${provider} row ${row.id} of tenant ${tenantId} does not decrypt with the current ${ENCRYPTION_KEY_ENV}; the panel asks the owner to enter it again`,
    );
    return {
      secret: null,
      unreadable: {
        id: row.id,
        provider: row.provider,
        is_test: row.is_test,
        is_enabled: row.is_enabled,
      },
    };
  }
};

/**
 * Soft-deletes one slot by id, without reading its payload, so an unreadable
 * row can be removed like any other. `deleteTenantSecretSlot` in `slot.ts`
 * decrypts first and therefore cannot.
 */
export const forgetTenantSecretSlot = async (
  pg: Knex,
  store: Pick<TenantSecretStore, "softDeleteTenantIntegrationSecrets">,
  tenantId: string,
  provider: string,
): Promise<{ id: string | null; deleted: boolean }> => {
  const row = await findTenantSecretRow(pg, tenantId, provider);
  if (!row) {
    return { id: null, deleted: false };
  }
  await store.softDeleteTenantIntegrationSecrets([row.id]);
  return { id: row.id, deleted: true };
};
