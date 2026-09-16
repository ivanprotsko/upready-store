import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { decryptJson, keyFromEnv, maskSecret, type MaskedSecret } from "./crypto";
import type { CdekSenderMode } from "../cdek/method";
import type { CdekCredentials } from "../cdek/client";

/**
 * CDEK account of ONE shop — the plaintext shape of
 * `tenant_integration_secret.payload` for `provider = "cdek"`
 * (i02-apiship-cdek-shipping). The table, its encryption and its reader pattern
 * come from t03-tenant-secrets-robokassa; only the payload differs.
 *
 * A shop has TWO CDEK accounts in practice, the sandbox pair and the live pair,
 * because CDEK issues them separately (`api.edu.cdek.ru` against
 * `api.cdek.ru`) and a live password does not authenticate on the sandbox. Both
 * live in one row so switching the mode does not lose the other pair, exactly
 * how the Robokassa row carries both password pairs.
 */
export type CdekCredentialsPayload = {
  account: string;
  password: string;
  test_account: string;
  test_password: string;
  /** Where the parcel is handed to CDEK. */
  sender_mode: CdekSenderMode;
  /** The shop's own city as CDEK numbers it; `null` until the owner picks one. */
  sender_city_code: number | null;
  sender_city_name: string | null;
  sender_address: string | null;
  sender_name: string | null;
  sender_phone: string | null;
  /** The CDEK office the shop drops parcels at, when `sender_mode` is `warehouse`. */
  shipment_point: string | null;
  /**
   * The only thing standing between the status webhook and the open internet:
   * CDEK signs nothing, so this backend generates a token per shop, puts it in
   * the URL it registers with CDEK, and compares it on every callback
   * (`src/api/cdek/webhook/route.ts`). Rotating it means re-registering.
   */
  webhook_token: string | null;
  /** `uuid` CDEK gave the ORDER_STATUS subscription, so it can be replaced. */
  webhook_uuid: string | null;
};

export const CDEK_SECRET_FIELDS = ["password", "test_password"] as const;
export type CdekSecretField = (typeof CDEK_SECRET_FIELDS)[number];

export const CDEK_LIVE_BASE = "https://api.cdek.ru/v2";
export const CDEK_TEST_BASE = "https://api.edu.cdek.ru/v2";

export type ResolvedCdekSecret = {
  id: string;
  tenant_id: string;
  is_test: boolean;
  is_enabled: boolean;
  credentials: CdekCredentialsPayload;
};

/**
 * The masked view a panel route returns: the account logins are shown (the owner
 * needs to recognise which account is wired) and the passwords never are.
 */
export type MaskedCdekSettings = {
  id: string;
  provider: "cdek";
  is_test: boolean;
  is_enabled: boolean;
  account: string;
  test_account: string;
  password: MaskedSecret;
  test_password: MaskedSecret;
  sender_mode: CdekSenderMode;
  sender_city_code: number | null;
  sender_city_name: string | null;
  sender_address: string | null;
  sender_name: string | null;
  sender_phone: string | null;
  shipment_point: string | null;
  webhook_registered: boolean;
};

export const maskCdekSettings = (row: ResolvedCdekSecret): MaskedCdekSettings => ({
  id: row.id,
  provider: "cdek",
  is_test: row.is_test,
  is_enabled: row.is_enabled,
  account: row.credentials.account,
  test_account: row.credentials.test_account,
  password: maskSecret(row.credentials.password),
  test_password: maskSecret(row.credentials.test_password),
  sender_mode: row.credentials.sender_mode,
  sender_city_code: row.credentials.sender_city_code,
  sender_city_name: row.credentials.sender_city_name,
  sender_address: row.credentials.sender_address,
  sender_name: row.credentials.sender_name,
  sender_phone: row.credentials.sender_phone,
  shipment_point: row.credentials.shipment_point,
  webhook_registered: Boolean(row.credentials.webhook_uuid),
});

/**
 * The (base, account, password) triple the client needs for the shop's CURRENT
 * mode. Returns `null` when that mode has no pair yet, which is what keeps a
 * half-configured shop from quoting a price it cannot honour.
 */
export const cdekApiCredentials = (row: ResolvedCdekSecret): CdekCredentials | null => {
  const account = row.is_test ? row.credentials.test_account : row.credentials.account;
  const password = row.is_test ? row.credentials.test_password : row.credentials.password;
  if (!account || !password) return null;
  return { base: row.is_test ? CDEK_TEST_BASE : CDEK_LIVE_BASE, account, password };
};

/**
 * Reads the shop's CDEK row straight off the shared Postgres connection.
 *
 * Why SQL and not the tenant module service: the fulfillment provider
 * (`src/modules/cdek-fulfillment`) runs inside the fulfillment module's
 * container, which carries `__pg_connection__` but no other module's service —
 * the same constraint `robokassa.ts` documents for the payment provider. One
 * reader for the provider and the routes keeps the two from drifting.
 */
export const readCdekSecret = async (
  pg: Knex,
  tenantId: string,
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedCdekSecret | null> => {
  const row = (await pg("tenant_integration_secret")
    .select("id", "tenant_id", "payload", "is_test", "is_enabled")
    .where({ tenant_id: tenantId, provider: "cdek" })
    .whereNull("deleted_at")
    .first()) as
    | { id: string; tenant_id: string; payload: string; is_test: boolean; is_enabled: boolean }
    | undefined;

  if (!row || (!row.is_enabled && !options.includeDisabled)) {
    return null;
  }

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    is_test: row.is_test,
    is_enabled: row.is_enabled,
    credentials: decryptJson<CdekCredentialsPayload>(row.payload, keyFromEnv()),
  };
};

/** An empty payload, so a first save does not have to spell every field out. */
export const emptyCdekCredentials = (): CdekCredentialsPayload => ({
  account: "",
  password: "",
  test_account: "",
  test_password: "",
  sender_mode: "warehouse",
  sender_city_code: null,
  sender_city_name: null,
  sender_address: null,
  sender_name: null,
  sender_phone: null,
  shipment_point: null,
  webhook_token: null,
  webhook_uuid: null,
});
