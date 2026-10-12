import { getLegalLinkContext } from "@lib/data/legal-links"
import { listCartShippingMethods } from "@lib/data/fulfillment"
import { listCartPaymentMethods, listRobokassaMethods } from "@lib/data/payment"
import { getTenantManualPayment } from "@lib/data/tenant-manual-payment"
import { getTenantPaymentPreNotice } from "@lib/data/tenant-payment-pre-notice"
import { getTenantSeller } from "@lib/data/tenant-seller"
import { listPublishedPageVersions } from "@lib/data/tenant-pages"
import { getSitePaymentMethods } from "@lib/data/tenant-payment-methods"
import { checkoutStepLocksOf } from "@lib/util/checkout-steps"
import { sellerLabel } from "@lib/util/payment-pre-notice"
import type { HttpTypes } from "@medusajs/types"
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
  // t-2026-10-09-56 (Ivan's item 7): the payment block opens last, once the sign-in
  // (t-2026-10-12-05), the address, the delivery and the contacts are done
  // (`checkoutStepLocksOf`, the same test the form template locks its own sections by).
  // Until then it is its heading alone, and no payment session is started for a cart that
  // cannot be paid yet.
  const [shippingOptions, tLocked] = await Promise.all([
    listCartShippingMethods(cart.id),
    getTranslations("CheckoutPage"),
  ])
  if (checkoutStepLocksOf(cart, shippingOptions, !!customer).payment) {
    return (
      <div className="flex flex-col gap-y-3 py-2" aria-disabled="true" data-testid="checkout-payment-locked">
        <h2 className="h2-docs text-ui-fg-disabled">{tLocked("paymentHeading")}</h2>
      </div>
    )
  }

  // Batch 7: no guest pays at all — every order lands in an account. The lock above already
  // keeps a guest out of this block (t-2026-10-12-05); the button keeps its own guard.
  const requiresSignIn = !customer
  const [
    paymentMethods,
    legalLinks,
    manualPayment,
    tenantPaymentMethods,
    prePaymentNotice,
    seller,
    pageVersions,
    robokassaMethods,
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
      // The version of each document the consents point to, stamped on the order
      // (`@lib/util/checkout-consent`, rule C3 of the 04.10 checklist).
      listPublishedPageVersions(),
      // t-2026-10-04-49: the Robokassa option is listed as the methods the shop
      // enabled («Банковская карта», «СБП»…). A shop without Robokassa answers an
      // empty list without the backend asking Robokassa anything.
      listRobokassaMethods(),
    ])
  const legal = { ...legalLinks, versions: pageVersions }

  // t-2026-10-09-56 (Ivan 09.10: «и тем более без дубликатов»): the «Доставка» and
  // «Правила возврата» links that stood under the button (and in the layout's footer on
  // a phone) moved into the line right above it (`RobokassaTermsLinks`), so the delivery
  // page is linked once.
  return (
    <div className="flex flex-col gap-y-6">
      <CheckoutPaymentSection
        cart={cart}
        availablePaymentMethods={paymentMethods ?? []}
        legal={legal}
        manualPayment={manualPayment}
        tenantPaymentMethods={tenantPaymentMethods}
        robokassaMethods={robokassaMethods}
        requiresSignIn={requiresSignIn}
        prePaymentNotice={prePaymentNotice}
        seller={sellerLabel(seller ?? { name: null, legal_name: null })}
      />
    </div>
  )
}

export default CheckoutPayment
