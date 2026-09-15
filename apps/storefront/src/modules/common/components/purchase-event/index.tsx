"use client"

import { sendGAEvent } from "@next/third-parties/google"
import { useEffect } from "react"
import { readConsent } from "@modules/common/components/analytics-consent/consent"

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

export type PurchaseEventProps = {
  orderId: string
  total: number
  currencyCode: string
  ga4MeasurementId: string | null
  yandexCounterId: number | null
}

const sentKey = (orderId: string) => `medusa_purchase_sent_${orderId}`
const POLL_INTERVAL_MS = 200
const POLL_TIMEOUT_MS = 5000

/**
 * Waits for a predicate to turn true (the vendor script has attached its
 * global), polling rather than assuming it is already there: both counters
 * defer their own script load until idle or a first interaction
 * (`use-idle-after-consent.ts`), and a customer landing here fresh from
 * checkout may not have triggered either yet. Gives up silently past the
 * timeout — a purchase event that never fires is a loss the owner can live
 * with; a page that hangs waiting for it is not.
 */
const waitFor = (predicate: () => boolean, onReady: () => void) => {
  if (predicate()) {
    onReady()
    return
  }

  const start = Date.now()
  const interval = window.setInterval(() => {
    if (predicate()) {
      window.clearInterval(interval)
      onReady()
    } else if (Date.now() - start > POLL_TIMEOUT_MS) {
      window.clearInterval(interval)
    }
  }, POLL_INTERVAL_MS)
}

/**
 * The e-commerce purchase event (t17-analytics step 4), fired once per order
 * from the confirmation page, to whichever counters this tenant configured.
 *
 * Wrapped so it can never break the page a customer sees right after paying
 * (the mission's own constraint): every vendor call is inside a `try`, and a
 * thrown error here is swallowed, not rendered. `sessionStorage` dedupes a
 * reload of `/order/:id/confirmed` so a refresh does not double-count a sale.
 */
const PurchaseEvent = ({
  orderId,
  total,
  currencyCode,
  ga4MeasurementId,
  yandexCounterId,
}: PurchaseEventProps) => {
  useEffect(() => {
    if (readConsent() !== "granted") {
      return
    }

    if (window.sessionStorage.getItem(sentKey(orderId))) {
      return
    }

    const currency = currencyCode.toUpperCase()
    let firedGa4 = !ga4MeasurementId
    let firedYandex = !yandexCounterId

    const markSentWhenBothDone = () => {
      if (firedGa4 && firedYandex) {
        window.sessionStorage.setItem(sentKey(orderId), "1")
      }
    }

    if (ga4MeasurementId) {
      waitFor(
        () => typeof window.gtag === "function",
        () => {
          try {
            sendGAEvent("event", "purchase", {
              transaction_id: orderId,
              value: total,
              currency,
            })
          } catch (error) {
            console.error("PurchaseEvent: GA4 call failed; the order page is unaffected", error)
          } finally {
            firedGa4 = true
            markSentWhenBothDone()
          }
        }
      )
    }

    if (yandexCounterId) {
      waitFor(
        () => typeof window.ym === "function",
        () => {
          try {
            window.ym?.(yandexCounterId, "reachGoal", "purchase", {
              order_id: orderId,
              value: total,
              currency,
            })
          } catch (error) {
            console.error("PurchaseEvent: Metrica call failed; the order page is unaffected", error)
          } finally {
            firedYandex = true
            markSentWhenBothDone()
          }
        }
      )
    }
  }, [orderId, total, currencyCode, ga4MeasurementId, yandexCounterId])

  return null
}

export default PurchaseEvent
