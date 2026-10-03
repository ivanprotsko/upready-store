"use client"

import { claimGuestOrdersAction } from "@lib/data/orders"
import { CheckCircleMiniSolid, InformationCircleSolid } from "@medusajs/icons"
import { Heading, Text } from "@medusajs/ui"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { useTranslations } from "next-intl"
import { useActionState } from "react"

/**
 * "I ordered without an account" — one button that attaches the orders this
 * shop holds under the customer's own address to their account.
 *
 * It is the first thing on the orders screen for an account with nothing in
 * it, because that account is almost always a guest buyer who has just
 * registered (f03-guest-order-not-in-account). The transfer-by-link form stays
 * underneath it for the other case, an order placed under a different address,
 * where the link from the confirmation email really is the only proof.
 *
 * Submitting re-renders the route, so a claimed order is already in the list
 * behind this block by the time the message appears.
 */
export default function ClaimOrdersForm() {
  const t = useTranslations("ClaimOrders")

  const [state, formAction] = useActionState(claimGuestOrdersAction, {
    claimed: null as number | null,
    error: null as string | null,
  })

  return (
    <div className="flex flex-col gap-y-4 w-full" data-testid="claim-orders-block">
      <div className="grid sm:grid-cols-2 items-center gap-x-8 gap-y-4 w-full">
        <div className="flex flex-col gap-y-1">
          <Heading level="h2" className="!text-sm font-semibold text-ui-fg-base">
            {t("heading")}
          </Heading>
          <p className="text-small-regular text-ui-fg-muted">{t("description")}</p>
        </div>
        <form action={formAction} className="flex sm:justify-end">
          <SubmitButton
            variant="primary"
            size="small"
            className="w-fit whitespace-nowrap"
            data-testid="claim-orders-button"
          >
            {t("button")}
          </SubmitButton>
        </form>
      </div>

      {state.error && (
        <Text className="text-base-regular text-ui-fg-error" data-testid="claim-orders-failed">
          {t("failed")}
        </Text>
      )}

      {!state.error && state.claimed !== null && state.claimed > 0 && (
        <div className="flex gap-x-2 items-center p-4 bg-ui-bg-subtle shadow-borders-base w-full">
          <CheckCircleMiniSolid className="w-4 h-4 text-ui-tag-green-text shrink-0" />
          <Text className="text-base-regular text-ui-fg-base" data-testid="claim-orders-claimed">
            {t("claimed", { count: state.claimed })}
          </Text>
        </div>
      )}

      {!state.error && state.claimed === 0 && (
        <div className="flex gap-x-2 items-center p-4 bg-ui-bg-subtle shadow-borders-base w-full">
          <InformationCircleSolid className="w-4 h-4 text-ui-fg-muted shrink-0" />
          <Text className="text-base-regular text-ui-fg-subtle" data-testid="claim-orders-none">
            {t("none")}
          </Text>
        </div>
      )}
    </div>
  )
}
