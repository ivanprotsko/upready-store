import { getLegalLinkContext } from "@lib/data/legal-links"
import { listCartPaymentMethods } from "@lib/data/payment"
import { getTenantManualPayment } from "@lib/data/tenant-manual-payment"
import { getTenantPaymentPreNotice } from "@lib/data/tenant-payment-pre-notice"
import { getTenantSeller } from "@lib/data/tenant-seller"
import { listPublishedPageVersions } from "@lib/data/tenant-pages"
import { getSitePaymentMethods } from "@lib/data/tenant-payment-methods"
import { legalHref } from "@lib/util/legal-links"
import { sellerLabel } from "@lib/util/payment-pre-notice"
import type { HttpTypes } from "@medusajs/types"
import { Link } from "@i18n/navigation"
import { getTranslations } from "next-intl/server"
import CheckoutPaymentSection from "@modules/checkout/components/checkout-payment-section"

/**
 * The payment block of the checkout: the method, the pre-payment notice, the button and
 * the consent line (batch 6 part 1 split it out of `CheckoutSummary`). On a desktop it
 * sits under the form in the left column while the summary stays on the right; on a
 * phone it comes last, after the summary, as before.
 */
const CheckoutPayment = async ({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart
  customer: HttpTypes.StoreCustomer | null
}) => {
  // Batch 7: no guest pays at all — every order lands in an account (the pay button stays
  // disabled until the sign-in, `CheckoutSignIn` above the form says why).
  const requiresSignIn = !customer
  const [
    paymentMethods,
    legalLinks,
    manualPayment,
    tenantPaymentMethods,
    prePaymentNotice,
    seller,
    t,
    pageVersions,
  ] = await Promise.all([
      listCartPaymentMethods(cart.region?.id ?? ""),
      // The consent sentence under the Pay button names four documents; this is
      // where the shop's own pages are read for it, because the section itself is
      // a client component (rule 19g, f05-checkout-legal-stubs).
      getLegalLinkContext(),
      // The shop's crypto wallets and manager contacts for the manual provider
      // (olavka-payments), read from the tenant header here for the same reason.
      getTenantManualPayment(),
      // t-2026-09-24-n10: which methods this shop connected, so the manual
      // provider's demo card can be labelled honestly once it is offered only
      // as a last resort.
      getSitePaymentMethods(),
      // Rule 5zd (t-2026-10-03-32): the pre-payment notice's per-method fields.
      getTenantPaymentPreNotice(),
      // The seller the notice names — legal name, or the shop's display name
      // while there is none; never an INN or an OGRN (`sellerLabel`).
      getTenantSeller(),
      getTranslations("CheckoutPage"),
      // The version of each document the consents point to, stamped on the order
      // (`@lib/util/checkout-consent`, rule C3 of the 04.10 checklist).
      listPublishedPageVersions(),
    ])
  const legal = { ...legalLinks, versions: pageVersions }

  // Navigation links, not consent: each one is shown only while the shop has a
  // page behind it. Before f05-checkout-legal-stubs both went to the starter's
  // placeholder routes, so a shop that never wrote its shipping terms still
  // offered the buyer a page saying so in English (rule 20 — the same fix as
  // the consent sentence above it, at every call site). The phone shows the same
  // two in the layout's footer.
  const shippingLink = legalHref("shipping", legal)
  const returnsLink = legalHref("returns", legal)

  return (
    <div className="flex flex-col gap-y-6">
      <CheckoutPaymentSection
        cart={cart}
        availablePaymentMethods={paymentMethods ?? []}
        legal={legal}
        manualPayment={manualPayment}
        tenantPaymentMethods={tenantPaymentMethods}
        requiresSignIn={requiresSignIn}
        prePaymentNotice={prePaymentNotice}
        seller={sellerLabel(seller ?? { name: null, legal_name: null })}
      />

      {(shippingLink || returnsLink) && (
        <div className="hidden lg:flex gap-x-4">
          {shippingLink && (
            <Link
              href={shippingLink}
              className="txt-medium text-ui-fg-base hover:text-ui-fg-subtle transition-colors"
            >
              {t("shippingLink")}
            </Link>
          )}
          {returnsLink && (
            <Link
              href={returnsLink}
              className="txt-medium text-ui-fg-base hover:text-ui-fg-subtle transition-colors"
            >
              {t("returnsLink")}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

export default CheckoutPayment
