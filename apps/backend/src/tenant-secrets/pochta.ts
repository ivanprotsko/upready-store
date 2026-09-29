import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { maskSecret, type MaskedSecret } from "./crypto";
import { readTenantSecretSlot, type TenantSecretSlot } from "./slot";
import type { PochtaCredentials } from "../pochta/client";

/**
 * Russian Post «Отправка» access of ONE shop — the plaintext shape of
 * `tenant_integration_secret.payload` for `provider = "pochta"` (46df-pochta).
 *
 * Two secrets, because the carrier issues two: the application token
 * (`Authorization: AccessToken …`) and the user key
 * (`X-User-Authorization: Basic base64(login:password)`). Measured 2026-09-29:
 * the token alone opens the delivery-point directory and nothing else, so the
 * user key is optional and every path that needs it checks for it.
 *
 * The two settings beside them are what a quote needs and not secrets: the
 * index of the post office the shop hands parcels to, and the parcel weight
 * for an item that has none.
 */
export type PochtaCredentialsPayload = {
  token: string;
  /** Base64 of `login:password`, or an empty string when the shop has not given one. */
  user_key: string;
  sender_index: string;
  default_weight_g: number;
};

export const POCHTA_DEFAULT_WEIGHT_G = 1000;

export type ResolvedPochtaSecret = Omit<TenantSecretSlot, "credentials"> & {
  credentials: PochtaCredentialsPayload;
};

export type MaskedPochtaSettings = {
  id: string;
  is_enabled: boolean;
  token: MaskedSecret;
  user_key: MaskedSecret;
  sender_index: string;
  default_weight_g: number;
};

export const emptyPochtaCredentials = (): PochtaCredentialsPayload => ({
  token: "",
  user_key: "",
  sender_index: "",
  default_weight_g: POCHTA_DEFAULT_WEIGHT_G,
});

/**
 * The cabinet shows the user key ready-made, but an owner may paste
 * `login:password` instead, or the whole header value. All three end up as the
 * bare Base64 the header wants.
 */
export const normalizeUserKey = (raw: string | null | undefined): string => {
  const value = (raw ?? "").trim().replace(/^basic\s+/i, "");
  if (!value) return "";
  return value.includes(":") ? Buffer.from(value, "utf8").toString("base64") : value;
};

/** The owner may paste the token with its scheme word; the header adds it back. */
export const normalizeToken = (raw: string | null | undefined): string =>
  (raw ?? "").trim().replace(/^accesstoken\s+/i, "");

export const readPochtaSecret = async (
  pg: Knex,
  tenantId: string,
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedPochtaSecret | null> => {
  const slot = await readTenantSecretSlot(pg, tenantId, "pochta", options);
  if (!slot) return null;
  const stored = slot.credentials as Partial<PochtaCredentialsPayload>;
  const weight = Number(stored.default_weight_g);
  return {
    ...slot,
    credentials: {
      token: typeof stored.token === "string" ? stored.token : "",
      user_key: typeof stored.user_key === "string" ? stored.user_key : "",
      sender_index: typeof stored.sender_index === "string" ? stored.sender_index : "",
      default_weight_g: Number.isFinite(weight) && weight > 0 ? weight : POCHTA_DEFAULT_WEIGHT_G,
    },
  };
};

/**
 * `readPochtaSecret` for a PUBLIC path (46df A-02), the same shape as
 * `readRobokassaSecretPublic`: a row this deployment cannot decrypt used to
 * answer the buyer's `/store/pochta/*` with a 500. Here the failure is logged
 * once at `warn` with the tenant id (never the payload, never the key) and the
 * shop reads as "Russian Post not connected". Panel routes and the fulfillment
 * provider keep calling `readPochtaSecret` and let the error surface.
 */
export const readPochtaSecretPublic = async (
  pg: Knex,
  tenantId: string,
  logger: { warn: (message: string) => void },
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedPochtaSecret | null> => {
  try {
    return await readPochtaSecret(pg, tenantId, options);
  } catch (error) {
    logger.warn(
      `Russian Post secret for tenant ${tenantId} could not be read; treating Russian Post as not connected on this public read (${
        error instanceof Error ? error.name : "unknown error"
      })`,
    );
    return null;
  }
};

/** What a response may carry: the state of each secret, never the secret. */
export const maskPochtaSettings = (secret: ResolvedPochtaSecret): MaskedPochtaSettings => ({
  id: secret.id,
  is_enabled: secret.is_enabled,
  token: maskSecret(secret.credentials.token),
  user_key: maskSecret(secret.credentials.user_key),
  sender_index: secret.credentials.sender_index,
  default_weight_g: secret.credentials.default_weight_g,
});

/** The pair the client takes; `null` while the token is missing. */
export const pochtaApiCredentials = (secret: ResolvedPochtaSecret | null): PochtaCredentials | null => {
  if (!secret?.credentials.token) return null;
  return { token: secret.credentials.token, user_key: secret.credentials.user_key || null };
};
