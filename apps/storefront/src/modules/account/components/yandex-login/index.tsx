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
 * Rendering is gated on `available` (o25-login-methods), which the caller
 * computes from the shop's OWN sign-in setting AND whether this deployment
 * has Yandex ID keys at all (`yandexLoginAvailable` in `@lib/tenant/login-settings`,
 * read from the server through `getSiteLoginSettings` — rule 19g, this
 * component is client and must never read `next/headers` itself). A shop that
 * chose «По email и паролю» degrades to email and password with nothing
 * broken on screen, the same as a deployment with no Yandex keys at all.
 */

import { usePathname, useSearchParams } from "next/navigation"
import { Button } from "@medusajs/ui"
import { useTranslations } from "next-intl"

import YandexMark from "./yandex-mark"

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

const YandexLogin = ({ available }: { available: boolean }) => {
  const t = useTranslations("Login")
  const pathname = usePathname() ?? "/"
  const searchParams = useSearchParams()

  if (!available) {
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
        /*
         * Rendered here rather than through `@modules/checkout/components/error-message`,
         * which is for RAW backend strings: it runs whatever it is given through
         * `useErrorMessage`, which looks the text up in the `Errors` catalog and
         * falls back to «something went wrong» for anything it does not
         * recognise. Measured on the stand 2026-09-16: all seven codes rendered
         * that one generic sentence instead of their own. These messages are
         * already translated, so they go straight to the screen, in the styling
         * that component uses.
         */
        <div
          className="pt-3 w-full text-center text-rose-500 text-small-regular"
          data-testid="yandex-login-error"
        >
          <span>{t(errorKey)}</span>
        </div>
      )}
    </div>
  )
}

export default YandexLogin
