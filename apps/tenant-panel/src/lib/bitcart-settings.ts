import type { BitcartSettings, PutBitcartBody } from "../hooks/api/bitcart"
import { isValidBtcpayServerUrl, isValidBtcpayStoreId } from "./btcpay-settings.ts"

/**
 * The Bitcart card's form logic (ask-20261005-070255-438f, stage 2), plain TS
 * with no JSX so `src/__tests__/bitcart-settings.test.mjs` runs it for real.
 *
 * The checks mirror the backend's (`normalizeBitcartUrl` and
 * `PutTenantBitcartSchema` in `apps/backend`), which are BTCPay's rules for
 * both addresses, so the BTCPay card's validators serve here too. The backend
 * stays the authority: it also refuses a loopback or private address in
 * production, which the panel cannot know about.
 */

export type BitcartDraft = {
  enabled: boolean
  server_url: string
  admin_url: string
  store_id: string
  /** Typed by the owner; empty keeps the stored value. */
  api_key: string
}

export const BITCART_FIELDS = ["server_url", "admin_url", "store_id", "api_key"] as const
export type BitcartField = (typeof BITCART_FIELDS)[number]

export const EMPTY_BITCART_DRAFT: BitcartDraft = {
  enabled: false,
  server_url: "",
  admin_url: "",
  store_id: "",
  api_key: "",
}

/** The form as the stored row fills it. The token always starts empty. */
export const bitcartDraftFrom = (settings: BitcartSettings | null | undefined): BitcartDraft =>
  settings
    ? {
        enabled: settings.is_enabled,
        server_url: settings.server_url,
        admin_url: settings.admin_url,
        store_id: settings.store_id,
        api_key: "",
      }
    : EMPTY_BITCART_DRAFT

/**
 * Field → translation key of what is wrong with it. The token counts as
 * present when it is typed or already stored; switching Bitcart on needs all
 * four values.
 */
export const bitcartDraftErrors = (
  draft: BitcartDraft,
  settings: BitcartSettings | null | undefined
): Partial<Record<BitcartField, string>> => {
  const errors: Partial<Record<BitcartField, string>> = {}
  const serverUrl = draft.server_url.trim()
  const adminUrl = draft.admin_url.trim()
  const storeId = draft.store_id.trim()

  if (serverUrl && !isValidBtcpayServerUrl(serverUrl)) {
    errors.server_url = "bitcart.errors.url"
  }
  if (adminUrl && !isValidBtcpayServerUrl(adminUrl)) {
    errors.admin_url = "bitcart.errors.url"
  }
  if (storeId && !isValidBtcpayStoreId(storeId)) {
    errors.store_id = "bitcart.errors.storeId"
  }
  if (draft.enabled) {
    const present: Record<BitcartField, boolean> = {
      server_url: Boolean(serverUrl),
      admin_url: Boolean(adminUrl),
      store_id: Boolean(storeId),
      api_key: Boolean(draft.api_key.trim()) || Boolean(settings?.api_key.set),
    }
    for (const field of BITCART_FIELDS) {
      if (!present[field] && !errors[field]) {
        errors[field] = "bitcart.errors.required"
      }
    }
  }
  return errors
}

/** The PUT body: trimmed, and an empty token left out so the stored one stays. */
export const bitcartPayload = (draft: BitcartDraft): PutBitcartBody => {
  const body: PutBitcartBody = { is_enabled: draft.enabled }
  for (const field of BITCART_FIELDS) {
    const value = draft[field].trim()
    if (value) {
      body[field] = value
    }
  }
  return body
}
