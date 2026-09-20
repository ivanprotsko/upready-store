import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { maskSecret, type MaskedSecret } from "./crypto";
import { readTenantSecretSlot, type TenantSecretSlot } from "./slot";

/**
 * ApiShip token of ONE shop — the plaintext shape of
 * `tenant_integration_secret.payload` for `provider = "apiship"`
 * (p01-settings-integrations-restructure).
 *
 * ONE field. ApiShip authenticates with a bare `Authorization: <token>` header
 * and nothing else (measured, `src/apiship/client.ts`), so there is no account
 * name, no pair and no test/live split in the payload: the dev contour
 * `api.dev.apiship.ru` issues its OWN token, and a shop that needs it points
 * `APISHIP_BASE_URL` at it rather than storing a second value here.
 *
 * The slot exists so the owner can store the token from her own panel. Nothing
 * in the checkout reads it: i02 measured the ApiShip calculator answering zero
 * tariffs for this account, so shipping is quoted against CDEK directly, and
 * the ApiShip page says so in plain words rather than implying a carrier the
 * buyer will never see (rule 17a).
 */
export type ApishipCredentials = {
  token: string;
};

export type ResolvedApishipSecret = Omit<TenantSecretSlot, "credentials"> & {
  credentials: ApishipCredentials;
};

export type MaskedApishipSettings = {
  id: string;
  is_enabled: boolean;
  token: MaskedSecret;
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
  const credentials = slot.credentials as Partial<ApishipCredentials>;
  return { ...slot, credentials: { token: typeof credentials.token === "string" ? credentials.token : "" } };
};

/** What a response may carry: the state of the token, never the token. */
export const maskApishipSettings = (secret: ResolvedApishipSecret): MaskedApishipSettings => ({
  id: secret.id,
  is_enabled: secret.is_enabled,
  token: maskSecret(secret.credentials.token),
});
