"use client"

/**
 * What went wrong on the way back from Yandex ID, when something did.
 *
 * The sign-in itself is `YandexIdButton` (Yandex's constructor button) in `SignInMethods`, a plain LINK to
 * `/api/yandex-login?return=<the page the buyer is on>`: a GET that 302s to the Yandex consent
 * screen, so the whole first leg works with no client-side JavaScript. The buyer comes back to
 * `/api/yandex-callback`, which sets the session cookie and redirects to that same page, or to
 * it with `?yandex_error=<code>` when something went wrong, which is what this renders. The
 * sign-in modal opens itself on such an address (`LoginModal`), so the message shows over the
 * page the buyer started from, not only on `/account`.
 *
 * Gated on `available` (o25-login-methods), which the caller computes from the shop's OWN
 * sign-in setting AND whether this deployment has Yandex ID keys at all (`yandexLoginAvailable`
 * in `@lib/tenant/login-settings`, read from the server through `getSiteLoginSettings`, rule
 * 19g: this component is client and must never read `next/headers` itself).
 */

import { clx } from "@medusajs/ui"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"

/** `?yandex_error=<code>` to message key. An unknown code falls back to the generic one. */
const ERROR_KEYS: Record<string, string> = {
  unconfigured: "yandexErrorUnconfigured",
  denied: "yandexErrorDenied",
  rejected: "yandexErrorRejected",
  expired: "yandexErrorExpired",
  email_taken: "yandexErrorEmailTaken",
  no_email: "yandexErrorNoEmail",
  failed: "yandexErrorFailed",
}

/** The message key for this address's `?yandex_error`, or null when there is none. */
export function yandexErrorKey(code: string | null | undefined): string | null {
  if (!code) return null
  return ERROR_KEYS[code] ?? "yandexErrorFailed"
}

const YandexLoginError = ({ available, alignStart = false }: { available: boolean; alignStart?: boolean }) => {
  const t = useTranslations("Login")
  const searchParams = useSearchParams()

  if (!available) {
    return null
  }

  const errorKey = yandexErrorKey(searchParams?.get("yandex_error"))
  if (!errorKey) {
    return null
  }

  /*
   * Rendered here rather than through `@modules/checkout/components/error-message`, which is
   * for RAW backend strings: it runs whatever it is given through `useErrorMessage`, which looks
   * the text up in the `Errors` catalog and falls back to «something went wrong» for anything it
   * does not recognise. Measured on the stand 2026-09-16: all seven codes rendered that one
   * generic sentence instead of their own. These messages are already translated, so they go
   * straight to the screen, in the styling that component uses.
   */
  return (
    <div
      className={clx("w-full text-ui-fg-error text-small-regular", alignStart ? "text-start" : "text-center")}
      data-testid="yandex-login-error"
    >
      <span>{t(errorKey)}</span>
    </div>
  )
}

export default YandexLoginError
