import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { maskSecret, type MaskedSecret } from "./crypto";
import { readTenantSecretSlot, type TenantSecretSlot } from "./slot";
import { APISHIP_BASE_URL, type ApishipCredentials as ApishipApiCredentials } from "../apiship/client";
import type { ApishipSenderMode } from "../apiship/method";

/**
 * ApiShip access of ONE shop — the plaintext shape of
 * `tenant_integration_secret.payload` for `provider = "apiship"`
 * (p01-settings-integrations-restructure, extended in t-2026-10-14-58).
 *
 * ONE secret: the token. ApiShip authenticates with a bare `Authorization:
 * <token>` header and nothing else (measured, `src/apiship/client.ts`). The
 * test contour `api.dev.apiship.ru` issues its OWN token, and a stand that
 * needs it points `APISHIP_BASE_URL` at it rather than storing a second value.
 *
 * Beside the token, what every shipment needs and what is not a secret: the
 * sender as ApiShip wants it (`contactName`, `phone`, `addressString`, …), how
 * the parcel is handed over, and the parcel defaults for an item without a
 * weight or dimensions. The same row, so the provider reads once.
 *
 * A row written before this task carries the token only; `readApishipSecret`
 * fills every other field with its default, so nothing that worked stops.
 */
export type ApishipCredentials = {
  token: string;
  /** The contact person on the label and in the carrier's calls. */
  sender_name: string | null;
  sender_company: string | null;
  sender_phone: string | null;
  sender_email: string | null;
  sender_country_code: string;
  sender_region: string | null;
  sender_city: string | null;
  /** The whole address on one line, what ApiShip parses (`addressString`). */
  sender_address: string | null;
  sender_index: string | null;
  /** `courier`: a courier collects from the shop; `point`: the shop brings parcels to a carrier's point. */
  sender_mode: ApishipSenderMode;
  /** The ApiShip point id the shop drops parcels at, when `sender_mode` is `point`. */
  sender_point_id: number | null;
  /** Grams for a unit whose variant and product carry no weight. */
  default_weight_g: number;
  /** Centimetres of the parcel when the goods carry no dimensions. */
  default_length_cm: number;
  default_width_cm: number;
  default_height_cm: number;
  /**
   * The only thing standing between the status webhook and the open internet:
   * ApiShip signs nothing, so this backend generates a token per shop, puts it
   * in the URL it registers with ApiShip, and compares it on every callback
   * (`src/api/apiship/webhook/route.ts`).
   */
  webhook_token: string | null;
  /** `uuid` ApiShip gave each subscription, so it can be found and replaced. */
  webhook_uuids: Partial<Record<"ORDER_STATUS" | "ORDER_NUMBER_UPDATE", string>>;
};

export const APISHIP_DEFAULT_WEIGHT_G = 500;
export const APISHIP_DEFAULT_SIZE_CM = { length: 30, width: 20, height: 10 } as const;

export type ResolvedApishipSecret = Omit<TenantSecretSlot, "credentials"> & {
  credentials: ApishipCredentials;
};

export type MaskedApishipSettings = {
  id: string;
  is_enabled: boolean;
  token: MaskedSecret;
  sender_name: string | null;
  sender_company: string | null;
  sender_phone: string | null;
  sender_email: string | null;
  sender_country_code: string;
  sender_region: string | null;
  sender_city: string | null;
  sender_address: string | null;
  sender_index: string | null;
  sender_mode: ApishipSenderMode;
  sender_point_id: number | null;
  default_weight_g: number;
  default_length_cm: number;
  default_width_cm: number;
  default_height_cm: number;
  webhook_registered: boolean;
};

