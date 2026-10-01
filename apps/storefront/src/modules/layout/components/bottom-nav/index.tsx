import { User } from "@medusajs/icons"
import { Link } from "@i18n/navigation"
import { getTranslations } from "next-intl/server"

import { listCategories } from "@lib/data/categories"
import { getCountryCode, getSiteName, getSwitcherLocales } from "@lib/data/cookies"
import { listRegions } from "@lib/data/regions"
import { getSiteBranding } from "@lib/data/tenant-branding"
import AccountLink from "@modules/layout/components/account-link"
import CategoryMenu from "@modules/layout/components/category-menu"
import Search from "@modules/layout/components/search"
import CartButton from "@modules/layout/components/cart-button"
import HydrationSlot from "@modules/common/components/hydration-slot"
import ModeToggle from "@modules/layout/components/mode-toggle"
import RegionSelect from "@modules/layout/components/region-select"
import SiteMark from "@modules/layout/components/site-mark"
import BrandUnlock from "@modules/studio/components/brand-unlock"

const BottomNav = async () => {
  const [categories, t, siteName, branding, regions, countryCode, locales] = await Promise.all([
    listCategories(),
    getTranslations("Nav"),
    getSiteName(),
    getSiteBranding(),
    listRegions(),
    getCountryCode(),
    getSwitcherLocales(),
  ])

  return (
    <nav className="lg:hidden fixed bottom-0 left-1 right-1 z-40 flex h-16 items-stretch rounded-t-3xl border-x border-t border-ui-border-base bg-ui-bg-base [&_svg]:size-5">
      {/* CategoryMenu's props take the row past Flight's 3200-byte limit, so the
          slots after it arrive as lazy rows: see HydrationSlot (46df U-06). */}
      <HydrationSlot>
        <div className="flex flex-1 items-center justify-center">
          <CategoryMenu
            categories={categories}
            className="text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
            // Below 1024px most headers hide language, country and theme (H1 and H5 keep
            // language and country in the bar), so on a phone they live here, in the one
            // menu every layout has.
            settings={
              <>
                <RegionSelect
                  regions={regions}
                  currentCountryCode={countryCode ?? undefined}
                  locales={locales}
                  className="min-w-0"
                />
                <ModeToggle
                  className="text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
                  data-testid="category-menu-mode-toggle"
                />
              </>
            }
          />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <Search className="text-ui-fg-subtle hover:text-ui-fg-base transition-colors" />
        </div>

        <div className="flex flex-1 items-center justify-center">
          <BrandUnlock>
            <Link
              href="/"
              aria-label={siteName}
              data-testid="bottom-nav-store-link"
              className="text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
            >
              <SiteMark siteName={siteName} branding={branding} />
            </Link>
          </BrandUnlock>
        </div>

        <div className="flex flex-1 items-center justify-center text-ui-fg-subtle hover:text-ui-fg-base transition-colors">
          <AccountLink aria-label={t("account")}>
            <User />
          </AccountLink>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <CartButton />
        </div>

        {/* 6th slot, appended last — the existing five keep their position
            (panel-composition-mockup.md §S12). */}
        <div className="flex flex-1 items-center justify-center">
          <ModeToggle
            className="text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
            data-testid="bottom-nav-mode-toggle"
          />
        </div>
      </HydrationSlot>
    </nav>
  )
}

export default BottomNav
