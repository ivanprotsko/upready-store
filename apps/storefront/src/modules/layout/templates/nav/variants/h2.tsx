import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"

import { listCategories } from "@lib/data/categories"
import { User } from "@medusajs/icons"
import CartButton from "@modules/layout/components/cart-button"
import ModeToggle from "@modules/layout/components/mode-toggle"
import RegionSelect from "@modules/layout/components/region-select"
import Search from "@modules/layout/components/search"
import BrandUnlock from "@modules/studio/components/brand-unlock"
import { listRegions } from "@lib/data/regions"
import { hasPublishedArticles } from "@lib/data/tenant-articles"
import { getCountryCode, getSiteName, getSwitcherLocales } from "@lib/data/cookies"
import type { StoreRegion } from "@medusajs/types"

const MAX_NAV_LINKS = 4

/**
 * H2 · "Left, menu in a row" (`2026-09-09-composition-contract.json` `header.h2`).
 * Wordmark left, up to four top-level category links plus "All products" centred,
 * utilities right — no burger (`2026-09-09-block-port-map.md` §3 h2 row; composer
 * source `artifacts/docs/composer/lib/blocks.js:141`, CSS
 * `artifacts/docs/composer/lib/blocks.css:99`).
 *
 * Category count follows the composer's own hard slice at four
 * (`blocks.js:33` `navLinks(p, n = 4)`); a profile with more than four top-level
 * categories (electronics, womens-fashion, per the port map's own risk note) simply
 * does not show the rest here — "All products" is always the last link and reaches
 * every category via the store listing's own filters, so nothing is truncated with an
 * ellipsis, it is left off the row entirely.
 *
 * Mobile (390px): the composer hides the nav-link row and the search/region/account
 * icons (`.desk`/`.nav`, `blocks.css:36-37`), leaving only the wordmark and the cart
 * count — the same "utility cluster is desktop-only" idiom `NavH1` already uses,
 * because `BottomNav` (site-wide, `lg:hidden`) already carries category browsing,
 * search, account and mode-toggle on mobile.
 */
export default async function NavH2() {
  const t = await getTranslations()
  const [categories, regions, countryCode, siteName, locales, showJournal] = await Promise.all([
    listCategories(),
    listRegions().then((regions: StoreRegion[]) => regions),
    getCountryCode(),
    getSiteName(),
    getSwitcherLocales(),
    hasPublishedArticles(),
  ])
  const topLevelLinks = categories
    .filter((category) => !category.parent_category_id)
    .slice(0, MAX_NAV_LINKS)

  return (
    <div className="relative lg:sticky lg:top-0 inset-x-0 z-[60] group">
      <header className="relative h-[64px] border-b mx-auto duration-200 bg-ui-bg-base">
        <nav className="content-container txt-compact-xsmall text-ui-fg-subtle flex items-center gap-x-4 w-full h-full">
          <div className="flex-1 flex items-center h-full">
            <BrandUnlock>
              <Link
                href="/"
                className="shrink-0 txt-compact-medium font-semibold text-ui-fg-subtle uppercase hover:text-ui-fg-base transition-colors"
                data-testid="nav-store-link"
              >
                {siteName}
              </Link>
            </BrandUnlock>
          </div>

          <div className="hidden lg:flex items-center gap-x-6 txt-compact-small">
            {topLevelLinks.map((category) => (
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
            {/* t10-blog: only once this shop has published an article. */}
            {showJournal ? (
              <Link
                href="/journal"
                className="text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
                data-testid="nav-journal-link"
              >
                {t("Journal.navLabel")}
              </Link>
            ) : null}
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
