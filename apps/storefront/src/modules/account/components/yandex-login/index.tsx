"use client"

/**
 * «Sign in with Yandex ID» — the entry point of the OAuth flow.
 *
 * Deliberately a LINK, not a button with a click handler: `/api/yandex-login`
 * is a GET that 302s to the Yandex consent screen, so the whole first leg works
 * with no client-side JavaScript. The buyer comes back to
 * `/api/yandex-callback`, which sets the session cookie and redirects here, or
 * here with `?yandex_error=<code>` when something went wrong, which is what the
 * message below renders.
 *
 * Rendering is gated on `NEXT_PUBLIC_YANDEX_LOGIN_ENABLED`, so the control stays
 * invisible until the Yandex application is configured on BOTH sides (this
 * variable and the backend's `YANDEX_CLIENT_ID`). A deployment without the keys
 * degrades to email and password with nothing broken on screen.
 */

import { usePathname, useSearchParams } from "next/navigation"
import { Button } from "@medusajs/ui"
import { useTranslations } from "next-intl"

import ErrorMessage from "@modules/checkout/components/error-message"
import YandexMark from "./yandex-mark"

export const YANDEX_LOGIN_ENABLED =
  process.env.NEXT_PUBLIC_YANDEX_LOGIN_ENABLED === "true"

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

const YandexLogin = () => {
  const t = useTranslations("Login")
  const pathname = usePathname() ?? "/"
  const searchParams = useSearchParams()

  if (!YANDEX_LOGIN_ENABLED) {
    return null
  }

  const errorCode = searchParams?.get("yandex_error")
  const errorKey = errorCode
    ? (ERROR_KEYS[errorCode] ?? "yandexErrorFailed")
    : null

  // Send the buyer back to the page they started from, query string included.
  // The handler re-validates it as a same-origin path before trusting it.
  const currentQuery = searchParams?.toString()
  const returnTo = currentQuery ? `${pathname}?${currentQuery}` : pathname
  const href = `/api/yandex-login?return=${encodeURIComponent(returnTo)}`

  return (
    <div className="w-full flex flex-col items-center" data-testid="yandex-login">
      <div className="w-full flex items-center gap-x-3 my-6">
        <span className="h-px flex-1 bg-ui-border-base" />
        <span className="text-small-regular text-ui-fg-subtle">
          {t("yandexDivider")}
        </span>
        <span className="h-px flex-1 bg-ui-border-base" />
      </div>
      <Button
        asChild
        variant="secondary"
        size="large"
        className="w-full"
        data-testid="yandex-login-cta"
      >
        <a href={href}>
          <YandexMark />
          {t("yandexCta")}
        </a>
      </Button>
      {errorKey && (
        <div className="mt-3 w-full">
          <ErrorMessage error={t(errorKey)} data-testid="yandex-login-error" />
        </div>
      )}
    </div>
  )
}

export default YandexLogin
