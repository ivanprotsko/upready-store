import type { PutTributeBody, TributeSettings } from "../hooks/api/tribute"

/**
 * The Tribute card's form logic (t-cherk-22), plain TS with no JSX so
 * `src/__tests__/tribute-settings.test.mjs` runs it for real.
 *
 * The check mirrors the backend's (`PUT /tenants/tribute` refuses to switch
 * Tribute on without a key), so the owner reads the reason next to the field
 * instead of after a round trip.
 */

export type TributeDraft = {
  enabled: boolean
  /** Typed by the owner; empty keeps the stored key. */
  api_key: string
}

export type TributeField = "api_key"

/** A shop that never saved a key starts switched on, the backend's own default for a new row. */
export const EMPTY_TRIBUTE_DRAFT: TributeDraft = { enabled: true, api_key: "" }

/** The form as the stored row fills it. The key always starts empty. */
export const tributeDraftFrom = (settings: TributeSettings | null | undefined): TributeDraft =>
  settings ? { enabled: settings.is_enabled, api_key: "" } : EMPTY_TRIBUTE_DRAFT

/** Field → translation key of what is wrong with it. Switching Tribute on needs a key, typed or stored. */
export const tributeDraftErrors = (
  draft: TributeDraft,
  settings: TributeSettings | null | undefined
): Partial<Record<TributeField, string>> => {
  const hasKey = Boolean(draft.api_key.trim()) || Boolean(settings?.api_key.set)
  return draft.enabled && !hasKey ? { api_key: "tribute.errors.required" } : {}
}

/** The PUT body: the key trimmed, and left out when empty so the stored one stays. */
export const tributePayload = (draft: TributeDraft): PutTributeBody => {
  const body: PutTributeBody = { is_enabled: draft.enabled }
  const apiKey = draft.api_key.trim()
  if (apiKey) {
    body.api_key = apiKey
  }
  return body
}
