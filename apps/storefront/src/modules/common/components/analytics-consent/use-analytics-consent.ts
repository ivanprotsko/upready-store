"use client"

import { useEffect, useState } from "react"
import { CONSENT_CHANGE_EVENT, readConsent, type ConsentState } from "./consent"

/** Re-renders whenever this tab's or another tab's consent choice changes. */
export const useAnalyticsConsent = (): ConsentState => {
  const [state, setState] = useState<ConsentState>("unknown")

  useEffect(() => {
    setState(readConsent())

    const onChange = () => setState(readConsent())
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange)
    window.addEventListener("storage", onChange)

    return () => {
      window.removeEventListener(CONSENT_CHANGE_EVENT, onChange)
      window.removeEventListener("storage", onChange)
    }
  }, [])

  return state
}
