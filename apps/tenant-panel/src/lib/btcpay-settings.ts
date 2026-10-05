import type { BtcpaySettings, PutBtcpayBody } from "../hooks/api/btcpay"

/**
 * The BTCPay card's form logic (ask-20261005-070255-438f), plain TS with no
 * JSX so `src/__tests__/btcpay-settings.test.mjs` runs it for real.
 *
 * The checks mirror the backend's (`normalizeBtcpayServerUrl` and
 * `PutTenantBtcpaySchema` in `apps/backend`), so the owner reads the reason
 * next to the field instead of after a round trip. The backend stays the
 * authority: it also refuses a loopback address in production, which the
 * panel cannot know about.
 */

export type BtcpayDraft = {
  enabled: boolean
  server_url: string
  store_id: string
  /** Typed by the owner; empty keeps the stored value. */
  api_key: string
  webhook_secret: string
}

export const BTCPAY_FIELDS = ["server_url", "store_id", "api_key", "webhook_secret"] as const
export type BtcpayField = (typeof BTCPAY_FIELDS)[number]

export const EMPTY_BTCPAY_DRAFT: BtcpayDraft = {
  enabled: false,
  server_url: "",
  store_id: "",
  api_key: "",
  webhook_secret: "",
}

/** The form as the stored row fills it. The two secrets always start empty. */
export const btcpayDraftFrom = (settings: BtcpaySettings | null | undefined): BtcpayDraft =>
  settings
    ? {
        enabled: settings.is_enabled,
        server_url: settings.server_url,
        store_id: settings.store_id,
        api_key: "",
        webhook_secret: "",
      }
    : EMPTY_BTCPAY_DRAFT

const LOOPBACK_HOST = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i

export const isValidBtcpayServerUrl = (raw: string): boolean => {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return false
  }
  if (url.username || url.password || url.search || url.hash) {
    return false
  }
  return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOST.test(url.hostname))
}

export const isValidBtcpayStoreId = (raw: string): boolean => /^[A-Za-z0-9_-]+$/.test(raw.trim())

/**
 * Field → translation key of what is wrong with it. A secret counts as
 * present when it is typed or already stored; switching BTCPay on needs all
 * four values.
 */
export const btcpayDraftErrors = (
  draft: BtcpayDraft,
  settings: BtcpaySettings | null | undefined
): Partial<Record<BtcpayField, string>> => {
  const errors: Partial<Record<BtcpayField, string>> = {}
  const serverUrl = draft.server_url.trim()
  const storeId = draft.store_id.trim()

  if (serverUrl && !isValidBtcpayServerUrl(serverUrl)) {
    errors.server_url = "btcpay.errors.serverUrl"
  }
  if (storeId && !isValidBtcpayStoreId(storeId)) {
    errors.store_id = "btcpay.errors.storeId"
  }
  if (draft.enabled) {
    const present: Record<BtcpayField, boolean> = {
      server_url: Boolean(serverUrl),
      store_id: Boolean(storeId),
      api_key: Boolean(draft.api_key.trim()) || Boolean(settings?.api_key.set),
      webhook_secret: Boolean(draft.webhook_secret.trim()) || Boolean(settings?.webhook_secret.set),
    }
    for (const field of BTCPAY_FIELDS) {
      if (!present[field] && !errors[field]) {
        errors[field] = "btcpay.errors.required"
      }
    }
  }
  return errors
}

/** The PUT body: trimmed, and an empty secret left out so the stored one stays. */
export const btcpayPayload = (draft: BtcpayDraft): PutBtcpayBody => {
  const body: PutBtcpayBody = { is_enabled: draft.enabled }
  for (const field of BTCPAY_FIELDS) {
    const value = draft[field].trim()
    if (value) {
      body[field] = value
    }
  }
  return body
}
