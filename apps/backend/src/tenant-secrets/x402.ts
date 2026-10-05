import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { normalizeBtcpayServerUrl } from "./btcpay";
import { readTenantSecretSlot, type TenantSecretSlot } from "./slot";
import {
  offeredX402Networks,
  x402NetworkById,
  X402_NETWORK_IDS,
  type X402Network,
  type X402NetworkId,
} from "../x402/networks";
import { isEvmAddress } from "../x402/protocol";

/**
 * The shop's x402 settings (t-2026-10-03-33), the plaintext shape of
 * `tenant_integration_secret.payload` for `provider = "x402"`.
 *
 * Nothing here is a secret: the platform never holds a wallet key, the buyer
 * signs a transfer straight to `pay_to`, and the facilitator moves it. The row
 * lives in the secrets table anyway because that is where a shop's payment
 * method, its switch and its test flag live, and the encryption costs nothing.
 *
 * - `pay_to` is the shop's own EVM address that receives the USDC.
 * - `networks` are the CAIP-2 ids the shop takes payments on
 *   (`x402/networks.ts`). The row's `is_test` is on while any of them is a test
 *   network, which paints the storefront's test-mode dot.
 * - `facilitator_url` is the facilitator's base URL; `/verify` and `/settle`
 *   are appended to it.
 */
export type X402Credentials = {
  pay_to: string;
  networks: string[];
  facilitator_url: string;
};

export type ResolvedX402Secret = {
  id: string;
  tenant_id: string;
  is_enabled: boolean;
  is_test: boolean;
  credentials: X402Credentials;
};

export type X402SettingsView = {
  id: string;
  provider: "x402";
  is_enabled: boolean;
  is_test: boolean;
  pay_to: string;
  networks: string[];
  facilitator_url: string;
};

/**
 * The public facilitator the x402 project runs, the default of its reference
 * client (`DEFAULT_FACILITATOR_URL`). Its documentation offers it for test
 * networks; a shop that takes real USDC names its own.
 */
export const DEFAULT_X402_FACILITATOR_URL = "https://x402.org/facilitator";

export const emptyX402Credentials = (): X402Credentials => ({
  pay_to: "",
  networks: [],
  facilitator_url: DEFAULT_X402_FACILITATOR_URL,
});

/** The values still missing or unusable. A shop can switch x402 on only when this is empty. */
export const missingX402Fields = (credentials: X402Credentials): string[] => {
  const missing: string[] = [];
  if (!isEvmAddress(credentials.pay_to)) missing.push("pay_to");
  if (!credentials.networks.some((id) => x402NetworkById(id))) missing.push("networks");
  if (!credentials.facilitator_url) missing.push("facilitator_url");
  return missing;
};

/** Whether the row takes test money: any chosen network is a test network. */
export const x402IsTest = (networks: readonly string[]): boolean =>
  networks.some((id) => x402NetworkById(id)?.testnet === true);

/**
 * The networks a payment may use right now: the shop's choice, narrowed to
 * what this instance offers. A shop that chose Base while the operator has not
 * switched real money on is offered Base Sepolia only, or nothing.
 */
export const effectiveX402Networks = (
  credentials: Pick<X402Credentials, "networks">,
  env: NodeJS.ProcessEnv = process.env,
): X402Network[] => offeredX402Networks(env).filter((network) => credentials.networks.includes(network.id));

/** Known ids only, each once, in the catalog's order. */
export const normalizeX402Networks = (networks: readonly unknown[]): X402NetworkId[] =>
  X402_NETWORK_IDS.filter((id) => networks.includes(id));

/**
 * The facilitator address as stored, under the rules of the BTCPay server
 * address (`normalizeBtcpayServerUrl`): HTTPS, plain HTTP only for a loopback
 * host outside production (the tests' stand-in), never a private address
 * literal in production, no credentials, query or fragment, no trailing slash.
 * The backend calls this address with a buyer's signed payment, so the same
 * care applies.
 */
export const normalizeX402FacilitatorUrl = (raw: string, env: NodeJS.ProcessEnv = process.env): string | null =>
  normalizeBtcpayServerUrl(raw, env);

export const x402SettingsView = (row: ResolvedX402Secret): X402SettingsView => ({
  id: row.id,
  provider: "x402",
  is_enabled: row.is_enabled,
  is_test: row.is_test,
  pay_to: row.credentials.pay_to,
  networks: row.credentials.networks,
  facilitator_url: row.credentials.facilitator_url,
});

const text = (value: unknown): string => (typeof value === "string" ? value : "");

const fromSlot = (slot: TenantSecretSlot): ResolvedX402Secret => {
  const networks = Array.isArray(slot.credentials.networks) ? normalizeX402Networks(slot.credentials.networks) : [];
  return {
    id: slot.id,
    tenant_id: slot.tenant_id,
    is_enabled: slot.is_enabled,
    is_test: x402IsTest(networks),
    credentials: {
      pay_to: text(slot.credentials.pay_to),
      networks,
      facilitator_url: text(slot.credentials.facilitator_url),
    },
  };
};

/**
 * Reads the shop's x402 row off the shared Postgres connection, as
 * `readBtcpaySecret` does: the payment provider runs inside the payment
 * module's container and sees only `pg`. A disabled row is `null` unless
 * `includeDisabled` is set.
 */
export const readX402Secret = async (
  pg: Knex,
  tenantId: string,
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedX402Secret | null> => {
  const slot = await readTenantSecretSlot(pg, tenantId, "x402", options);
  return slot ? fromSlot(slot) : null;
};

/**
 * `readX402Secret` for a PUBLIC path: a row that does not decrypt reads as
 * "not connected", logged at `warn`, instead of failing the storefront request.
 */
export const readX402SecretPublic = async (
  pg: Knex,
  tenantId: string,
  logger: { warn: (message: string) => void },
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedX402Secret | null> => {
  try {
    return await readX402Secret(pg, tenantId, options);
  } catch (error) {
    logger.warn(
      `x402 settings of tenant ${tenantId} could not be decrypted; treating x402 as not connected on this public read (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
    return null;
  }
};

/**
 * Whether the shop can take an x402 payment right now: switched on, complete,
 * and with at least one network this instance offers.
 */
export const x402Ready = (secret: ResolvedX402Secret | null, env: NodeJS.ProcessEnv = process.env): boolean =>
  Boolean(
    secret &&
      secret.is_enabled &&
      !missingX402Fields(secret.credentials).length &&
      effectiveX402Networks(secret.credentials, env).length,
  );
