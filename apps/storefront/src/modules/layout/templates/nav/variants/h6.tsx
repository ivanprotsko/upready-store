import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"

import { listTopCategoriesWithCounts } from "@lib/data/categories"
import { listRegions } from "@lib/data/regions"
import { getCountryCode, getSiteName, getSwitcherLocales } from "@lib/data/cookies"
import type { StoreRegion } from "@medusajs/types"
import { User } from "@medusajs/icons"
import CartButton from "@modules/layout/components/cart-button"
import ModeToggle from "@modules/layout/components/mode-toggle"
import RegionSelect from "@modules/layout/components/region-select"
import Search from "@modules/layout/components/search"
import BrandUnlock from "@modules/studio/components/brand-unlock"

/**
 * H6 · "Centre + category strip" (`2026-09-09-composition-contract.json` `header.h6`).
 * A free corridor point the composer authored directly, never isolated on its own lab
 * (`composition-contract.json` "not a lab cut; authored directly in composer
 * 2026-09-09, blocks.js:153-158"): search icon left, wordmark centred (H1's own
 * symmetry), account + cart right, then the same category chip strip H5 has below the
 * bar — composer source `blocks.js:155-158`, CSS `blocks.css:196-200`.
 *
 * The composer's left side is search icon + a static "US · EN" label
 * (`blocks.js:155`, a mockup placeholder, not live data); this port replaces the
 * placeholder with the real `RegionSelect` so the region/currency it names is the
 * one actually in effect, the same component H1/H2/H3/H4 already use — a fixed
 * string here would drift the moment a visitor picks another region.
 *
 * Category counts: `listTopCategoriesWithCounts()`, same loader H5 uses.
 *
 * Mobile (390px): the search icon (not wrapped in `.desk`) and the wordmark stay
 * visible; the chip strip stays visible too but left-aligns instead of centring
 * (`blocks.css:201`, `body[data-width=mobile] .header .h6 .cats { justify-content:
 * flex-start }`) — nothing here is truncated with an ellipsis.
 */
export default async function NavH6() {
  const t = await getTranslations()
  const [{ categories, totalCount }, regions, countryCode, siteName, locales] = await Promise.all([
    listTopCategoriesWithCounts(),
    listRegions().then((regions: StoreRegion[]) => regions),
    getCountryCode(),
    getSiteName(),
    getSwitcherLocales(),
  ])

  return (
    <div className="relative lg:sticky lg:top-0 inset-x-0 z-[60] group">
      <header className="relative h-[64px] border-b mx-auto duration-200 bg-ui-bg-base">
        <nav className="content-container txt-compact-xsmall text-ui-fg-subtle flex items-center gap-x-4 w-full h-full">
          <div className="flex-1 flex items-center gap-x-4 h-full">
            <Search className="text-ui-fg-subtle hover:text-ui-fg-base transition-colors" />
            <div className="hidden lg:flex min-w-0">
              <RegionSelect
                regions={regions}
                currentCountryCode={countryCode ?? undefined}
                locales={locales}
                className="min-w-0"
              />
            </div>
          </div>

          <BrandUnlock>
            <Link
              href="/"
              className="shrink-0 txt-compact-medium font-semibold text-ui-fg-subtle uppercase hover:text-ui-fg-base transition-colors"
              data-testid="nav-store-link"
            >
              {siteName}
            </Link>
          </BrandUnlock>

          <div className="flex-1 flex h-full items-center justify-end gap-x-4">
            <ModeToggle
              className="hidden lg:inline-flex text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
              data-testid="nav-mode-toggle"
            />
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

      {/* The strip travels with the sticky wrapper but sits outside <header>, which is
          the element carrying the background — without its own it rode transparent
          over the product grid (kerbstone, 2026-09-10). The band is full-width so the
          gutters beside content-container stay opaque on screens wider than it. */}
      <div
        className="border-b border-ui-border-base bg-ui-bg-base"
        data-testid="nav-category-band"
      >
        <div
          className="content-container flex items-center justify-center gap-2 overflow-x-auto py-2.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          data-testid="nav-category-strip"
        >
        <Link
          href="/store"
          className="shrink-0 txt-compact-small rounded-full border border-ui-fg-base bg-ui-fg-base px-3.5 py-1.5 text-ui-bg-base"
          data-testid="nav-category-chip-all"
        >
          {t("Store.allProducts")} {totalCount}
        </Link>
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/categories/${category.handle}`}
            className="shrink-0 flex items-center gap-1.5 txt-compact-small rounded-full border border-ui-border-base px-3.5 py-1.5 text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
            data-testid="nav-category-chip"
          >
            {category.name}
            <span className="text-ui-fg-muted">{category.count}</span>
          </Link>
        ))}
        </div>
      </div>
    </div>
  )
}
