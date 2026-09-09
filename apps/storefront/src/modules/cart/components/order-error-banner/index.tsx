import { Link } from "@i18n/navigation"
import { Button } from "@medusajs/ui"
import { getTranslations } from "next-intl/server"

/**
 * Both redirect targets `app/api/payment-return/route.ts` already writes
 * (`payment_failed`: rejected before an order was attempted; `order_failed`:
 * the attempt ran but the cart never converted) and the demo card's own
 * `order_failed` trigger (`payment-button/providers/manual.tsx`) land here —
 * checkout mockup frame 10. Any other value, or none, renders nothing: this
 * banner never repeats a raw query-string value on the screen (rule 27d
 * acceptance 1).
 */
const FAILURE_REASONS = ["payment_failed", "order_failed"] as const
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

  const t = await getTranslations("OrderFailed")
  const reasonKey = error === "payment_failed" ? "paymentFailedReason" : "orderFailedReason"

  return (
    <div
      className="w-full border-b border-rose-200 bg-rose-50"
      data-testid="order-error-banner"
      data-value={error}
    >
      <div className="content-container flex flex-col gap-y-4 py-4 small:flex-row small:items-center small:justify-between small:gap-x-6">
        <div className="flex items-start gap-x-2">
          <span
            className="mt-[7px] h-2 w-2 flex-shrink-0 rounded-full bg-rose-500"
            aria-hidden
          />
          <div className="flex flex-col gap-y-0.5">
            <span className="txt-compact-medium-plus text-rose-950">
              {t("heading")}
            </span>
            <span className="txt-compact-small text-rose-700">
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
          <Link
            href="/contact"
            className="flex items-center justify-center txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover px-4 py-2"
            data-testid="order-error-contact-link"
          >
            {t("contact")}
          </Link>
        </div>
      </div>
    </div>
  )
}

export default OrderErrorBanner
