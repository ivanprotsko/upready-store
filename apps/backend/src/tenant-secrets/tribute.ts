import { createHmac, timingSafeEqual } from "node:crypto";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { maskSecret, type MaskedSecret } from "./crypto";
import { readTenantSecretSlot, type TenantSecretSlot } from "./slot";

/**
 * Tribute Shop API credentials of ONE shop, the plaintext shape of
 * `tenant_integration_secret.payload` for `provider = "tribute"` (t-cherk-22).
 *
 * ONE value is enough: `api_key` both authenticates `POST /shop/orders`
 * (`Api-Key` header) and signs the webhook body (`trbt-signature`), unlike
 * Robokassa's two password pairs. `shop_id` is optional — Tribute scopes an
 * order to a shop only when the owner's account holds more than one; omitted,
 * the API defaults to the oldest shop on the account, which is correct for
 * the overwhelming majority of sellers (one shop, one key).
 */
export type TributeCredentials = {
  api_key: string;
  shop_id: string | null;
};

export type ResolvedTributeSecret = {
  id: string;
  tenant_id: string;
  is_enabled: boolean;
  credentials: TributeCredentials;
};

export type MaskedTributeSettings = {
  id: string;
  provider: "tribute";
  is_enabled: boolean;
  shop_id: string | null;
  api_key: MaskedSecret;
};

export const emptyTributeCredentials = (): TributeCredentials => ({ api_key: "", shop_id: null });

export const maskTributeSettings = (row: ResolvedTributeSecret): MaskedTributeSettings => ({
  id: row.id,
  provider: "tribute",
  is_enabled: row.is_enabled,
  shop_id: row.credentials.shop_id,
  api_key: maskSecret(row.credentials.api_key),
});

const fromSlot = (slot: TenantSecretSlot): ResolvedTributeSecret => ({
  id: slot.id,
  tenant_id: slot.tenant_id,
  is_enabled: slot.is_enabled,
  credentials: {
    api_key: typeof slot.credentials.api_key === "string" ? slot.credentials.api_key : "",
    shop_id: typeof slot.credentials.shop_id === "string" ? slot.credentials.shop_id : null,
  },
});

/**
 * Reads the shop's Tribute row straight off the shared Postgres connection —
 * same reasoning as `readRobokassaSecret`: the payment provider runs inside
 * the payment module's container, which has no access to the tenant module's
 * service, only the shared `pg` connection.
 */
export const readTributeSecret = async (
  pg: Knex,
  tenantId: string,
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedTributeSecret | null> => {
  const slot = await readTenantSecretSlot(pg, tenantId, "tribute", options);
  return slot ? fromSlot(slot) : null;
};

/**
 * `readTributeSecret` for a PUBLIC path (same precaution as
 * `readRobokassaSecretPublic`, 46df A-02): a wrong `INTEGRATION_ENCRYPTION_KEY`
 * or a tampered row must not 500 the whole shop's storefront over one shop's
 * bad Tribute secret. Reads as "not connected" instead, logged once at `warn`.
 */
export const readTributeSecretPublic = async (
  pg: Knex,
  tenantId: string,
  logger: { warn: (message: string) => void },
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedTributeSecret | null> => {
  try {
    return await readTributeSecret(pg, tenantId, options);
  } catch (error) {
    logger.warn(
      `Tribute secret for tenant ${tenantId} could not be decrypted; treating Tribute as not connected on this public read (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
    return null;
  }
};

/**
 * Tribute's webhook signature: `trbt-signature` is the HMAC-SHA256 of the
 * RAW request body (hex digest), keyed on the shop's own `api_key` — there is
 * no separate webhook secret (source: `https://wiki.tribute.tg/for-shops/api/webhooks`,
 * read 2026-10-02, see `t-cherk-22/notes.md`). Unlike Robokassa's form fields,
 * the signed material is the exact byte stream the body parser received, so
 * the caller must pass `req.rawBody` (`bodyParser: { preserveRawBody: true }`
 * on the route), never a re-serialization of the parsed JSON: a different key
 * order or whitespace would produce a different, wrongly-rejected digest.
 */
export const tributeSignature = (rawBody: Buffer | string, apiKey: string): string =>
  createHmac("sha256", apiKey).update(rawBody).digest("hex");

/**
 * Constant-time compare against a possibly absent/malformed header. A length
 * mismatch would throw inside `timingSafeEqual`, so it is checked first and
 * answered as "not equal" rather than letting the throw escape as a 500 — the
 * same shape a tampered signature should produce, not a crash a probe can use
 * to tell "right length" from "wrong length".
 */
export const verifyTributeSignature = (
  rawBody: Buffer | string,
  apiKey: string,
  header: string | string[] | undefined,
): boolean => {
  if (typeof header !== "string" || header.length === 0) {
    return false;
  }
  const expected = tributeSignature(rawBody, apiKey);
  const expectedBuf = Buffer.from(expected, "hex");
  const incomingBuf = Buffer.from(header.trim().toLowerCase(), "hex");
  if (expectedBuf.length !== incomingBuf.length || expectedBuf.length === 0) {
    return false;
  }
  return timingSafeEqual(expectedBuf, incomingBuf);
};

export const TRIBUTE_CURRENCIES = ["rub", "usd", "eur"] as const;
export type TributeCurrency = (typeof TRIBUTE_CURRENCIES)[number];

/**
 * Tribute's `amount` is an integer in MINOR units (kopecks/cents) for all
 * three currencies it accepts — none of them is zero-decimal — while Medusa
 * hands every payment provider the MAJOR amount (`input.amount`, the same
 * decimal rubles/dollars/euros `formatOutSum` takes in `robokassa.ts`).
 */
export const toTributeMinorUnits = (amount: number | string): number => Math.round(Number(amount) * 100);

/** The reverse of {@link toTributeMinorUnits}, for reading an amount Tribute reports back. */
export const fromTributeMinorUnits = (minorUnits: number): number => minorUnits / 100;
