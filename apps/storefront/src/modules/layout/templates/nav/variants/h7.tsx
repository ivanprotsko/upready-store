import type { CSSProperties } from "react"
import { getTranslations } from "next-intl/server"
import { Link } from "@i18n/navigation"

import { getCountryCode, getSiteName, getSwitcherLocales } from "@lib/data/cookies"
import { isOlavkaShop } from "@lib/data/olavka-shop"
import { listShopRegions } from "@lib/data/regions"
import { hasPublishedArticles } from "@lib/data/tenant-articles"
import { getSiteBranding } from "@lib/data/tenant-branding"
import { User } from "@medusajs/icons"
import AccountLink from "@modules/layout/components/account-link"
import CartButton from "@modules/layout/components/cart-button"
import RegionSelect from "@modules/layout/components/region-select"
import ScrollFlag from "@modules/layout/components/scroll-flag"
import Search from "@modules/layout/components/search"
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
 *   leading  · burger: 40px white disc outlined by the node's two drop shadows → `SideMenu`
 *              (the Olavka shop: the light/dark switch at its bottom, Ivan's remark 20);
 *              flag + country name as plain text, the currency sign alone
 *              → `RegionSelect variant="text"` (the same dialog as every header).
 *   main     · wordmark, Ruslan Display 32px → `SiteLogo` (the tenant's short name or name).
 *   trailing · search icon → the Cmd+K palette; account icon → `/account`, both with no
 *              fill; «Корзина» → `CartButton variant="pill"` (white pill, the same shadow
 *              outline).
 * Tablet (640–1023, 235:16409, 57px) and mobile (<640, 235:16816, 53px): the wordmark
 * LEFT at 28px, then flag · currency sign · cart · burger as plain 40px / 36px icon
 * buttons, 1px apart (the node's dividers are at opacity 0), no fills, no rings.
 *
 * `Scrolled=true` (227:9549 / 235:16802 / 238:16965): past 12px of scroll `ScrollFlag`
 * sets `data-scrolled="true"` and the same DOM changes skin — country + currency join in
 * one white pill with a 1×12 divider, the wordmark sits in a #f5f5f5 pill at 24px, the
 * account icon gets the white shadowed disc; on tablet/mobile the four icons join in one
 * white pill with dividers. The bar keeps its height (the node's tablet 57 → 56 is not
 * followed: no jump while scrolling). 200ms transitions.
 *
 * A long tenant name never truncates: the wordmark's size is capped by the column width
 * over the character count (`--wm-chars`, container units), so «Оксана Черкашина» steps
 * down while «Олавка» stays at the node's size.
 */
export default async function NavH7() {
  const t = await getTranslations()
  const [regions, countryCode, siteName, locales, showJournal, branding, olavka] =
    await Promise.all([
      listShopRegions(),
      getCountryCode(),
      getSiteName(),
      getSwitcherLocales(),
      hasPublishedArticles(),
      getSiteBranding(),
      isOlavkaShop(),
    ])
  const wordmarkStyle = {
    "--wm-chars": Array.from(branding.shop_name_short || siteName).length,
  } as CSSProperties

  return (
    <div
      id="nav-h7"
      className={`${styles.root} sticky top-0 inset-x-0 z-[60] group`}
      data-testid="nav-h7"
      data-scrolled="false"
    >
      <ScrollFlag targetId="nav-h7" />
      <header className={styles.bar}>
        {/* Desktop: three equal columns. */}
        <nav className={`${styles.inner} ${styles.desktopOnly}`} data-testid="nav-h7-desktop">
          <div className={styles.leading}>
            <SideMenu
              siteName={siteName}
              showJournal={showJournal}
              buttonClassName={styles.disc}
              modeToggle={olavka}
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
                <span className={styles.wordmarkText}>
                  <SiteLogo siteName={siteName} branding={branding} />
                </span>
              </Link>
            </BrandUnlock>
          </div>

          <div className={styles.trailing}>
            {/* Search left of the account icon, the same plain button, opening the palette
                Cmd+K opens (Ivan 04.10: «слева от контрола входа в личный кабинет добавим
                контрол с поиском»). */}
            <Search className={styles.iconButton} />
            {/* A guest's click opens the sign-in modal over the page (t-2026-10-04-24). */}
            <AccountLink
              aria-label={t("Nav.account")}
              className={styles.iconButton}
              data-testid="nav-account-link"
            >
              <User className={styles.icon} />
            </AccountLink>
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
                <span className={styles.wordmarkText}>
                  <SiteLogo siteName={siteName} branding={branding} />
                </span>
              </Link>
            </BrandUnlock>
          </div>
          <div className={styles.compactGroup}>
            {/* `Scrolled=true`: this row becomes one white pill with 1×12 dividers. */}
            <div className={styles.compactPill}>
              <RegionSelect
                regions={regions}
                currentCountryCode={countryCode ?? undefined}
                locales={locales}
                variant="icons"
              />
              <span aria-hidden className={styles.divider} />
              <span className={styles.iconButton}>
                <CartButton />
              </span>
              <span aria-hidden className={styles.divider} />
              <SideMenu
                siteName={siteName}
                showJournal={showJournal}
                buttonClassName={styles.iconButton}
                modeToggle={olavka}
              />
            </div>
          </div>
        </nav>
      </header>
    </div>
  )
}
