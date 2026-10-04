/**
 * Robokassa's iframe script (docs.robokassa.ru/ru/iframe), loaded once per page
 * and only on a checkout that pays through Robokassa (t-2026-10-04-49).
 *
 * What the script does, read from its own source on 2026-10-04: `Render(params,
 * elementId, callbacks)` posts `params` as a hidden form into an iframe it
 * appends to `<body>` (fixed, full screen, transparent, `z-index` at the top),
 * against `https://auth.robokassa.ru/merchant/v1/iframe`. It reports back
 * through `postMessage` from `auth.robokassa.ru` only, and `callbacks.onComplete`
 * receives `status` `success`, `fail` or `close` (`paymentStarted` with the
 * last); an action `redirect` sets `window.location.href` itself.
 * `StartPayment` would overwrite `Settings` with `{ Mode: "modal" }` alone, so
 * the checkout calls `Render` to keep `PaymentMethods`.
 */

export const ROBOKASSA_IFRAME_SCRIPT =
  "https://auth.robokassa.ru/Merchant/bundle/robokassa_iframe.js"

export type RobokassaCompletion = {
  status: "success" | "fail" | "close"
  paymentStarted?: boolean
  [key: string]: unknown
}

export type RobokassaIframe = {
  Render: (
    params: Record<string, string>,
    elementId: string | null,
    callbacks?: { onComplete?: (result: RobokassaCompletion) => void }
  ) => void
  ClosePaymentForm: () => void
}

declare global {
  interface Window {
    Robokassa?: RobokassaIframe
  }
}

let loading: Promise<RobokassaIframe> | null = null

/**
 * Resolves with `window.Robokassa` once the script has run. A failed or
 * timed-out load rejects and forgets itself, so the next click tries again;
 * the payment button sends the buyer to the full-page payment instead.
 */
export function loadRobokassaIframe(timeoutMs = 10_000): Promise<RobokassaIframe> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Robokassa's iframe needs a browser"))
  }
  if (window.Robokassa) {
    return Promise.resolve(window.Robokassa)
  }
  if (loading) {
    return loading
  }

  loading = new Promise<RobokassaIframe>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${ROBOKASSA_IFRAME_SCRIPT}"]`
    )
    const script = existing ?? document.createElement("script")
    const timer = window.setTimeout(
      () => fail(new Error("Robokassa's iframe script timed out")),
      timeoutMs
    )

    function done() {
      window.clearTimeout(timer)
      if (window.Robokassa) {
        resolve(window.Robokassa)
      } else {
        fail(new Error("Robokassa's iframe script loaded without window.Robokassa"))
      }
    }

    function fail(error: Error) {
      window.clearTimeout(timer)
      script.removeEventListener("load", done)
      // A script that never ran is removed, so the retry adds a fresh one.
      if (!window.Robokassa) {
        script.remove()
      }
      loading = null
      reject(error)
    }

    script.addEventListener("load", done)
    script.addEventListener("error", () =>
      fail(new Error("Robokassa's iframe script failed to load"))
    )
    if (!existing) {
      script.src = ROBOKASSA_IFRAME_SCRIPT
      script.async = true
      document.head.appendChild(script)
    }
  })

  return loading
}
