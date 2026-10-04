import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { NOINDEX } from "@lib/util/robots"
import LessonHeader from "@modules/layout/templates/lesson-header"

export const metadata: Metadata = {
  robots: NOINDEX,
}

/**
 * The lesson page's own frame (ask-20261005-055028-2ae9, Ivan 05.10: «на
 * странице урока нужно убрать футер, регион и валюту, корзину, поиск»). The
 * lesson lives in its own route group so none of the shop around it is
 * rendered at all: not the header variant with its region, currency, cart and
 * search, not the footer, not the bottom navigation, not the cart sidebar or
 * the search palette. What stays is the logo back to the home page and the way
 * into the account (`LessonHeader`); the lesson itself carries its contents,
 * previous and next links. Every other page of the shop and of the account
 * keeps `(main)/layout.tsx` and is unchanged.
 */
export default async function LessonLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Nav")

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:border focus:border-ui-border-base focus:bg-ui-bg-base focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ui-fg-base"
      >
        {t("skipToContent")}
      </a>
      <LessonHeader />
      <main id="main-content" className="content-container pb-16 pt-4 small:pt-8">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </main>
    </>
  )
}
