import { createHmac, timingSafeEqual } from "node:crypto";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { maskSecret, type MaskedSecret } from "./crypto";
import { readTenantSecretSlot, type TenantSecretSlot } from "./slot";

/**
 * The shop's OWN BTCPay Server store, the plaintext shape of
 * `tenant_integration_secret.payload` for `provider = "btcpay"`
 * (ask-20261005-070255-438f).
 *
 * Only the «own server» mode exists: the owner runs or rents a BTCPay Server,
 * creates a store there and pastes four values into the panel. The platform
 * never creates a store on anyone's behalf and never holds a wallet key; the
 * store receives into the owner's own wallet.
 *
 * - `server_url` is the server's public origin, optionally with a path prefix,
 *   always without a trailing slash (`normalizeBtcpayServerUrl`).
 * - `store_id` names the store on that server. Not a secret.
 * - `api_key` is a Greenfield API key, sent as `Authorization: token <key>`.
 *   It needs `btcpay.store.cancreateinvoice`, `btcpay.store.canviewinvoices`
 *   and, for refunds, `btcpay.store.cancreatepullpayments`.
 * - `webhook_secret` is the secret of the webhook the owner adds to the store,
 *   pointed at `/btcpay/webhook/<tenant id>`. It signs `BTCPay-Sig`.
 */
export type BtcpayCredentials = {
  server_url: string;
  store_id: string;
  api_key: string;
  webhook_secret: string;
};

export type ResolvedBtcpaySecret = {
  id: string;
  tenant_id: string;
  is_enabled: boolean;
  credentials: BtcpayCredentials;
};

export type MaskedBtcpaySettings = {
  id: string;
  provider: "btcpay";
  is_enabled: boolean;
  server_url: string;
  store_id: string;
  api_key: MaskedSecret;
  webhook_secret: MaskedSecret;
};

export const BTCPAY_CREDENTIAL_FIELDS = ["server_url", "store_id", "api_key", "webhook_secret"] as const;

export const emptyBtcpayCredentials = (): BtcpayCredentials => ({
  server_url: "",
  store_id: "",
  api_key: "",
  webhook_secret: "",
});

/** The fields still empty. A shop can switch BTCPay on only when this is empty. */
export const missingBtcpayFields = (credentials: BtcpayCredentials): string[] =>
  BTCPAY_CREDENTIAL_FIELDS.filter((field) => !credentials[field]);

export const maskBtcpaySettings = (row: ResolvedBtcpaySecret): MaskedBtcpaySettings => ({
  id: row.id,
  provider: "btcpay",
  is_enabled: row.is_enabled,
  server_url: row.credentials.server_url,
  store_id: row.credentials.store_id,
  api_key: maskSecret(row.credentials.api_key),
  webhook_secret: maskSecret(row.credentials.webhook_secret),
});

const text = (value: unknown): string => (typeof value === "string" ? value : "");

const fromSlot = (slot: TenantSecretSlot): ResolvedBtcpaySecret => ({
  id: slot.id,
  tenant_id: slot.tenant_id,
  is_enabled: slot.is_enabled,
  credentials: {
    server_url: text(slot.credentials.server_url),
    store_id: text(slot.credentials.store_id),
    api_key: text(slot.credentials.api_key),
    webhook_secret: text(slot.credentials.webhook_secret),
  },
});

/**
 * Reads the shop's BTCPay row off the shared Postgres connection, for the same
 * reason `readTributeSecret` does: the payment provider runs inside the payment
 * module's container and sees only the shared `pg` connection.
 *
 * A disabled row is `null` unless `includeDisabled` is set. Everything that
 * follows an invoice the shop already issued (the webhook, the sweep, a status
 * read, a refund) passes `includeDisabled`, so an owner who switches BTCPay off
 * stops new invoices without stranding a payment that is already on its way.
 */
