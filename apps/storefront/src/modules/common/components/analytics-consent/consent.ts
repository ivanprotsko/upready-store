"use client"

/**
 * Analytics consent (t17-analytics step 3): this storefront had no consent
 * gate at all before this task (measured — `README.md` documented it as a
 * known gap: "There is no consent gate. The tag loads for everyone once the
 * ID is set."). This is the state, stored per browser in `localStorage` so it
 * survives a reload without a cookie round trip to the server.
 *
 * "unknown" (nobody has answered yet) is its own state, not a silent "denied"
 * — the banner renders only for it, and neither analytics script mounts
 * before it turns into "granted" (rule 19h: a third state must not collapse
 * into a boolean).
 */

export type ConsentState = "unknown" | "granted" | "denied"

const STORAGE_KEY = "medusa_analytics_consent"
const CHANGE_EVENT = "medusa-analytics-consent-change"

export const readConsent = (): ConsentState => {
  if (typeof window === "undefined") {
    return "unknown"
  }

  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === "granted" || value === "denied" ? value : "unknown"
  } catch {
    // Private browsing / storage disabled: treat every visit as "unknown" and
    // keep asking, rather than silently granting analytics nobody agreed to.
    return "unknown"
  }
}

export const writeConsent = (value: "granted" | "denied"): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Nothing to persist; the in-memory state this tab already has still
    // drives this page load, it just will not survive a reload.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export const CONSENT_CHANGE_EVENT = CHANGE_EVENT
export const CONSENT_STORAGE_KEY = STORAGE_KEY
