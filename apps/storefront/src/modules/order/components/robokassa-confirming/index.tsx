"use client"

import { nextConfirmingRefreshMs } from "@lib/util/robokassa-order"
import { Text } from "@medusajs/ui"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"

/**
 * The order page of a Robokassa order whose confirmation has not arrived yet
 * (t-2026-10-12-13, Ivan 12.10, 1.2: «перенаправлять на страницу оформленного
 * заказа и там показывать информацию, что платеж еще подтверждается»). One
 * calm line, no button: the order exists, there is nothing to pay again, and
 * the page asks the server again on its own (every 3 s for two minutes, then
 * every 15 s, and stops after a quarter of an hour). Once the Result webhook
 * captured the payment, the next refresh renders the paid page.
 */
export default function RobokassaConfirming() {
  const t = useTranslations("OrderCompleted")
  const router = useRouter()

  useEffect(() => {
    const startedAt = Date.now()
    let timer: number | undefined

    const schedule = () => {
      const pause = nextConfirmingRefreshMs(Date.now() - startedAt)
      if (pause === null) {
        return
      }
      timer = window.setTimeout(() => {
        router.refresh()
        schedule()
      }, pause)
    }

    schedule()
    return () => window.clearTimeout(timer)
  }, [router])

  return (
    <Text
      role="status"
      className="txt-medium text-ui-fg-subtle"
      data-testid="order-payment-confirming"
    >
      {t("paymentConfirmingText")}
    </Text>
  )
}
