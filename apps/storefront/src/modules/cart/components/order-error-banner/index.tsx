import { Link } from "@i18n/navigation"
import { Button } from "@medusajs/ui"
import { getTranslations } from "next-intl/server"

import { getLegalLinkContext } from "@lib/data/legal-links"
import { legalHref } from "@lib/util/legal-links"

/**
 * Both redirect targets `app/api/payment-return/route.ts` already writes
 * (`payment_failed`: rejected before an order was attempted; `order_failed`:
 * the attempt ran but the cart never converted) and the demo card's own
 * `order_failed` trigger (`payment-button/providers/manual.tsx`) land here —
 * checkout mockup frame 10. Any other value, or none, renders nothing: this
 * banner never repeats a raw query-string value on the screen (rule 27d
 * acceptance 1).
 *
 * Since t-2026-10-04-48 the payment return sends nobody here: a Robokassa
 * return lands on the checkout itself (`robokassa-retry-notice`). The banner
 * stays for the `/cart?error=…` links already out in the world.
 */
// `payment_pending`: a redirect provider (Robokassa) sent the customer back
// before its webhook confirmed the payment (t03-tenant-secrets-robokassa).
const FAILURE_REASONS = ["payment_failed", "order_failed", "payment_pending"] as const
type FailureReason = (typeof FAILURE_REASONS)[number]

const isFailureReason = (value: string | null | undefined): value is FailureReason =>
  FAILURE_REASONS.includes(value as FailureReason)

type OrderErrorBannerProps = {
  error?: string | null
}

const OrderErrorBanner = async ({ error }: OrderErrorBannerProps) => {
  if (!isFailureReason(error)) {
    return null
  }

  const [t, legal] = await Promise.all([
    getTranslations("OrderFailed"),
    getLegalLinkContext(),
  ])
  // The buyer is here because their payment failed; "get in touch" has to reach
  // the shop's own contacts page and is left out when the shop has none, rather
  // than opening the starter's placeholder (f05-checkout-legal-stubs).
  const contactLink = legalHref("contact", legal)
  const reasonKey =
    error === "payment_failed"
      ? "paymentFailedReason"
      : error === "payment_pending"
        ? "paymentPendingReason"
        : "orderFailedReason"
  // A payment still being confirmed has not failed (Ivan's test, t-2026-10-04-48:
  // «Платёж не прошёл» over «Оплата ещё подтверждается»), so it gets its own
  // heading and the amber of a wait, not the red of an error.
  const pending = error === "payment_pending"

  return (
    <div
      className={
        pending
          ? "w-full border-b border-ui-tag-orange-border bg-ui-tag-orange-bg"
          : "w-full border-b border-ui-tag-red-border bg-ui-tag-red-bg"
      }
      data-testid="order-error-banner"
      data-value={error}
    >
      <div className="content-container flex flex-col gap-y-4 py-4 small:flex-row small:items-center small:justify-between small:gap-x-6">
        <div className="flex items-start gap-x-2">
          <span
            className={
              pending
                ? "mt-[7px] h-2 w-2 flex-shrink-0 rounded-full bg-ui-tag-orange-icon"
                : "mt-[7px] h-2 w-2 flex-shrink-0 rounded-full bg-ui-tag-red-icon"
            }
            aria-hidden
          />
          <div className="flex flex-col gap-y-0.5">
            <span
              className={
                pending
                  ? "txt-compact-medium-plus text-ui-fg-base"
                  : "txt-compact-medium-plus text-ui-fg-error"
              }
              data-testid="order-error-heading"
            >
              {t(pending ? "pendingHeading" : "heading")}
            </span>
            <span
              className={
                pending
                  ? "txt-compact-small text-ui-tag-orange-text"
                  : "txt-compact-small text-ui-tag-red-text"
              }
            >
              {t(reasonKey)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-y-2 small:flex-row small:gap-x-2 small:flex-shrink-0">
          <Link href="/checkout" data-testid="order-error-retry-link">
            <Button variant="secondary" className="w-full small:w-auto">
              {t("retryCheckout")}
            </Button>
          </Link>
          {contactLink && (
            <Link
              href={contactLink}
              className="flex items-center justify-center txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover px-4 py-2"
              data-testid="order-error-contact-link"
            >
              {t("contact")}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

export default OrderErrorBanner
