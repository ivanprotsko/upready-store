import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"

import { listCategories } from "@lib/data/categories"
import { getCountryCode, getSiteName, getSwitcherLocales } from "@lib/data/cookies"
import { listRegions } from "@lib/data/regions"
import { hasPublishedArticles } from "@lib/data/tenant-articles"
import { getSiteBranding } from "@lib/data/tenant-branding"
import { User } from "@medusajs/icons"
import CartButton from "@modules/layout/components/cart-button"
import ModeToggle from "@modules/layout/components/mode-toggle"
import RegionSelect from "@modules/layout/components/region-select"
import Search from "@modules/layout/components/search"
import SideMenu from "@modules/layout/components/side-menu"
import SiteLogo from "@modules/layout/components/site-logo"
import BrandUnlock from "@modules/studio/components/brand-unlock"

/**
 * H7 · Olavka redesign header (t-2026-09-24-n15, branch `redesign-olavka`), after Ivan's
 * Figma node `227-8180` of file `2zPDDEfMdYM1tbv5xKfnLX`. Same zero-prop server-component
 * shape as H1-H6 (`nav/variants/index.ts`), same building blocks (logo, category links from
 * the tenant's own categories, search, mode toggle, locale + currency, account, cart) —
 * the Figma node decides layout, sizes and states.
 *
 * GROUNDWORK STATE: the mockup was not readable when this file was written (Figma login
 * wall in the browser pane, REST token invalid), so the markup below is the wiring plus a
 * neutral layout, to be reshaped line by line against the node once it is visible.
 */
export default async function NavH7() {
  const t = await getTranslations()
  const [categories, regions, countryCode, siteName, locales, showJournal, branding] =
    await Promise.all([
      listCategories({ fields: "id,name,handle,parent_category_id,rank" }),
      listRegions(),
      getCountryCode(),
      getSiteName(),
      getSwitcherLocales(),
      hasPublishedArticles(),
      getSiteBranding(),
    ])
  const topLevel = categories.filter((category) => !category.parent_category_id)

  return (
    <div className="relative lg:sticky lg:top-0 inset-x-0 z-[60] group" data-testid="nav-h7">
      <header className="relative h-[64px] border-b mx-auto duration-200 bg-ui-bg-base">
        <nav className="content-container txt-compact-xsmall text-ui-fg-subtle flex items-center gap-x-4 w-full h-full">
          <div className="flex items-center h-full lg:hidden">
            <SideMenu siteName={siteName} showJournal={showJournal} />
          </div>

          <div className="flex-1 flex items-center h-full">
            <BrandUnlock>
              <Link
                href="/"
                className="shrink-0 txt-compact-medium font-semibold text-ui-fg-base uppercase hover:text-ui-fg-subtle transition-colors"
                data-testid="nav-store-link"
              >
                <SiteLogo siteName={siteName} branding={branding} />
              </Link>
            </BrandUnlock>
          </div>

          <div className="hidden lg:flex items-center gap-x-6 txt-compact-small">
            {topLevel.slice(0, 5).map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.handle}`}
                className="text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
                data-testid="nav-category-link"
              >
                {category.name}
              </Link>
            ))}
            <Link
              href="/store"
              className="text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
              data-testid="nav-all-products-link"
            >
              {t("Store.allProducts")}
            </Link>
          </div>

          <div className="flex-1 flex h-full items-center justify-end gap-x-4">
            <ModeToggle
              className="hidden lg:inline-flex text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
              data-testid="nav-mode-toggle"
            />
            <Search className="hidden lg:inline-flex text-ui-fg-subtle hover:text-ui-fg-base transition-colors" />
            <div className="hidden lg:flex min-w-0">
              <RegionSelect
                regions={regions}
                currentCountryCode={countryCode ?? undefined}
                locales={locales}
                className="min-w-0"
              />
            </div>
            <Link
              className="hidden lg:block hover:text-ui-fg-base"
              href="/account"
              aria-label={t("Nav.account")}
              data-testid="nav-account-link"
            >
              <User />
            </Link>
            <div className="flex h-full items-center">
              <CartButton />
            </div>
          </div>
        </nav>
      </header>
    </div>
  )
}
