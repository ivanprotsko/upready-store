import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { maskSecret, type MaskedSecret } from "./crypto";
import { normalizeBtcpayServerUrl } from "./btcpay";
import { readTenantSecretSlot, type TenantSecretSlot } from "./slot";

/**
 * The shop's OWN Bitcart store, the plaintext shape of
 * `tenant_integration_secret.payload` for `provider = "bitcart"`
 * (ask-20261005-070255-438f, stage 2).
 *
 * Only the «own server» mode exists: the owner runs or rents a Bitcart,
 * creates a store and its wallets there, and pastes four values into the
 * panel. The platform never creates a store on anyone's behalf and never holds
 * a wallet key; the store receives into the owner's own wallets.
 *
 * - `server_url` is the Merchants API's public address, optionally with a
 *   path prefix (`https://pay.example.com/api` in Bitcart's one-domain mode),
 *   always without a trailing slash (`normalizeBitcartUrl`).
 * - `admin_url` is the address of the same server's admin app, where Bitcart
 *   serves the invoice's checkout page (`/i/<id>`) and a refund's claim page
 *   (`/refunds/<id>`). The API does not report it, so the owner names it
 *   (`https://pay.example.com/admin` in one-domain mode).
 * - `store_id` names the store on that server. Not a secret.
 * - `api_key` is a Bitcart API token, sent as `Authorization: Bearer <token>`.
 *   It needs `invoice_management` and, for refunds, `payout_management`.
 *
 * No webhook secret: Bitcart signs nothing it sends (`api/services/ipn_sender.py`),
 * so a notification is only ever a hint to read the invoice again.
 */
export type BitcartCredentials = {
  server_url: string;
  admin_url: string;
  store_id: string;
  api_key: string;
};

export type ResolvedBitcartSecret = {
  id: string;
  tenant_id: string;
  is_enabled: boolean;
  credentials: BitcartCredentials;
};

export type MaskedBitcartSettings = {
  id: string;
  provider: "bitcart";
  is_enabled: boolean;
  server_url: string;
  admin_url: string;
  store_id: string;
  api_key: MaskedSecret;
};

export const BITCART_CREDENTIAL_FIELDS = ["server_url", "admin_url", "store_id", "api_key"] as const;

export const emptyBitcartCredentials = (): BitcartCredentials => ({
  server_url: "",
  admin_url: "",
  store_id: "",
  api_key: "",
});

/** The fields still empty. A shop can switch Bitcart on only when this is empty. */
export const missingBitcartFields = (credentials: BitcartCredentials): string[] =>
  BITCART_CREDENTIAL_FIELDS.filter((field) => !credentials[field]);

export const maskBitcartSettings = (row: ResolvedBitcartSecret): MaskedBitcartSettings => ({
  id: row.id,
  provider: "bitcart",
  is_enabled: row.is_enabled,
  server_url: row.credentials.server_url,
  admin_url: row.credentials.admin_url,
  store_id: row.credentials.store_id,
  api_key: maskSecret(row.credentials.api_key),
});

const text = (value: unknown): string => (typeof value === "string" ? value : "");

const fromSlot = (slot: TenantSecretSlot): ResolvedBitcartSecret => ({
  id: slot.id,
  tenant_id: slot.tenant_id,
  is_enabled: slot.is_enabled,
  credentials: {
    server_url: text(slot.credentials.server_url),
    admin_url: text(slot.credentials.admin_url),
    store_id: text(slot.credentials.store_id),
    api_key: text(slot.credentials.api_key),
  },
});

/**
 * Reads the shop's Bitcart row off the shared Postgres connection, for the
 * reason `readBtcpaySecret` gives: the payment provider runs inside the
 * payment module's container and sees only the shared `pg` connection.
 *
 * A disabled row is `null` unless `includeDisabled` is set. Everything that
 * follows an invoice the shop already issued (the notification route, the
 * sweep, a status read, a refund) passes `includeDisabled`, so an owner who
 * switches Bitcart off stops new invoices without stranding a payment that is
 * already on its way.
 */
export const readBitcartSecret = async (
  pg: Knex,
  tenantId: string,
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedBitcartSecret | null> => {
  const slot = await readTenantSecretSlot(pg, tenantId, "bitcart", options);
  return slot ? fromSlot(slot) : null;
};

/**
 * `readBitcartSecret` for a PUBLIC path, the precaution `readBtcpaySecretPublic`
 * takes: a row that does not decrypt reads as "not connected", logged at
 * `warn`, instead of failing the whole storefront request.
 */
export const readBitcartSecretPublic = async (
  pg: Knex,
  tenantId: string,
  logger: { warn: (message: string) => void },
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedBitcartSecret | null> => {
  try {
    return await readBitcartSecret(pg, tenantId, options);
  } catch (error) {
    logger.warn(
      `Bitcart secret for tenant ${tenantId} could not be decrypted; treating Bitcart as not connected on this public read (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
    return null;
  }
};

/**
 * A Bitcart address (API or admin) as stored: the origin plus an optional path
 * prefix, no trailing slash. `null` for an address the backend must not call
 * or send a buyer to.
 *
 * The rules are BTCPay's (`normalizeBtcpayServerUrl`), for the same reasons:
 * HTTPS only, plain HTTP only for a loopback host outside production, no
 * loopback and no private or link-local address literal in production, and no
 * credentials, query or fragment.
 */
export const normalizeBitcartUrl = (raw: string, env: NodeJS.ProcessEnv = process.env): string | null =>
  normalizeBtcpayServerUrl(raw, env);