export const emptyApishipCredentials = (): ApishipCredentials => ({
  token: "",
  sender_name: null,
  sender_company: null,
  sender_phone: null,
  sender_email: null,
  sender_country_code: "RU",
  sender_region: null,
  sender_city: null,
  sender_address: null,
  sender_index: null,
  sender_mode: "courier",
  sender_point_id: null,
  default_weight_g: APISHIP_DEFAULT_WEIGHT_G,
  default_length_cm: APISHIP_DEFAULT_SIZE_CM.length,
  default_width_cm: APISHIP_DEFAULT_SIZE_CM.width,
  default_height_cm: APISHIP_DEFAULT_SIZE_CM.height,
  webhook_token: null,
  webhook_uuids: {},
});

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const positive = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** A stored payload of any age, normalised to the current shape. */
export const normalizeApishipCredentials = (stored: Partial<ApishipCredentials> | null | undefined): ApishipCredentials => {
  const empty = emptyApishipCredentials();
  const uuids = (stored?.webhook_uuids ?? {}) as Record<string, unknown>;
  const pointId = Number(stored?.sender_point_id);
  return {
    token: typeof stored?.token === "string" ? stored.token : "",
    sender_name: str(stored?.sender_name),
    sender_company: str(stored?.sender_company),
    sender_phone: str(stored?.sender_phone),
    sender_email: str(stored?.sender_email),
    sender_country_code: (str(stored?.sender_country_code) ?? empty.sender_country_code).toUpperCase(),
    sender_region: str(stored?.sender_region),
    sender_city: str(stored?.sender_city),
    sender_address: str(stored?.sender_address),
    sender_index: str(stored?.sender_index),
    sender_mode: stored?.sender_mode === "point" ? "point" : "courier",
    sender_point_id: Number.isInteger(pointId) && pointId > 0 ? pointId : null,
    default_weight_g: Math.round(positive(stored?.default_weight_g, empty.default_weight_g)),
    default_length_cm: Math.round(positive(stored?.default_length_cm, empty.default_length_cm)),
    default_width_cm: Math.round(positive(stored?.default_width_cm, empty.default_width_cm)),
    default_height_cm: Math.round(positive(stored?.default_height_cm, empty.default_height_cm)),
    webhook_token: str(stored?.webhook_token),
    webhook_uuids: {
      ...(typeof uuids.ORDER_STATUS === "string" ? { ORDER_STATUS: uuids.ORDER_STATUS } : {}),
      ...(typeof uuids.ORDER_NUMBER_UPDATE === "string" ? { ORDER_NUMBER_UPDATE: uuids.ORDER_NUMBER_UPDATE } : {}),
    },
  };
};

/**
 * The shop's ApiShip row, decrypted, or `null`. `includeDisabled` is what the
 * panel reads with: a switched-off account is shown as switched off, never as
 * absent.
 */
export const readApishipSecret = async (
  pg: Knex,
  tenantId: string,
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedApishipSecret | null> => {
  const slot = await readTenantSecretSlot(pg, tenantId, "apiship", options);
  if (!slot) {
    return null;
  }
  return { ...slot, credentials: normalizeApishipCredentials(slot.credentials as Partial<ApishipCredentials>) };
};

/**
 * `readApishipSecret` for a PUBLIC path (the `/store/apiship/*` routes), the
 * same shape as `readCdekSecretPublic`: a row this deployment cannot decrypt
 * is logged once at `warn` with the tenant id and reads as «ApiShip not
 * connected» rather than a 500 to the buyer.
 */
export const readApishipSecretPublic = async (
  pg: Knex,
  tenantId: string,
  logger: { warn: (message: string) => void },
  options: { includeDisabled?: boolean } = {},
): Promise<ResolvedApishipSecret | null> => {
  try {
    return await readApishipSecret(pg, tenantId, options);
  } catch (error) {
    logger.warn(
      `ApiShip secret for tenant ${tenantId} could not be read; treating ApiShip as not connected on this public read (${
        error instanceof Error ? error.name : "unknown error"
      })`,
    );
    return null;
  }
};

/** What a response may carry: the state of the token, never the token. */
export const maskApishipSettings = (secret: ResolvedApishipSecret): MaskedApishipSettings => ({
  id: secret.id,
  is_enabled: secret.is_enabled,
  token: maskSecret(secret.credentials.token),
  sender_name: secret.credentials.sender_name,
  sender_company: secret.credentials.sender_company,
  sender_phone: secret.credentials.sender_phone,
  sender_email: secret.credentials.sender_email,
  sender_country_code: secret.credentials.sender_country_code,
  sender_region: secret.credentials.sender_region,
  sender_city: secret.credentials.sender_city,
  sender_address: secret.credentials.sender_address,
  sender_index: secret.credentials.sender_index,
  sender_mode: secret.credentials.sender_mode,
  sender_point_id: secret.credentials.sender_point_id,
  default_weight_g: secret.credentials.default_weight_g,
  default_length_cm: secret.credentials.default_length_cm,
  default_width_cm: secret.credentials.default_width_cm,
  default_height_cm: secret.credentials.default_height_cm,
  webhook_registered: Boolean(secret.credentials.webhook_uuids.ORDER_STATUS),
});

/** The pair the client takes; `null` while the token is missing. The base is the deployment's. */
export const apishipApiCredentials = (secret: ResolvedApishipSecret | null): ApishipApiCredentials | null => {
  if (!secret?.credentials.token) return null;
  return { token: secret.credentials.token, base: APISHIP_BASE_URL };
};

/** True when the sender fields an ApiShip order needs are all present. */
export const apishipSenderComplete = (credentials: ApishipCredentials): boolean =>
  Boolean(
    credentials.sender_name &&
      credentials.sender_phone &&
      credentials.sender_address &&
      credentials.sender_country_code &&
      (credentials.sender_mode === "courier" || credentials.sender_point_id),
  );
