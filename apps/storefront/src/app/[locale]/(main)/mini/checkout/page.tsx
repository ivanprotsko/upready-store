import type { Metadata } from "next"
import { getLocale } from "next-intl/server"

import MiniCheckoutEntry from "@modules/telegram/components/mini-checkout-entry"

/**
 * Where «Оформить» in the shop's bot lands (`apps/backend/src/shop-bot/router.ts`).
 * The bot's button cannot point at `/checkout` itself, because that page reads
 * the cart of the webview's own cookie, which is not the cart the buyer filled
 * in the chat. Only the browser can prove who the buyer is, because Telegram's
 * launch data travels in the URL fragment and never reaches the server. So this
 * page renders a wait, `MiniAppBridge` switches the cart, and the checkout
 * opens after that (t-cherk-23).
 *
 * No data is read here, the same as the Mini App entry one level up.
 */
export const dynamic = "force-dynamic"

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function MiniCheckoutEntryPage() {
  const locale = await getLocale()
  return <MiniCheckoutEntry checkoutPath={`/${locale}/checkout`} />
}
