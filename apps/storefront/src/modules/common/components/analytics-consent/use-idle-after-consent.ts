"use client"

import { useEffect, useState } from "react"
import { useAnalyticsConsent } from "./use-analytics-consent"

const IDLE_TIMEOUT = 3000

const WAKE_EVENTS = [
  "pointerdown",
  "keydown",
  "touchstart",
  "wheel",
  "scroll",
] as const

/**
 * `true` once the visitor has granted analytics consent AND either gone idle
 * or interacted with the page — the load-deferral strategy both counters
 * share, so a shop with neither counter costs this storefront nothing on
 * first paint, and a shop with one costs nothing before consent either
 * (t17-analytics step 2/3).
 */
export const useIdleAfterConsent = (): boolean => {
  const [shouldLoad, setShouldLoad] = useState(false)
  const consent = useAnalyticsConsent()

  useEffect(() => {
    if (consent !== "granted") {
      return
    }

    let idleHandle: number | undefined
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined

    const stopWaiting = () => {
      if (idleHandle !== undefined) {
        window.cancelIdleCallback(idleHandle)
        idleHandle = undefined
      }

      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle)
        timeoutHandle = undefined
      }

      for (const event of WAKE_EVENTS) {
        window.removeEventListener(event, load)
      }
    }

    const load = () => {
      stopWaiting()
      setShouldLoad(true)
    }

    for (const event of WAKE_EVENTS) {
      window.addEventListener(event, load, { once: true, passive: true })
    }

    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(load, { timeout: IDLE_TIMEOUT })
    } else {
      timeoutHandle = setTimeout(load, IDLE_TIMEOUT)
    }

    return stopWaiting
  }, [consent])

  return shouldLoad
}
