import type React from "react"

import UnderlineLink from "@modules/common/components/interactive-link"

import { getLegalLinkContext } from "@lib/data/legal-links"
import { accountSupport } from "@lib/util/account-support"

import AccountNav from "../components/account-nav"
import type { HttpTypes } from "@medusajs/types"
import { getTranslations } from "next-intl/server"
import { clx } from "@medusajs/ui"

interface AccountLayoutProps {
  customer: HttpTypes.StoreCustomer | null
  children: React.ReactNode
}

const AccountLayout = async ({ customer, children }: AccountLayoutProps) => {
  const [t, legal] = await Promise.all([
    getTranslations("AccountLayout"),
    getLegalLinkContext(),
  ])
  // "Customer service" pointed at the starter's placeholder page on every shop
  // (f05-checkout-legal-stubs). It now reaches the shop's own support or
  // contacts page, and the whole block goes away when the shop has neither —
  // an invitation to "get in touch" that leads nowhere is worse than silence.
  //
  // t-2026-10-08-13: the starter's copy promises answers to frequent questions,
  // and a shop has no such page. A shop is sent to its contacts under that name.
  const support = accountSupport(legal)

  return (
    <div className="flex-1" data-testid="account-page">
      <div className="flex-1 h-full flex flex-col">
        <div className="content-container grid grid-cols-1 small:grid-cols-[240px_1fr] py-12">
          {customer && <AccountNav />}
          <div className={clx("flex-1", !customer && "col-span-full")}>
            {children}
          </div>
        </div>
        {/* D10 (t-2026-10-20-61): the sign-in card stands alone, no «Questions and answers» strip under it. */}
        {customer && (
          <>
            <div className="h-px bg-ui-border-base" />
            <div className="flex flex-col small:flex-row items-end justify-between py-12 gap-8 content-container">
              <div>
                <h2 className="text-xl-semi mb-4">{t("gotQuestions")}</h2>
                <span className="txt-medium" data-testid="account-support-text">
                  {t(support.text)}
                </span>
              </div>
              {support.href && (
                <div>
                  <UnderlineLink href={support.href}>{t(support.label)}</UnderlineLink>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default AccountLayout
