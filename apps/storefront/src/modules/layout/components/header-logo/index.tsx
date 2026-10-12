import type { CSSProperties } from "react"
import { clx } from "@medusajs/ui"

import { Link } from "@i18n/navigation"
import { getSiteName } from "@lib/data/cookies"
import { isOlavkaShop } from "@lib/data/olavka-shop"
import { getSiteBranding } from "@lib/data/tenant-branding"
import SiteLogo from "@modules/layout/components/site-logo"
import h7 from "@modules/layout/templates/nav/variants/h7.module.css"
import BrandUnlock from "@modules/studio/components/brand-unlock"

import styles from "./header-logo.module.css"

/**
 * The shop's logo the way its main header draws it, for a header of its own: the checkout's
 * (t-2026-10-12-05, Ivan 12.10 item 1.1: «сделать логотип как на основном сайте»). A link home
 * at every width, in its own centred column.
 *
 * An Olavka shop (cherkashino.ru) has the H7 header, whose logo is the Ruslan Display wordmark:
 * the same `.wordmark` box from `h7.module.css`, 32 px from 1024 px and 28 px below, as in H7's
 * two bars. Every other shop's H1–H5 draw `SiteLogo` in the link below, with the same classes.
 * Either way an uploaded logo image shows instead of the name (`SiteLogo`).
 */
export default async function HeaderLogo({ testId }: { testId: string }) {
  const [siteName, branding, olavka] = await Promise.all([
    getSiteName(),
    getSiteBranding(),
    isOlavkaShop(),
  ])

  if (olavka) {
    const wordmarkStyle = {
      "--wm-chars": Array.from(branding.shop_name_short || siteName).length,
    } as CSSProperties

    return (
      <div className={styles.slot}>
        <BrandUnlock>
          <Link
            href="/"
            className={clx(h7.wordmark, styles.wordmark)}
            style={wordmarkStyle}
            data-testid={testId}
          >
            <span className={h7.wordmarkText}>
              <SiteLogo siteName={siteName} branding={branding} />
            </span>
          </Link>
        </BrandUnlock>
      </div>
    )
  }

  return (
    <div className={styles.slot}>
      <BrandUnlock>
        <Link
          href="/"
          className="shrink-0 txt-compact-medium font-semibold text-ui-fg-subtle uppercase hover:text-ui-fg-base transition-colors"
          data-testid={testId}
        >
          <SiteLogo siteName={siteName} branding={branding} />
        </Link>
      </BrandUnlock>
    </div>
  )
}
