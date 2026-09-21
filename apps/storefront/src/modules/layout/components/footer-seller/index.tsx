import { getTranslations } from "next-intl/server"

import type { TenantSeller } from "@lib/data/tenant-seller"

const HEADING = "txt-medium-plus font-medium text-ui-fg-base"
const LINE = "txt-compact-medium text-ui-fg-subtle"
const LINK = `${LINE} transition-colors hover:text-ui-fg-base`

/**
 * The two halves of the footer's answer to «кто продавец и как с ним связаться», both from
 * the shop's own requisites (`getTenantSeller`). Each renders nothing when the owner has
 * filled none of its fields, so a footer never shows a heading over an empty column.
 */
export async function FooterContacts({ seller }: { seller: TenantSeller | null }) {
  if (!seller?.phone && !seller?.email) {
    return null
  }
  const t = await getTranslations("Footer")

  return (
    <address className="flex flex-col gap-y-2 not-italic" data-testid="footer-contacts">
      <span className={HEADING}>{t("contactsHeading")}</span>
      {seller.phone ? (
        <a href={`tel:${seller.phone.replace(/[^\d+]/g, "")}`} className={LINK} data-testid="footer-phone">
          {seller.phone}
        </a>
      ) : null}
      {seller.email ? (
        <a href={`mailto:${seller.email}`} className={`${LINK} break-all`} data-testid="footer-email">
          {seller.email}
        </a>
      ) : null}
    </address>
  )
}

export async function FooterRequisites({ seller }: { seller: TenantSeller | null }) {
  if (!seller?.legal_name && !seller?.inn && !seller?.ogrn && !seller?.legal_address) {
    return null
  }
  const t = await getTranslations("Footer")

  return (
    <div className="flex flex-col gap-y-3" data-testid="footer-requisites">
      <span className={HEADING}>{t("sellerHeading")}</span>
      <ul className="flex flex-col gap-y-2">
        {seller.legal_name ? <li className={LINE}>{seller.legal_name}</li> : null}
        {seller.inn ? <li className={`${LINE} tabular-nums`}>{t("taxId", { value: seller.inn })}</li> : null}
        {seller.ogrn ? <li className={`${LINE} tabular-nums`}>{t("regNumber", { value: seller.ogrn })}</li> : null}
        {seller.legal_address ? <li className={`${LINE} text-pretty`}>{seller.legal_address}</li> : null}
      </ul>
    </div>
  )
}
