import type { CSSProperties } from "react"
import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"

import { getCountryCode, getSiteName, getSwitcherLocales } from "@lib/data/cookies"
import { listRegions } from "@lib/data/regions"
import { hasPublishedArticles } from "@lib/data/tenant-articles"
import { getSiteBranding } from "@lib/data/tenant-branding"
import { User } from "@medusajs/icons"
import CartButton from "@modules/layout/components/cart-button"
import RegionSelect from "@modules/layout/components/region-select"
import SideMenu from "@modules/layout/components/side-menu"
import SiteLogo from "@modules/layout/components/site-logo"
import BrandUnlock from "@modules/studio/components/brand-unlock"

import styles from "./h7.module.css"

/**
 * H7 · Olavka header (t-2026-09-24-n15, branch `redesign-olavka`), after Ivan's Figma
 * component set 227:9557 «Header», the three `Scrolled=false` variants (values from the
 * node dump `w15-cache-nodes2.json`; `Scrolled=true` is not built this round). Same
 * zero-prop server-component shape as H1-H6 (`nav/variants/index.ts`).
 *
 * Desktop (≥1024, 227:9200, 76px, three equal columns, padding 24):
 *   leading  · burger: 40px white disc outlined by the node's two drop shadows → `SideMenu`;
 *              flag + country name as plain text, the currency sign alone
 *              → `RegionSelect variant="text"` (the same dialog as every header).
 *   main     · wordmark, Ruslan Display 32px → `SiteLogo` (the tenant's short name or name).
 *   trailing · account icon, no fill → `/account`; «Корзина» → `CartButton variant="pill"`
 *              (white pill, the same shadow outline).
 * Tablet (640–1023, 235:16409, 57px) and mobile (<640, 235:16816, 53px): the wordmark
 * LEFT at 28px, then flag · currency sign · cart · burger as plain 40px / 36px icon
 * buttons, 1px apart (the node's dividers are at opacity 0), no fills, no rings.
 *
 * A long tenant name never truncates: the wordmark's size is capped by the column width
 * over the character count (`--wm-chars`, container units), so «Оксана Черкашина» steps
 * down while «Олавка» stays at the node's size.
 */
export default async function NavH7() {
  const t = await getTranslations()
  const [regions, countryCode, siteName, locales, showJournal, branding] = await Promise.all([
    listRegions(),
    getCountryCode(),
    getSiteName(),
    getSwitcherLocales(),
    hasPublishedArticles(),
    getSiteBranding(),
  ])
  const wordmarkStyle = {
    "--wm-chars": Array.from(branding.shop_name_short || siteName).length,
  } as CSSProperties

  return (
    <div className="relative lg:sticky lg:top-0 inset-x-0 z-[60] group" data-testid="nav-h7">
      <header className={styles.bar}>
        {/* Desktop: three equal columns. */}
        <nav className={`${styles.inner} ${styles.desktopOnly}`} data-testid="nav-h7-desktop">
          <div className={styles.leading}>
            <SideMenu
              siteName={siteName}
              showJournal={showJournal}
              buttonClassName={styles.disc}
            />
            <RegionSelect
              regions={regions}
              currentCountryCode={countryCode ?? undefined}
              locales={locales}
              variant="text"
            />
          </div>

          <div className={styles.main}>
            <BrandUnlock>
              <Link
                href="/"
                className={styles.wordmark}
                style={wordmarkStyle}
                data-testid="nav-store-link"
              >
                <SiteLogo siteName={siteName} branding={branding} />
              </Link>
            </BrandUnlock>
          </div>

          <div className={styles.trailing}>
            <Link
              href="/account"
              aria-label={t("Nav.account")}
              className={styles.iconButton}
              data-testid="nav-account-link"
            >
              <User className={styles.icon} />
            </Link>
            <CartButton variant="pill" />
          </div>
        </nav>

        {/* Tablet and mobile: wordmark left, four plain icon buttons right. */}
        <nav className={`${styles.compact} ${styles.mobileOnly}`} data-testid="nav-h7-compact">
          <div className={styles.compactMain}>
            <BrandUnlock>
              <Link
                href="/"
                className={styles.wordmark}
                style={wordmarkStyle}
                data-testid="nav-store-link-compact"
              >
                <SiteLogo siteName={siteName} branding={branding} />
              </Link>
            </BrandUnlock>
          </div>
          <div className={styles.compactGroup}>
            <RegionSelect
              regions={regions}
              currentCountryCode={countryCode ?? undefined}
              locales={locales}
              variant="icons"
            />
            <span className={styles.iconButton}>
              <CartButton />
            </span>
            <SideMenu
              siteName={siteName}
              showJournal={showJournal}
              buttonClassName={styles.iconButton}
            />
          </div>
        </nav>
      </header>
    </div>
  )
}
