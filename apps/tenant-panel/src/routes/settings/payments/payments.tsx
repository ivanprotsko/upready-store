import { TriangleRightMini } from "@medusajs/icons"
import { Container, Heading, StatusBadge, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { SingleColumnPageSkeleton } from "../../../components/common/skeleton"
import { SingleColumnPage } from "../../../components/layout/pages"
import { useTenantBitcart } from "../../../hooks/api/bitcart"
import { useTenantBtcpay } from "../../../hooks/api/btcpay"
import { usePaymentSettings } from "../../../hooks/api/payment-settings"
import { useTenantTribute } from "../../../hooks/api/tribute"
import { useTenantX402 } from "../../../hooks/api/x402"
import {
  WAY_STATE_COLOR,
  manualState,
  offeredWays,
  robokassaState,
  storedState,
  visibleWays,
  wayStateKey,
  x402State,
  type PaymentWay,
  type WayState,
} from "./payment-ways"

// «Приём оплат» (t03-tenant-secrets-robokassa, p01, t-2026-09-24-n10).
//
// t-2026-10-14-01 (panel redesign, G3, prototype state `payments`): the screen
// is a list of the shop's payment methods and nothing else. Its header says
// how many the checkout offers and which; each row is a link to the method's
// own card (`/settings/payments/<way>`) with the method's state as a
// `StatusBadge`. No field and no «Сохранить» stays here: the Robokassa
// behaviour, the Tribute key, the BTCPay / Bitcart / x402 requisites and the
// notice before payment moved to the cards and their drawers (audit A1–A3).

export const PaymentSettings = () => {
  const { t } = useTranslation()
  const payments = usePaymentSettings()
  const { tribute, ...tributeQuery } = useTenantTribute()
  const { btcpay, ...btcpayQuery } = useTenantBtcpay()
  const { bitcart, ...bitcartQuery } = useTenantBitcart()
  const { x402, ...x402Query } = useTenantX402()

  const queries = [payments, tributeQuery, btcpayQuery, bitcartQuery, x402Query]
  const failed = queries.find((query) => query.isError)
  if (failed) {
    throw failed.error
  }

  const methods = payments.methods
  if (queries.some((query) => query.isPending) || !methods) {
    return <SingleColumnPageSkeleton sections={1} />
  }

  // One switch serves BTCPay, Bitcart and x402 (`PAYMENTS_CRYPTO_AVAILABLE`).
  const ways = visibleWays({
    tributeAvailable: tribute?.available === true,
    cryptoAvailable: btcpay?.available === true,
  })

  const states: Record<PaymentWay, WayState> = {
    robokassa: robokassaState(payments.settings, payments.unreadable),
    manual: manualState(methods),
    tribute: storedState(tribute?.settings),
    btcpay: storedState(btcpay?.settings, btcpay?.unreadable),
    bitcart: storedState(bitcart?.settings, bitcart?.unreadable),
    x402: x402State(x402?.settings, x402?.unreadable),
  }

  const offered = offeredWays(methods, ways)
  const titleOf = (way: PaymentWay) => t(`paymentMethods.ways.${way}.title`)

  const buyerSees = offered.length
    ? t("paymentMethods.list.buyerSees", {
        methods: offered.map(titleOf).join(t("paymentSettings.methodsSummary.listSeparator")),
      })
    : methods.demo
      ? t("paymentMethods.list.buyerSeesDemoOnly")
      : t("paymentMethods.list.buyerSeesNothing")

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet={false}>
      <Container className="divide-y p-0" data-testid="payment-ways">
        <div className="flex items-center justify-between gap-x-4 px-6 py-4">
          <div className="min-w-0">
            <Heading>{t("paymentMethods.list.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle text-pretty" data-testid="payment-ways-buyer-sees">
              {t("paymentMethods.list.description")} {buyerSees}
            </Text>
          </div>
          <StatusBadge
            className="shrink-0"
            color={offered.length ? "green" : "orange"}
            data-testid="payment-ways-at-checkout"
          >
            {offered.length
              ? t("paymentMethods.list.atCheckout", { count: offered.length })
              : t("paymentMethods.list.noneAtCheckout")}
          </StatusBadge>
        </div>
        {ways.map((way) => (
          <Link
            key={way}
            to={`/settings/payments/${way}`}
            className="transition-fg hover:bg-ui-bg-base-hover focus-visible:bg-ui-bg-base-hover flex items-center gap-x-4 px-6 py-4 outline-none"
            data-testid={`payment-way-${way}`}
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <Text size="small" leading="compact" weight="plus">
                {titleOf(way)}
              </Text>
              <Text size="small" leading="compact" className="text-ui-fg-subtle text-pretty">
                {t(`paymentMethods.ways.${way}.description`)}
              </Text>
            </div>
            <StatusBadge className="shrink-0" color={WAY_STATE_COLOR[states[way]]}>
              {t(wayStateKey(states[way]))}
            </StatusBadge>
            <TriangleRightMini className="text-ui-fg-muted shrink-0 rtl:rotate-180" />
          </Link>
        ))}
      </Container>
    </SingleColumnPage>
  )
}
