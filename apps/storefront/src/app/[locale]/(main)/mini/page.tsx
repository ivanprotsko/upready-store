import { redirect } from "next/navigation"
import { getLocale } from "next-intl/server"

import { entryTargetPath } from "@lib/telegram/entry-target"

/**
 * The Telegram Mini App entry: the bot's menu button and the main Mini App link
 * point at `<storefront>/mini`. The middleware prefixes the visitor's locale
 * and keeps the query, this page reads Telegram's `tgWebAppStartParam` and
 * redirects to the catalog, a product, a category or the cart. Nothing renders
 * here on purpose — a redirect paints nothing and needs no data, so the webview
 * never waits (chrxnasdmds measured the dev homepage at ~7 s cold and got
 * "Something went wrong, sorry" from Telegram).
 *
 * The launch data travels in the URL fragment (`#tgWebAppData=…`). A fragment
 * is never sent to the server, and a redirect whose Location carries no
 * fragment inherits the original one (RFC 9110 §10.2.2), so
 * telegram-web-app.js on the target page still finds it.
 */
export const dynamic = "force-dynamic"

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function MiniAppEntryPage(props: Props) {
  const [searchParams, locale] = await Promise.all([props.searchParams, getLocale()])
  const raw = searchParams.tgWebAppStartParam
  const startParam = Array.isArray(raw) ? raw[0] : raw
  redirect(`/${locale}${entryTargetPath(startParam)}`)
}