export const readBtcpaySecret = async (
  pg: Knex,
  tenantId: string,
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedBtcpaySecret | null> => {
  const slot = await readTenantSecretSlot(pg, tenantId, "btcpay", options);
  return slot ? fromSlot(slot) : null;
};

/**
 * `readBtcpaySecret` for a PUBLIC path, the precaution `readTributeSecretPublic`
 * takes: a row that does not decrypt reads as "not connected", logged at
 * `warn`, instead of failing the whole storefront request.
 */
export const readBtcpaySecretPublic = async (
  pg: Knex,
  tenantId: string,
  logger: { warn: (message: string) => void },
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedBtcpaySecret | null> => {
  try {
    return await readBtcpaySecret(pg, tenantId, options);
  } catch (error) {
    logger.warn(
      `BTCPay secret for tenant ${tenantId} could not be decrypted; treating BTCPay as not connected on this public read (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
    return null;
  }
};

const LOOPBACK_HOST = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i;

const IPV4_LITERAL = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

const isPrivateIpv4 = (a: number, b: number): boolean =>
  a === 0 || // 0.0.0.0/8, "this network", which reaches this machine
  a === 10 || // 10.0.0.0/8
  (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
  (a === 192 && b === 168) || // 192.168.0.0/16
  (a === 169 && b === 254); // 169.254.0.0/16, link-local and cloud metadata

/**
 * Whether `hostname` (as `URL` gives it: IPv4 in canonical dotted form, IPv6
 * in brackets) is an address literal of a private or link-local range. Only
 * the literal is looked at, never DNS: a name that resolves into such a range
 * is not caught here.
 */
export const isPrivateAddressLiteral = (hostname: string): boolean => {
  const v4 = IPV4_LITERAL.exec(hostname);
  if (v4) {
    return isPrivateIpv4(Number(v4[1]), Number(v4[2]));
  }
  if (!hostname.startsWith("[") || !hostname.endsWith("]")) {
    return false;
  }
  const v6 = hostname.slice(1, -1).toLowerCase();
  if (v6 === "::") {
    return true;
  }
  // `URL` writes an IPv4-mapped address as `::ffff:a00:1`, the IPv4 part in two hextets.
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v6);
  if (mapped) {
    const high = parseInt(mapped[1], 16);
    return isPrivateIpv4(high >> 8, high & 0xff);
  }
  const first = parseInt(v6.split(":")[0] || "0", 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80; // fc00::/7, fe80::/10
};

/**
 * The server address as stored: the origin plus an optional path prefix, no
 * trailing slash, so the client can append `/api/v1/...` to it as is. `null`
 * for an address the backend must not call.
 *
 * HTTPS only, because the API key travels in a header. Plain HTTP is accepted
 * for a loopback host outside production, which is how a local BTCPay regtest
 * stand and the HTTP tests' mock server are reached. In production a loopback
 * host is refused on either scheme: the owner's server is never this machine.
 * So is an address literal of a private or link-local range
 * (`isPrivateAddressLiteral`): the backend must not be pointed at its own
 * network. An address with credentials, a query or a fragment is refused too,
 * because the client builds every request path onto it.
 */
export const normalizeBtcpayServerUrl = (
  raw: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null => {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const loopback = LOOPBACK_HOST.test(url.hostname);
  const production = env.NODE_ENV === "production";
  if (url.username || url.password || url.search || url.hash) {
    return null;
  }
  if (production && (loopback || isPrivateAddressLiteral(url.hostname))) {
    return null;
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    return null;
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
};

/**
 * BTCPay's webhook signature: `BTCPay-Sig: sha256=<hex>`, the HMAC-SHA256 of
 * the RAW request body keyed on the webhook's secret (Greenfield swagger
 * `swagger.template.webhooks.json`, v2.4.4: "sha256=HMAC256(UTF8(webhook's
 * secret), body)"). The caller passes `req.rawBody`, never a re-serialization
 * of the parsed JSON, for the reason `tributeSignature` gives.
 */
export const btcpaySignature = (rawBody: Buffer | string, secret: string): string =>
  `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

/**
 * Constant-time compare against a possibly absent or malformed header. A
 * header without the `sha256=` prefix, a digest of the wrong length and an
 * empty secret are all "not equal", never a throw.
 */
export const verifyBtcpaySignature = (
  rawBody: Buffer | string,
  secret: string,
  header: string | string[] | undefined,
): boolean => {
  if (!secret || typeof header !== "string") {
    return false;
  }
  const match = /^sha256=([0-9a-f]+)$/i.exec(header.trim());
  if (!match) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const incoming = Buffer.from(match[1].toLowerCase(), "hex");
  if (incoming.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(expected, incoming);
};
