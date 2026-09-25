import { Link } from "@i18n/navigation"
import { getTranslations } from "next-intl/server"

import { getLegalLinkContext } from "@lib/data/legal-links"
import { listTenantPages } from "@lib/data/tenant-pages"
import { footerLegalLinks } from "@lib/util/legal-links"

/**
 * One row with the shop's public offer and privacy policy, rendered by the
 * footer switch under whichever variant the shop picked (audit 2026-09-23,
 * B-01: 152-ФЗ wants the privacy policy reachable from every page, and no
 * variant linked it). Lives outside the variants so a new variant cannot forget
 * it. Nothing is rendered when the shop has published neither document
 * (`footerLegalLinks`).
 */
export default async function FooterLegal({ bare = false }: { bare?: boolean } = {}) {
  const [legal, footerPages, t] = await Promise.all([
    getLegalLinkContext(),
    listTenantPages(),
    getTranslations("Metadata"),
  ])

  const titles = Object.fromEntries(footerPages.map((page) => [page.key, page.title]))
  const links = footerLegalLinks(legal, titles, {
    terms: t("terms.title"),
    privacy: t("privacy.title"),
  })

  if (links.length === 0) {
    return null
  }

  return (
    // `bare`: no top border, for a footer drawn without horizontal lines (the Olavka one).
    <div className={bare ? "w-full bg-ui-bg-base" : "w-full border-t border-ui-border-base bg-ui-bg-base"}>
      <ul
        className="content-container flex flex-wrap gap-x-6 gap-y-2 py-4"
        data-testid="footer-legal-links"
      >
        {links.map((link) => (
          <li key={link.slot}>
            <Link
              href={link.href}
              className="txt-compact-small text-ui-fg-subtle hover:text-ui-fg-base transition-colors"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
