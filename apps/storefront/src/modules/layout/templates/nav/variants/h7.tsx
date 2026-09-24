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
 * component set 227:9557 «Header», variant `Property 1=initial` (the other variant,
 * `scrolled`, shrinks the wordmark to 24px inside a pill; Ivan's later states land here).
 * Same zero-prop server-component shape as H1-H6 (`nav/variants/index.ts`).
 *
 * Node → storefront, column by column (1216px content, 76px bar):
 *   leading  · burger (white disc with shadow) → `SideMenu`; country pill + currency pill
 *              → `RegionSelect variant="pills"` (the same dialog as every other header).
 *   main     · wordmark «Олавка», Ruslan Display 32px → `SiteLogo`, i.e. the tenant's
 *              short name or its name; the shop sets «Олавка» in the panel as
 *              `shop_name_short`, nothing is hard-coded here.
 *   trailing · heart disc — NOT built: the storefront has no wishlist to open, so a dead
 *              button was left out and reported; account disc → `/account`; cart pill
 *              → `CartButton variant="pill"`; chat disc (white, shadow) → `/contact`.
 *
 * Not on the node, so not in the bar: the search (it is the first chip of the Navigation
 * block on the home page) and the light/dark toggle (a phone reaches it from the bottom
 * nav; on desktop the studio panel still has it).
 *
 * Below 1024px (no mobile frame in the file — an adaptation, stated in the report): burger,
 * wordmark 24px, cart pill without its label; country/currency live in the bottom nav's
 * menu as on every other header.
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
        <nav className={styles.inner}>
          <div className={styles.leading}>
            <SideMenu
              siteName={siteName}
              showJournal={showJournal}
              buttonClassName={styles.disc}
            />
            <div className={`${styles.group} ${styles.desktopOnly}`}>
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
                className={`${styles.discMuted} ${styles.desktopOnly}`}
                data-testid="nav-account-link"
              >
                <User className={styles.icon} />
              </Link>
              <CartButton variant="pill" />
            </div>
            <Link
              href="/contact"
              aria-label={t("OlavkaHeader.contact")}
              className={`${styles.disc} ${styles.desktopOnly}`}
              data-testid="nav-contact-link"
            >
              <ChatBubble className={styles.icon} />
            </Link>
          </div>
        </nav>
      </header>
    </div>
  )
}
