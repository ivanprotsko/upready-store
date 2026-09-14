import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"

import { listRegions } from "@lib/data/regions"
import { getCountryCode, getSiteName, getSwitcherLocales } from "@lib/data/cookies"
import type { StoreRegion } from "@medusajs/types"
import { User } from "@medusajs/icons"
import CartButton from "@modules/layout/components/cart-button"
import ModeToggle from "@modules/layout/components/mode-toggle"
import RegionSelect from "@modules/layout/components/region-select"
import Search from "@modules/layout/components/search"
import SideMenu from "@modules/layout/components/side-menu"
import BrandUnlock from "@modules/studio/components/brand-unlock"

/**
 * H1 · "Как сейчас" — the storefront's original Nav markup, unchanged, moved here from
 * `nav/index.tsx` when that file became a composition switch
 * (`2026-09-09-block-port-map.md` §3, `2026-09-09-panel-composition-mockup.md` §9). This is
 * the baseline every other header key falls back to until its own variant ships
 * (`nav/variants/index.ts`).
 */
export default async function NavH1() {
  const t = await getTranslations()
  const [regions, countryCode, siteName, locales] = await Promise.all([
    listRegions().then((regions: StoreRegion[]) => regions),
    getCountryCode(),
    getSiteName(),
    getSwitcherLocales(),
  ])

  return (
    <div className="relative lg:sticky lg:top-0 inset-x-0 z-[60] group">
      <header className="relative h-[64px] border-b mx-auto duration-200 bg-ui-bg-base">
        <nav className="content-container txt-compact-xsmall text-ui-fg-subtle flex items-center gap-x-4 md:justify-between w-full h-full">
          <div className="flex flex-1 items-center h-full">
            <SideMenu siteName={siteName} />
          </div>

          {/* A two-second press opens the hidden settings panel's password dialog;
              a normal click stays a link to "/". The wrapper generates no box. */}
          <BrandUnlock>
            <Link
              href="/"
              className="hidden lg:block shrink-0 txt-compact-medium font-semibold text-ui-fg-subtle uppercase hover:text-ui-fg-base transition-colors"
              data-testid="nav-store-link"
            >
              {siteName}
            </Link>
          </BrandUnlock>

          <div className="ms-auto flex h-full flex-1 items-center justify-end gap-x-4 lg:ms-0">
            {/* First in the cluster, before Search — panel-composition-mockup.md §S11.
                `lg:` only: a mobile visitor gets the same control from the bottom-nav's
                6th slot instead. */}
            <ModeToggle
              className="hidden lg:inline-flex text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
              data-testid="nav-mode-toggle"
            />
            <Search className="hidden lg:inline-flex text-ui-fg-subtle hover:text-ui-fg-base transition-colors" />
            <div className="flex min-w-0">
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
            <div className="hidden h-full items-center lg:flex">
              <CartButton />
            </div>
          </div>
        </nav>
      </header>
    </div>
  )
}
