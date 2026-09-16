import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { decryptJson, encryptJson, keyFromEnv } from "./crypto";
import type { TenantIntegrationProvider } from "../modules/tenant/models/tenant-integration-secret";

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

/**
 * The module service methods a slot write needs, named structurally so this
 * file does not import the tenant module (and the tenant module does not have
 * to know about encryption).
 */
export type TenantSecretStore = {
  // Method syntax, not properties: the service's generated signatures take
  // every field optional plus `...rest`, and only a method's bivariant
  // parameter check accepts the narrower shape this file passes.
  createTenantIntegrationSecrets(data: {
    tenant_id: string;
    provider: TenantIntegrationProvider;
    payload: string;
    is_test?: boolean;
    is_enabled?: boolean;
  }): Promise<unknown>;
  updateTenantIntegrationSecrets(data: {
    id: string;
    payload?: string;
    is_test?: boolean;
    is_enabled?: boolean;
  }): Promise<unknown>;
  softDeleteTenantIntegrationSecrets(ids: string[]): Promise<unknown>;
};

export type WriteTenantSecretSlot = {
  tenantId: string;
  /**
   * Typed against the model's own enum: `provider` carries a CHECK constraint
   * (`modules/tenant/models/tenant-integration-secret.ts`), and a slot absent
   * from that list fails at INSERT time with every test around it green.
   */
  provider: TenantIntegrationProvider;
  /** Plaintext credentials. Encrypted here; the caller never touches a cipher. */
  credentials: Record<string, unknown>;
  isEnabled?: boolean;
  /** Only Robokassa has a test mode. Absent = the column keeps its value. */
  isTest?: boolean;
};

/**
 * THE ONE WRITER of `tenant_integration_secret` (w24-integration-keys-self-service).
 *
 * Before this task the Robokassa route encrypted and upserted its row inline
 * and every other slot was filled by a seed script, so "how a credential is
 * stored" had as many answers as there were slots. A new integration that
 * copies the nearest route copies whatever that route got wrong; one writer
 * means the encryption, the soft-delete revival and the enabled default are
 * decided once (rule 20).
 *
 * A soft-deleted row is REVIVED rather than shadowed by a second row: the
 * readers take `.whereNull("deleted_at").first()`, so two live rows for one
 * (tenant, provider) would make which credential is in force depend on row
 * order. `readTenantSecretSlot` cannot see a deleted row, so the revival looks
 * it up here.
 */
export const writeTenantSecretSlot = async (
  pg: Knex,
  store: TenantSecretStore,
  input: WriteTenantSecretSlot,
): Promise<{ id: string; created: boolean }> => {
  const { tenantId, provider, credentials, isEnabled, isTest } = input;
  const payload = encryptJson(credentials, keyFromEnv());

  const existing = (await pg("tenant_integration_secret")
    .select("id", "deleted_at")
    .where({ tenant_id: tenantId, provider })
    .orderByRaw("deleted_at is null desc")
    .first()) as { id: string; deleted_at: Date | null } | undefined;

  if (existing) {
    if (existing.deleted_at) {
      await pg("tenant_integration_secret")
        .where({ id: existing.id })
        .update({ deleted_at: null });
    }
    await store.updateTenantIntegrationSecrets({
      id: existing.id,
      payload,
      ...(isTest === undefined ? {} : { is_test: isTest }),
      ...(isEnabled === undefined ? {} : { is_enabled: isEnabled }),
    });
    return { id: existing.id, created: false };
  }

  const created = (await store.createTenantIntegrationSecrets({
    tenant_id: tenantId,
    provider,
    payload,
    ...(isTest === undefined ? {} : { is_test: isTest }),
    is_enabled: isEnabled ?? true,
  })) as { id: string } | Array<{ id: string }>;

  const row = Array.isArray(created) ? created[0] : created;
  return { id: row.id, created: true };
};

/**
 * Forget one slot. Soft-delete, like every other deletion in this codebase:
 * the row stays for the audit and `readTenantSecretSlot` stops seeing it.
 */
export const deleteTenantSecretSlot = async (
  pg: Knex,
  store: TenantSecretStore,
  tenantId: string,
  provider: TenantIntegrationProvider,
): Promise<{ id: string | null; deleted: boolean }> => {
  const existing = await readTenantSecretSlot(pg, tenantId, provider, { includeDisabled: true });
  if (!existing) {
    return { id: null, deleted: false };
  }
  await store.softDeleteTenantIntegrationSecrets([existing.id]);
  return { id: existing.id, deleted: true };
};
