import { Link } from "@i18n/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { listCategories } from "@lib/data/categories"
import { listCollections } from "@lib/data/collections"
import { listTenantPages } from "@lib/data/tenant-pages"
import { shopPromoText } from "@lib/data/shop-copy"
import { getSiteName } from "@lib/data/cookies"

import PoweredBy from "@modules/layout/components/powered-by"

/**
 * F3 · "Гигантский wordmark" — a link row (categories + collections) and a promo-clause
 * row above the wordmark set full-width in giant display type, legal row below.
 * `block-port-map.md` §7 f3 row; composer source `composer/lib/blocks.js` `footerF3`,
 * `composer/lib/blocks.css:125-127,148`.
 *
 * The auto-shrink from 190px (desktop) to 44px (390px) is a CSS `clamp()`, not the
 * composer's client-side `getComputedStyle`/`scrollWidth` measurement
 * (`composer/lib/page.js:73-82`, `afterRender`) — a font-size that reacts to viewport
 * width alone needs no JS pass after web-font load, so this component stays a server
 * component with no `"use client"`. `overflow-hidden`/`whitespace-nowrap` on the
 * wordmark itself is the same safety net the composer keeps for a wordmark longer than
 * its clause table anticipated, so a viewport the clamp under-shrinks for still never
 * breaks the layout (Ivan's own acceptance: "the wordmark never overflows at 390").
 */
export default async function FooterF3() {
  const [t, locale, siteName] = await Promise.all([
    getTranslations("Footer"),
    getLocale(),
    getSiteName(),
  ])
  const productCategories = await listCategories()
  const topLevelCategories = productCategories.filter(
    (category) => !category.parent_category_id
  )
  const { collections } = await listCollections()
  // tenant-panel wave 2, piece 7: the shop owner's own published content
  // pages, in the same link row as the categories and collections.
  const tenantPages = await listTenantPages()
  const clauses = (await shopPromoText(locale))?.split(" · ") ?? []

  return (
    <footer className="border-t border-ui-border-base w-full bg-ui-bg-base">
      <div className="content-container flex flex-col w-full pt-10 pb-6 lg:pt-14">
        <div className="flex flex-col gap-y-3 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-8">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {topLevelCategories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/categories/${category.handle}`}
                  className="txt-compact-medium text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
                >
                  {category.name}
                </Link>
              </li>
            ))}
            {collections.map((collection) => (
              <li key={collection.id}>
                <Link
                  href={`/collections/${collection.handle}`}
                  className="txt-compact-medium text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
                >
                  {collection.title}
                </Link>
              </li>
            ))}
            {tenantPages.map((page) => (
              <li key={page.key}>
                <Link
                  href={`/pages/${page.key}`}
                  className="txt-compact-medium text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
                >
                  {page.title}
                </Link>
              </li>
            ))}
          </ul>
          {clauses.length > 0 && (
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-ui-fg-muted">
              {clauses.map((clause) => (
                <li key={clause} className="txt-compact-medium">
                  {clause}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Link
          href="/"
          aria-label={siteName}
          className="block w-full uppercase font-semibold leading-[0.95] tracking-tight text-ui-fg-base hover:text-ui-fg-subtle transition-colors overflow-hidden whitespace-nowrap my-3"
          style={{ fontSize: "clamp(44px, 13vw, 190px)" }}
        >
          {siteName}
        </Link>

        <div className="flex w-full mt-2.5 pt-4 justify-between items-center border-t border-ui-border-base text-ui-fg-muted">
          <span className="txt-medium">
            {t("copyright", {
              year: new Date().getFullYear(),
              siteName: siteName,
            })}
          </span>
          <PoweredBy className="hidden lg:flex" />
        </div>
      </div>
    </footer>
  )
}
