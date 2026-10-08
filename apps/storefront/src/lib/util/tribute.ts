import { getWebApp, isTelegramLaunch } from "@lib/telegram/web-app"
import { realEmailOrEmpty } from "@lib/util/telegram-contact"

/**
 * The storefront's half of the Tribute provider (t-cherk-22, part B), kept free
 * of JSX so vitest can import it (`pick-payment-method.ts` explains why that
 * matters here).
 *
 * The backend creates the order at Tribute when the payment method is chosen
 * and keeps two addresses of its payment page on the session
 * (`apps/backend/src/modules/payment-tribute/service.ts`): `payment_url`, a page
 * for a browser, and `webapp_payment_url`, a `t.me` link to Tribute's own Mini
 * App. The pay button sends the buyer to one of the two. Tribute sends them back
 * to `app/api/payment-return`, which proves nothing and only leads to the
 * waiting page. The order exists once Tribute's final `shop_order` webhook has
 * reached the backend (`apps/backend/src/api/tribute/webhook/[tenant]/route.ts`).
 */

export const TRIBUTE_PROVIDER_ID = "pp_tribute_tribute"

export const isTribute = (providerId?: string | null) =>
  Boolean(providerId?.startsWith("pp_tribute_"))

/**
 * Where Tribute sends the buyer back, after a payment and after a failure
 * alike. Built in the browser, because the shop's public origin is the one the
 * buyer is on, the way `robokassaReturnUrl` in `lib/constants.tsx` builds its own.
 */
export const tributeReturnUrl = (
  cartId: string,
  { origin, locale }: { origin: string; locale: string },
  outcome: "success" | "fail"
) => {
  const params = new URLSearchParams({ provider: "tribute", cart_id: cartId, outcome })
  if (locale) {
    params.set("locale", locale)
  }
  return `${origin}/api/payment-return?${params.toString()}`
}

/**
 * What the payment session is created with. The backend refuses a Tribute
 * session without both return addresses. The e-mail goes only when it is a real
 * one: a Telegram buyer's cart starts with the synthetic `tg_<id>@telegram.local`,
 * and Tribute would be handed an address no receipt can reach.
 */
export const tributeSessionData = (
  cart: { id: string; email?: string | null },
  place: { origin: string; locale: string }
) => {
  const email = realEmailOrEmpty(cart.email)
  return {
    success_url: tributeReturnUrl(cart.id, place, "success"),
    fail_url: tributeReturnUrl(cart.id, place, "fail"),
    ...(email ? { email } : {}),
  }
}

type SessionLike = {
  provider_id?: string | null
  data?: Record<string, unknown> | null
}

export const tributeSessionOf = (
  cart: { payment_collection?: { payment_sessions?: SessionLike[] | null } | null } | null | undefined
): SessionLike | null =>
  cart?.payment_collection?.payment_sessions?.find((session) =>
    isTribute(session.provider_id)
  ) ?? null

const httpsUrl = (value: unknown): URL | null => {
  if (typeof value !== "string") {
    return null
  }
  try {
    const url = new URL(value)
    return url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

export type TributePaymentTarget =
  | { via: "telegram"; url: string }
  | { via: "redirect"; url: string }

/**
 * Where the pay button sends the buyer, `null` when the session holds no
 * address it can use.
 *
 * `telegramLink` is true inside the Telegram Mini App whose client has the
 * bridge's `openTelegramLink`. There Telegram itself opens
 * `webapp_payment_url`, Tribute's own Mini App. The bridge accepts a `t.me` link
 * only, so any other address there, and every browser, takes `payment_url`:
 * a plain page that opens in a webview as well.
 */
export const tributePaymentTarget = (
  session: SessionLike | null,
  { telegramLink }: { telegramLink: boolean }
): TributePaymentTarget | null => {
  if (telegramLink) {
    const webapp = httpsUrl(session?.data?.webapp_payment_url)
    if (webapp && webapp.hostname === "t.me") {
      return { via: "telegram", url: webapp.toString() }
    }
  }
  const page = httpsUrl(session?.data?.payment_url)
  return page ? { via: "redirect", url: page.toString() } : null
}

/**
 * The bridge's `openTelegramLink` when this page runs inside the Telegram Mini
 * App (`isTelegramLaunch`, the check `MiniAppBridge` makes before it loads
 * telegram-web-app.js), else `null`. An older client without the method is a
 * Mini App with no bridge for a link: `null` too.
 */
export const telegramLinkOpener = (): ((url: string) => void) | null => {
  if (!isTelegramLaunch()) {
    return null
  }
  const webApp = getWebApp()
  const open = webApp?.openTelegramLink
  return typeof open === "function" ? (url) => open.call(webApp, url) : null
}

/**
 * What the pay button does with the session it read at the click: hands
 * Tribute's Mini App to Telegram, or sends the page to Tribute's browser page.
 * A link the bridge refuses falls back to the browser page. Answers how the
 * payment was opened, `null` when the session has no address to open.
 */
export const openTributePayment = (
  session: SessionLike | null,
  {
    openTelegramLink,
    assign,
  }: {
    openTelegramLink: ((url: string) => void) | null
    assign: (url: string) => void
  }
): TributePaymentTarget["via"] | null => {
  const target = tributePaymentTarget(session, { telegramLink: Boolean(openTelegramLink) })
  if (target?.via === "telegram" && openTelegramLink) {
    try {
      openTelegramLink(target.url)
      return "telegram"
    } catch {
      // `WebAppTgUrlInvalid`: the browser page below still opens.
    }
  }
  const page = tributePaymentTarget(session, { telegramLink: false })
  if (!page) {
    return null
  }
  assign(page.url)
  return "redirect"
}
