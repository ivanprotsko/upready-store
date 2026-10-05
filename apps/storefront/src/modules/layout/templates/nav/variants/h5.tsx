import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"

import { listTopCategoriesWithCounts } from "@lib/data/categories"
import { getCountryCode, getSiteName, getSwitcherLocales } from "@lib/data/cookies"
import { listShopRegions } from "@lib/data/regions"
import { getSiteBranding } from "@lib/data/tenant-branding"
import { hasPublishedArticles } from "@lib/data/tenant-articles"
import CartButton from "@modules/layout/components/cart-button"
import HydrationSlot from "@modules/common/components/hydration-slot"
import ModeToggle from "@modules/layout/components/mode-toggle"
import RegionSelect from "@modules/layout/components/region-select"
import Search from "@modules/layout/components/search"
import SiteLogo from "@modules/layout/components/site-logo"
import BrandUnlock from "@modules/studio/components/brand-unlock"

/**
 * H5 · "Slim + category strip" (`2026-09-09-composition-contract.json` `header.h5`).
 * A 52px bar (wordmark, search, cart only) plus a horizontally scrolling chip row —
 * "All {total}" then each top-level category with its own product count — composer
 * source `blocks.js:151-152`, CSS `blocks.css:105-110`.
 *
 * Account is absent from this variant's own utility cluster, matching the composer's
 * `utilities(p, { region: false, user: false })` call; it stays reachable from
 * `BottomNav` (site-wide) and from every account/checkout page's own header. Language
 * and country are NOT left out, although the composer leaves out region too: H5 is
 * what the seeded shops carry, and without them a Russian visitor had no control to
 * leave dollars with (t-2026-09-12-seeded-hosts-no-locale-controls). They sit in the
 * bar at every width, as in H1, the header a regular tenant storefront gets; the
 * wordmark gives way to them on a phone, cut with an ellipsis.
 *
 * Category counts: `listTopCategoriesWithCounts()` (`lib/data/categories.ts`) — see
 * that loader's own doc comment for how the count is measured cheaply, live-verified
 * against `http://localhost:9023`.
 *
 * Mobile (390px): the chip row stays visible and scrollable (composer only shrinks
 * its padding, `blocks.css:111`, `body[data-width=mobile] .header .h5 .cats { padding:
 * 8px 16px }`) — it is not truncated with an ellipsis, it scrolls.
 */
export default async function NavH5() {
  const [t, { categories, totalCount }, siteName, showJournal, branding, regions, countryCode, locales] =
    await Promise.all([
      getTranslations(),
      listTopCategoriesWithCounts(),
      getSiteName(),
      hasPublishedArticles(),
      getSiteBranding(),
      listShopRegions(),
      getCountryCode(),
      getSwitcherLocales(),
    ])

  return (
    <div className="relative lg:sticky lg:top-0 inset-x-0 z-[60] group">
      <header className="relative h-[52px] border-b mx-auto duration-200 bg-ui-bg-base">
        <nav className="content-container txt-compact-xsmall text-ui-fg-subtle flex items-center gap-x-4 w-full h-full">
          <div className="flex-1 min-w-0 flex items-center h-full">
            <BrandUnlock>
              <Link
                href="/"
                className="min-w-0 truncate txt-compact-medium font-semibold text-ui-fg-subtle uppercase hover:text-ui-fg-base transition-colors"
                data-testid="nav-store-link"
              >
                <SiteLogo siteName={siteName} branding={branding} />
              </Link>
            </BrandUnlock>
          </div>

          <div className="flex-1 flex h-full items-center justify-end gap-x-4">
            {/* RegionSelect carries every region with its countries, far past Flight's
                3200-byte row limit, so what follows it arrives as lazy rows: one slot
                around the whole cluster, see HydrationSlot (46df U-06). */}
            <HydrationSlot>
              <ModeToggle
                className="hidden lg:inline-flex text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
                data-testid="nav-mode-toggle"
              />
              <Search className="hidden lg:inline-flex text-ui-fg-subtle hover:text-ui-fg-base transition-colors" />
              {/* Country and language at every width, as in H1: on a phone too, not only
                  behind the bottom bar's menu (t-2026-09-12-seeded-hosts-no-locale-controls). */}
              <div className="flex min-w-0">
                <RegionSelect
                  regions={regions}
                  currentCountryCode={countryCode ?? undefined}
                  locales={locales}
                  className="min-w-0"
                />
              </div>
              <div className="flex h-full items-center">
                <CartButton />
              </div>
            </HydrationSlot>
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
          className="content-container flex items-center gap-2 overflow-x-auto py-2.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          data-testid="nav-category-strip"
        >
        <Link
          href="/store"
          className="shrink-0 txt-compact-small rounded-full border border-ui-fg-base bg-ui-fg-base px-3.5 py-1.5 text-ui-bg-base"
          data-testid="nav-category-chip-all"
        >
          {t("Nav.allWithCount", { count: totalCount })}
        </Link>
        {/* t10-blog: only once this shop has published an article. */}
        {showJournal ? (
          <Link
            href="/journal"
            className="shrink-0 txt-compact-small rounded-full border border-ui-border-base px-3.5 py-1.5 text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
            data-testid="nav-journal-link"
          >
            {t("Journal.navLabel")}
          </Link>
        ) : null}
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
