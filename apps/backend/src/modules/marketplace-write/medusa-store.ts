import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { readTenantSecretSlot } from "../../tenant-secrets/slot";
import type MarketplaceWriteModuleService from "./service";
import type {
  MarketplaceCredentialBag,
  MarketplaceWriteAuditRow,
  MarketplaceWriteConsent,
  MarketplaceWriteOpClass,
  MarketplaceWriteStore,
} from "./types";

/**
 * The gates' view of Postgres for ONE tenant and ONE marketplace
 * (w20-wb-write-core).
 *
 * Kept apart from `execute.ts` so the gates can be tested without a database,
 * and so an adapter cannot reach around them: everything the gates read comes
 * through this object, and it is built from a tenant id the route resolved
 * (`getTenantScope`), never from a request body.
 *
 * `readCredential` deliberately takes the slot as an argument and reads it
 * with the generic reader: the write core has no way to name the READ slot,
 * because `execute.ts` only ever passes `adapter.credentialSlot`.
 */
/**
 * The `payload` column is `model.json()`, which Medusa types as an OBJECT, while
 * an audit row carries whatever the caller passed: every registry body is a
 * `z.object().strict()`, but the REFUSAL path audits `call.body` before it is
 * parsed, so a refused call can carry an array, a string or nothing at all.
 *
 * A non-object is stored wrapped under `value` rather than dropped or cast: the
 * audit row exists to say what was attempted, and `payload_sha256` is taken over
 * the ORIGINAL payload in `execute.ts`, so the fingerprint still identifies what
 * the caller sent (rule 20a: a substituted value must name itself).
 */
const asJsonColumn = (payload: unknown): Record<string, unknown> | null => {
  if (payload === null || payload === undefined) {
    return null;
  }
  if (typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return { value: payload };
};

export const createMedusaWriteStore = (options: {
  pg: Knex;
  service: MarketplaceWriteModuleService;
  tenantId: string;
  marketplace: string;
}): MarketplaceWriteStore => {
  const { pg, service, tenantId, marketplace } = options;

  return {
    readCredential: async (slot: string): Promise<MarketplaceCredentialBag | null> => {
      const row = await readTenantSecretSlot(pg, tenantId, slot);
      if (!row) {
        return null;
      }
      const values = Object.values(row.credentials).filter(
        (value) => typeof value === "string" && value.length > 0,
      );
      // A row whose payload decrypted to an empty object is not a credential.
      // Treating it as one would open gate (a) on nothing (rule 20a).
      return values.length ? row.credentials : null;
    },

    isEnabled: async (): Promise<boolean> => {
      const [setting] = (await service.listMarketplaceWriteSettings({
        tenant_id: tenantId,
        marketplace,
      })) as Array<{ is_enabled: boolean }>;
      return setting?.is_enabled === true;
    },

    findConsent: async (opClass: MarketplaceWriteOpClass): Promise<MarketplaceWriteConsent | null> => {
      const [row] = (await service.listMarketplaceWriteConsents({
        tenant_id: tenantId,
        marketplace,
        op_class: opClass,
      })) as Array<{
        op_class: MarketplaceWriteOpClass;
        confirmed_by: string;
        confirmed_at: Date | string;
        note: string | null;
      }>;

      return row
        ? {
            op_class: row.op_class,
            confirmed_by: row.confirmed_by,
            confirmed_at: row.confirmed_at,
            note: row.note ?? null,
          }
        : null;
    },

    appendAudit: async (row: MarketplaceWriteAuditRow): Promise<void> => {
      await service.createMarketplaceWriteAudits({
        ...row,
        payload: asJsonColumn(row.payload),
      });
    },
  };
};
