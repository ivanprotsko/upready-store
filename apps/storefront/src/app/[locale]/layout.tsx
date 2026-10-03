import { NextIntlClientProvider } from "next-intl"
import { getLocale } from "next-intl/server"
import HtmlDirSync from "@modules/common/components/html-dir-sync"
import JsonLd from "@modules/common/components/json-ld"
import { buildSiteJsonLd } from "@lib/util/json-ld"
import { CartQueueProvider } from "@lib/cart-store"

export default async function LocaleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()

  return (
    <NextIntlClientProvider>
      <JsonLd data={await buildSiteJsonLd(locale)} />
      <HtmlDirSync />
      {/* The one client-side cart (t-2026-10-03-66), above (main) and (checkout) so a
          client-side move between them keeps what is still on its way to the server. */}
      <CartQueueProvider>{children}</CartQueueProvider>
    </NextIntlClientProvider>
  )
}
