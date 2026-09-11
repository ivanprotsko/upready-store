import { getLocale, getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"

import { appLocales } from "@i18n/config"
import { listCategories } from "@lib/data/categories"
import { listRegions } from "@lib/data/regions"
import { profile, promoText } from "@lib/profile"
import { getCountryCode, getSiteName } from "@lib/data/cookies"
import type { StoreRegion } from "@medusajs/types"
import CartButton from "@modules/layout/components/cart-button"
import ModeToggle from "@modules/layout/components/mode-toggle"
import RegionSelect from "@modules/layout/components/region-select"
import Search from "@modules/layout/components/search"
import BrandUnlock from "@modules/studio/components/brand-unlock"

const MAX_NAV_LINKS = 4

/**
 * H3 · "Two tiers" (`2026-09-09-composition-contract.json` `header.h3`). A service
 * tier (the profile's own promo text, plus region and account) sits above the main
 * tier (wordmark left, category links centred, search + cart right) — composer
 * source `artifacts/docs/composer/lib/blocks.js:143-145`, CSS
 * `artifacts/docs/composer/lib/blocks.css:100-102`.
 *
 * The service tier's own promo text duplicates the site-wide `PromoBanner` rendered
 * one element above `Nav` in `(main)/layout.tsx`, so `PromoBanner` (this same
 * package's file) suppresses itself whenever `storefrontSettings.header === "h3"`
 * (`2026-09-09-block-port-map.md` §3 h3 row: "shipping H3 as-is doubles the promo
 * strip unless PromoBanner is suppressed").
 *
 * Region and account move from the utility cluster into the service tier here
 * (composer's `utilities(p, { region: false, user: false })` on the main tier,
 * `blocks.js:145`); the main tier keeps only `ModeToggle` + `Search` + cart, matching
 * H1's ordering.
 *
 * Mobile (390px): composer's own rule hides the service tier's right half and the
 * main tier's nav/utility icons (`blocks.css:110`, `body[data-width=mobile]
 * .header .h3 .utilrow .r { display:none }`), leaving the promo text alone above a
 * bar with just the wordmark and cart count — `BottomNav` covers region, account,
 * search and mode toggle on mobile.
 */
export default async function NavH3() {
  const [t, locale, categories, regions, countryCode, siteName] = await Promise.all([
    getTranslations(),
    getLocale(),
    listCategories(),
    listRegions().then((regions: StoreRegion[]) => regions),
    getCountryCode(),
    getSiteName(),
  ])
  const topLevelLinks = categories
    .filter((category) => !category.parent_category_id)
    .slice(0, MAX_NAV_LINKS)
  const serviceMessage = promoText(locale) ?? profile.brand?.tagline

  return (
    <div className="relative lg:sticky lg:top-0 inset-x-0 z-[60] group">
      {serviceMessage ? (
        <div className="bg-ui-bg-subtle border-b border-ui-border-base text-ui-fg-subtle txt-compact-xsmall">
          <div className="content-container flex items-center justify-between h-[34px] gap-4">
            <span className="truncate" data-testid="nav-service-message">
              {serviceMessage}
            </span>
            <div className="hidden lg:flex items-center gap-x-4">
              <RegionSelect
                regions={regions}
                currentCountryCode={countryCode ?? undefined}
                locales={appLocales}
                className="min-w-0"
              />
              <Link
                href="/account"
                className="hover:text-ui-fg-base transition-colors"
                data-testid="nav-account-link"
              >
                {t("Nav.account")}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
      <header className="relative h-[68px] border-b mx-auto duration-200 bg-ui-bg-base">
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
          </div>

          <div className="flex-1 flex h-full items-center justify-end gap-x-4">
            <ModeToggle
              className="hidden lg:inline-flex text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
              data-testid="nav-mode-toggle"
            />
            <Search className="hidden lg:inline-flex text-ui-fg-subtle hover:text-ui-fg-base transition-colors" />
            <div className="flex h-full items-center">
              <CartButton />
            </div>
          </div>
        </nav>
      </header>
    </div>
  )
}
