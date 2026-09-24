import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"

import { getCountryCode, getSiteName, getSwitcherLocales } from "@lib/data/cookies"
import { listRegions } from "@lib/data/regions"
import { hasPublishedArticles } from "@lib/data/tenant-articles"
import { getSiteBranding } from "@lib/data/tenant-branding"
import { ChatBubble, User } from "@medusajs/icons"
import CartButton from "@modules/layout/components/cart-button"
import RegionSelect from "@modules/layout/components/region-select"
import SideMenu from "@modules/layout/components/side-menu"
import SiteLogo from "@modules/layout/components/site-logo"
import BrandUnlock from "@modules/studio/components/brand-unlock"

import styles from "./h7.module.css"

/**
 * H7 · Olavka header (t-2026-09-24-n15, branch `redesign-olavka`), after Ivan's Figma
 * component set 227:9557 «Header», the three `Scrolled=false` device variants (the three
 * `Scrolled=true` ones — pills grouped, wordmark in a pill — are Ivan's later states and
 * are not built). Same zero-prop server-component shape as H1-H6 (`nav/variants/index.ts`).
 *
 * Desktop (≥1024, 1216px content, 76px bar), column by column:
 *   leading  · burger (white disc with shadow) → `SideMenu`; country pill + currency pill
 *              → `RegionSelect variant="pills"` (the same dialog as every other header).
 *   main     · wordmark «Олавка», Ruslan Display 32px → `SiteLogo`, i.e. the tenant's
 *              short name or its name; the shop sets «Олавка» in the panel as
 *              `shop_name_short`, nothing is hard-coded here.
 *   trailing · account disc → `/account`; cart pill → `CartButton variant="pill"`; chat
 *              disc (white, shadow) → `/contact`. The node's heart disc is NOT built
 *              (Ivan 3.1: «не делаем … сердечка»).
 *
 * Tablet (640–1023, 56px bar) and mobile (<640, 52px bar), `Device=tablet|mobile`: the
 * wordmark LEFT (Ruslan Display 28px), then a trailing group flag disc · currency disc
 * → `RegionSelect variant="discs"` · cart icon → `CartButton` · burger disc → `SideMenu`,
 * separated by 1×12 dividers; no account icon, no country name (the node has none).
 * Discs are 40px on tablet and 36px on mobile. The breakpoints are the storefront's own
 * (`small` = 1024, Tailwind `sm` = 640); the file draws 720 and 360.
 *
 * Not on the node, so not in the bar: the search and the light/dark toggle (a phone
 * reaches it from the bottom nav; on desktop the studio panel still has it).
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
            <div className={styles.group}>
              <RegionSelect
                regions={regions}
                currentCountryCode={countryCode ?? undefined}
                locales={locales}
                variant="pills"
              />
            </div>
          </div>

          <div className={styles.main}>
            <BrandUnlock>
              <Link href="/" className={styles.wordmark} data-testid="nav-store-link">
                <SiteLogo siteName={siteName} branding={branding} />
              </Link>
            </BrandUnlock>
          </div>

          <div className={styles.trailing}>
            <div className={styles.group}>
              <Link
                href="/account"
                aria-label={t("Nav.account")}
                className={styles.discMuted}
                data-testid="nav-account-link"
              >
                <User className={styles.icon} />
              </Link>
              <CartButton variant="pill" />
            </div>
            <Link
              href="/contact"
              aria-label={t("OlavkaHeader.contact")}
              className={styles.disc}
              data-testid="nav-contact-link"
            >
              <ChatBubble className={styles.icon} />
            </Link>
          </div>
        </nav>

        {/* Tablet and mobile: wordmark left, trailing group right. */}
        <nav className={`${styles.compact} ${styles.mobileOnly}`} data-testid="nav-h7-compact">
          <BrandUnlock>
            <Link href="/" className={styles.wordmark} data-testid="nav-store-link-compact">
              <SiteLogo siteName={siteName} branding={branding} />
            </Link>
          </BrandUnlock>
          <div className={styles.compactGroup}>
            <RegionSelect
              regions={regions}
              currentCountryCode={countryCode ?? undefined}
              locales={locales}
              variant="discs"
            />
            <span aria-hidden className={styles.divider} />
            <span className={styles.cartIcon}>
              <CartButton />
            </span>
            <span aria-hidden className={styles.divider} />
            <SideMenu
              siteName={siteName}
              showJournal={showJournal}
              buttonClassName={styles.discSmall}
            />
          </div>
        </nav>
      </header>
    </div>
  )
}
