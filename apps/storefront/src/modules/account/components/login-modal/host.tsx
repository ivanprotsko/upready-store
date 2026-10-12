import { getSiteName } from "@lib/data/cookies"
import { retrieveCustomer } from "@lib/data/customer"
import { getLegalLinkContext } from "@lib/data/legal-links"
import { getTelegramBot } from "@lib/data/telegram-bot"
import { getSiteLoginSettings } from "@lib/data/tenant-login-settings"
import { allowsEmailLogin, yandexLoginAvailable } from "@lib/tenant/login-settings"

import LoginModal from "."

/**
 * Renders the sign-in modal for a guest, and nothing for a customer: then no `AccountLink` finds
 * a modal to open and each stays the link to «Мой кабинет» it always was (t-2026-10-04-24).
 * Placed once by each route-group layout, `(main)` and `(checkout)`. The reads are the
 * cookie-keyed, cached ones `CartSidebarHost` already makes on the same request. Async, so the
 * layout keeps it behind a `Suspense`.
 *
 * `forCustomer` keeps the modal for a signed-in buyer as well: the checkout's «Вход в личный
 * кабинет» step opens it from «Изменить» to sign in with another account (t-2026-10-12-05,
 * Ivan 12.10 item 6.4). The checkout has no other `AccountLink` for a customer to catch.
 */
export default async function LoginModalHost({ forCustomer = false }: { forCustomer?: boolean } = {}) {
  const [customer, loginSettings, telegramBot, siteName, legal] = await Promise.all([
    retrieveCustomer().catch(() => null),
    getSiteLoginSettings(),
    getTelegramBot(),
    getSiteName(),
    getLegalLinkContext(),
  ])

  if (customer && !forCustomer) return null
  // A shop with no way in at all keeps the plain link: `/account` explains that on its own.
  const anyMethod =
    allowsEmailLogin(loginSettings.method) || yandexLoginAvailable(loginSettings) || telegramBot !== null
  if (!anyMethod) return null

  return (
    <LoginModal
      loginSettings={loginSettings}
      telegramBot={telegramBot}
      siteName={siteName}
      legal={legal}
      customerId={customer?.id ?? null}
    />
  )
}
