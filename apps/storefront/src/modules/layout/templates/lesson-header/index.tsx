import { getTranslations } from "next-intl/server"
import { User } from "@medusajs/icons"
import { Link } from "@i18n/navigation"
import { getSiteName } from "@lib/data/cookies"
import { getSiteBranding } from "@lib/data/tenant-branding"
import AccountLink from "@modules/layout/components/account-link"
import SiteLogo from "@modules/layout/components/site-logo"
import BrandUnlock from "@modules/studio/components/brand-unlock"

/**
 * The header of a lesson page (ask-20261005-055028-2ae9): the shop's logo,
 * a link to the home page, and the way into the account, nothing else. No
 * region and currency, no cart, no search: the lesson is read, not shopped
 * from. No fill and no rule under it either, the same bare container Ivan
 * asked of the phone header the same morning (ask 2f6e).
 */
export default async function LessonHeader() {
  const [t, siteName, branding] = await Promise.all([
    getTranslations("Nav"),
    getSiteName(),
    getSiteBranding(),
  ])

  return (
    <header className="content-container" data-testid="lesson-header">
      <nav className="flex h-16 items-center justify-between gap-x-4">
        <BrandUnlock>
          <Link
            href="/"
            className="txt-compact-medium-plus font-semibold uppercase text-ui-fg-base hover:text-ui-fg-subtle transition-colors"
            data-testid="lesson-store-link"
          >
            <SiteLogo siteName={siteName} branding={branding} />
          </Link>
        </BrandUnlock>
        <AccountLink
          className="inline-flex items-center gap-x-2 txt-compact-medium text-ui-fg-base hover:text-ui-fg-subtle transition-colors"
          data-testid="lesson-account-link"
        >
          <User />
          <span>{t("account")}</span>
        </AccountLink>
      </nav>
    </header>
  )
}
