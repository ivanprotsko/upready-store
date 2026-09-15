import { Link } from "@i18n/navigation"
import { getTranslations } from "next-intl/server"

import { getLegalLinkContext } from "@lib/data/legal-links"
import { legalHref } from "@lib/util/legal-links"

/**
 * The help strip under an order. Both links used to go to the starter's
 * placeholder pages, which a customer reaches at the worst possible moment —
 * they are looking at an order they want to ask about
 * (f05-checkout-legal-stubs). Each link now waits for the shop's own page and
 * is left out until there is one.
 */
const Help = async () => {
  const [t, legal] = await Promise.all([
    getTranslations("Help"),
    getLegalLinkContext(),
  ])
  const contactLink = legalHref("contact", legal)
  const returnsLink = legalHref("returns", legal)

  if (!contactLink && !returnsLink) {
    return null
  }

  return (
    <ul className="flex flex-col small:flex-row gap-x-8 gap-y-2 txt-medium">
      {contactLink && (
        <li>
          <Link
            href={contactLink}
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
          >
            {t("contact")}
          </Link>
        </li>
      )}
      {returnsLink && (
        <li>
          <Link
            href={returnsLink}
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
          >
            {t("returnsExchanges")}
          </Link>
        </li>
      )}
    </ul>
  )
}

export default Help
