import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { getLocale } from "next-intl/server"
import { getClientMessages } from "@lib/data/client-messages"
import { getSiteName, getTenantHandle } from "@lib/data/cookies"
import { buildSocialImageMetadata } from "@lib/tenant/social-card"
import HtmlDirSync from "@modules/common/components/html-dir-sync"
import JsonLd from "@modules/common/components/json-ld"
import { buildSiteJsonLd } from "@lib/util/json-ld"
import { CartQueueProvider } from "@lib/cart-store"
import { hasLocale } from "next-intl"
import { notFound } from "next/navigation"
import { routing } from "@i18n/routing"

/**
 * t-2026-10-08-13: a shop's `og:image:alt` and `twitter:image:alt` are its own
 * name. It is set HERE and not in the root layout on purpose. Next 15.5 adds
 * the entries of `app/opengraph-image.tsx` and `app/twitter-image.tsx`, with
 * their fixed `alt`, at the root segment and once more at the first segment
 * under it, which is this one; `images` given at a segment replace the file's
 * entry at that segment only (`mergeStaticMetadata`). Given in the root layout
 * they were overwritten here (measured on the built storefront). A host with
 * no shop gets no keys and keeps the file's own tags.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [handle, shopName] = await Promise.all([getTenantHandle(), getSiteName()])

  return buildSocialImageMetadata(handle ? shopName : null)
}

async function LocaleTree({
  children,
}: {
  children: React.ReactNode
}) {
  // t-2026-10-08-13, part A6: the browser gets the dictionary without the strings of what
  // this shop has switched off (`lib/util/client-messages.ts`). With no `messages` the
  // provider takes the whole catalogue, and all of it lands in the code of every page.
  const [locale, messages] = await Promise.all([getLocale(), getClientMessages()])

  return (
    <NextIntlClientProvider messages={messages}>
      <JsonLd data={await buildSiteJsonLd(locale)} />
      <HtmlDirSync />
      {/* The one client-side cart (t-2026-10-03-66), above (main) and (checkout) so a
          client-side move between them keeps what is still on its way to the server. */}
      <CartQueueProvider>{children}</CartQueueProvider>
    </NextIntlClientProvider>
  )
}

/**
 * t-2026-10-08-13, part A7: `middleware.ts` lets a path with a dot through as a
 * file, and one with no file behind it (`/humans.txt`, `/index.php`) lands here
 * with its own name in the place of the language. `getLocale()` then falls back
 * to a real language, so the home page answered 200 at an address that does not
 * exist. A value that is not a language is no page: the answer is 404.
 *
 * Kept apart from the tree above, which reads nothing from the address.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  if (!hasLocale(routing.locales, (await params).locale)) {
    notFound()
  }

  return <LocaleTree>{children}</LocaleTree>
}
