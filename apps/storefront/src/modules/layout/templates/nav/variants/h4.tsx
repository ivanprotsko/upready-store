import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"

import { appLocales } from "@i18n/config"
import { listCategories } from "@lib/data/categories"
import { listRegions } from "@lib/data/regions"
import { hasPublishedArticles } from "@lib/data/tenant-articles"
import { getCountryCode, getSiteName } from "@lib/data/cookies"
import type { StoreRegion } from "@medusajs/types"
import { User } from "@medusajs/icons"
import CartButton from "@modules/layout/components/cart-button"
import ModeToggle from "@modules/layout/components/mode-toggle"
import RegionSelect from "@modules/layout/components/region-select"
import Search from "@modules/layout/components/search"
import BrandUnlock from "@modules/studio/components/brand-unlock"

const MAX_NAV_LINKS = 4

/**
 * H4 · "Accent" (`2026-09-09-composition-contract.json` `header.h4`). Same one-tier
 * shape as H2 (wordmark left, up to four category links plus "All products" centred,
 * full utility cluster right) but the bar itself is painted with the brand accent —
 * composer source `artifacts/docs/composer/lib/blocks.js:148`, CSS
 * `artifacts/docs/composer/lib/blocks.css:103-104`.
 *
 * The accent comes from the SAME bridge hero K already uses (`profile-hero/index.tsx`'s
 * own doc comment: "the primary CTA's ink follows the ACCENT, not the mode"):
 * `bg-ui-button-inverted` resolves to the preset's `--primary`, and repoints
 * `--contrast-fg-primary` to `--primary-foreground`, so every icon and link here reads
 * on any of the nine accents without a new opacity-on-var() class (`AGENTS.md`: a
 * Tailwind `/NN` opacity modifier on a `var()` colour silently drops the colour). The
 * composer's own `border-bottom: 0` on this variant becomes `border-transparent` —
 * `.hd`'s hairline would otherwise cut a line of the page's neutral border across the
 * accent band.
 *
 * `header: "h4"` is forbidden together with `hero: "k"` (`lib/theme/composition.ts`
 * `FORBIDDEN`, "two accent-filled bars back to back, nothing between") — enforced by
 * the settings validator, not by this component; H4 renders its own accent band
 * regardless of which hero follows it.
 *
 * Mobile (390px): same "utility cluster and nav row are desktop-only" idiom as H2 —
 * `BottomNav` carries browsing, search, account and mode-toggle on mobile, so only the
 * wordmark and cart count stay on the accent bar.
 */
export default async function NavH4() {
  const t = await getTranslations()
  const [categories, regions, countryCode, siteName, showJournal] = await Promise.all([
    listCategories(),
    listRegions().then((regions: StoreRegion[]) => regions),
    getCountryCode(),
    getSiteName(),
    hasPublishedArticles(),
  ])
  const topLevelLinks = categories
    .filter((category) => !category.parent_category_id)
    .slice(0, MAX_NAV_LINKS)

  return (
    <div className="relative lg:sticky lg:top-0 inset-x-0 z-[60] group">
      <header className="relative h-[64px] border-transparent mx-auto duration-200 bg-ui-button-inverted text-ui-contrast-fg-primary">
        <nav className="content-container txt-compact-xsmall flex items-center gap-x-4 w-full h-full">
          <div className="flex-1 flex items-center h-full">
            <BrandUnlock>
              <Link
                href="/"
                className="shrink-0 txt-compact-medium font-semibold uppercase hover:opacity-80 transition-opacity"
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
                className="hover:opacity-80 transition-opacity"
                data-testid="nav-category-link"
              >
                {category.name}
              </Link>
            ))}
            <Link
              href="/store"
              className="hover:opacity-80 transition-opacity"
              data-testid="nav-all-products-link"
            >
              {t("Store.allProducts")}
            </Link>
            {/* t10-blog: only once this shop has published an article. */}
            {showJournal ? (
              <Link
                href="/journal"
                className="hover:opacity-80 transition-opacity"
                data-testid="nav-journal-link"
              >
                {t("Journal.navLabel")}
              </Link>
            ) : null}
          </div>

          <div className="flex-1 flex h-full items-center justify-end gap-x-4">
            <ModeToggle
              className="hidden lg:inline-flex hover:opacity-80 transition-opacity"
              data-testid="nav-mode-toggle"
            />
            <Search className="hidden lg:inline-flex hover:opacity-80 transition-opacity" />
            <div className="hidden lg:flex min-w-0">
              <RegionSelect
                regions={regions}
                currentCountryCode={countryCode ?? undefined}
                locales={appLocales}
                className="min-w-0"
              />
            </div>
            <Link
              className="hidden lg:block hover:opacity-80 transition-opacity"
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
