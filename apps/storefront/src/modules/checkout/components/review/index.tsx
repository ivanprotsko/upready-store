"use client"

import { Heading, Text, clx } from "@medusajs/ui"
import { useTranslations } from "next-intl"

import PaymentButton from "../payment-button"
import { useSearchParams } from "next/navigation"
import type { HttpTypes } from "@medusajs/types"

/**
 * Not currently rendered anywhere (`grep -rn "checkout/components/review"` finds
 * only this file) — the live checkout flow composes its steps through
 * `checkout-form/`/`checkout-info-rows` instead. Fixed for consistency with the
 * rest of the class (rule 20) so it does not silently regress to the build
 * constant if it is ever wired back in, but this could not be exercised in a
 * browser as part of this change (see the report). `siteName` comes from a
 * server parent as a PROP: this is a client component and must never import the
 * `next/headers`-reading accessor directly (rule 19g).
 */
const Review = ({
  cart,
  siteName,
}: {
  cart: HttpTypes.StoreCart
  siteName: string
}) => {
  const t = useTranslations("Review")
  const searchParams = useSearchParams()

  const isOpen = searchParams.get("step") === "review"

  const paidByGiftcard = !!(
    (cart as unknown as Record<string, unknown>)?.gift_cards && ((cart as unknown as Record<string, unknown>)?.gift_cards as unknown[])?.length > 0 && cart?.total === 0
  )

  const previousStepsCompleted =
    cart.shipping_address &&
    (cart.shipping_methods?.length ?? 0) > 0 &&
    (cart.payment_collection || paidByGiftcard)

  return (
    <div className="bg-ui-bg-base">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row text-3xl-regular gap-x-2 items-baseline",
            {
              "opacity-50 pointer-events-none select-none": !isOpen,
            }
          )}
        >
          {t("heading")}
        </Heading>
      </div>
      {isOpen && previousStepsCompleted && (
        <>
          <div className="flex items-start gap-x-1 w-full mb-6">
            <div className="w-full">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                {t("confirmText", { siteName: siteName })}
              </Text>
            </div>
          </div>
          <PaymentButton cart={cart} data-testid="submit-order-button" />
        </>
      )}
    </div>
  )
}

export default Review
