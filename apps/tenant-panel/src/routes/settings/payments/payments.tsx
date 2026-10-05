import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../../components/layout/pages"
import { useTenantBtcpay } from "../../../hooks/api/btcpay"
import {
  connectedMethodKeys,
  isDemoOnly,
  isMethodConnected,
  visibleMethodKeys,
  type PaymentMethodKey,
} from "../../../lib/payment-methods-summary"
import { CrossLink } from "../integrations/components/cross-link"
import { UnreadableSecretAlert } from "../integrations/components/unreadable-secret-alert"
import { BitcartCard } from "./components/bitcart-card"
import { BtcpayCard } from "./components/btcpay-card"
import { ManualPaymentCard } from "./components/manual-payment-card"
import { PaymentPreNoticeCard } from "./components/payment-pre-notice-card"
import { RobokassaBehaviourFields } from "./components/robokassa-behaviour-fields"
import { X402Card } from "./components/x402-card"
import { useRobokassaForm } from "./use-robokassa-form"

const METHOD_LABEL_KEYS: Record<PaymentMethodKey, string> = {
  robokassa: "paymentSettings.methodsSummary.robokassa",
  btcpay: "paymentSettings.methodsSummary.btcpay",
  bitcart: "paymentSettings.methodsSummary.bitcart",
  x402: "paymentSettings.methodsSummary.x402",
  manual: "paymentSettings.methodsSummary.manual",
}

// «Приём оплат» (t03-tenant-secrets-robokassa, restructured by
// p01-settings-integrations-restructure).
//
// WHAT THIS SCREEN IS NOW: how the shop behaves on Robokassa — test or live,
// which hash the signature uses, whether the method is offered — plus the
// Result URL the owner pastes into her Robokassa dashboard.
//
// WHAT LEFT: the MerchantLogin and the four passwords. Ivan's order of
// 2026-09-16 20:22 WITA puts every service's REQUISITES under «Подключение», so
// they live at `/settings/integrations/robokassa` and this page links there.
// The form itself did not fork: both screens drive `useRobokassaForm`, which
// submits the whole record either way, because `PUT /tenants/payment-settings`
// wants `merchant_login` on every request.
//
// Rule 19h still shapes the load, inside the hook: «not answered yet» is its
// own state, the controls render disabled rather than swapped out, and a late
// answer never overwrites what the owner has already typed.

export const PaymentSettings = () => {
  const { t } = useTranslation()
  const form = useRobokassaForm()
  // The same query the BTCPay card reads, so no second request: whether this
  // instance takes cryptocurrency decides if BTCPay and Bitcart are rows at
  // all. One switch serves both (`PAYMENTS_CRYPTO_AVAILABLE`).
  const { btcpay } = useTenantBtcpay()
  const cryptoAvailable = btcpay?.available === true
  const {
    settings,
    unreadable,
    resultUrl,
    methods,
    loaded,
    busy,
    isSaving,
    isError,
    error,
    handleSubmit,
  } = form

  if (isError) {
    throw error
  }

  // A shop with no Robokassa row has nothing to behave WITH: the endpoint takes
  // `merchant_login` as required, so saving from here would fail on a field
  // this screen no longer shows. Say where it is instead of offering a button
  // that cannot work (rule 19h — the real control, disabled, plus the reason).
  const noAccount = loaded !== null && !settings

  const connected = methods ? connectedMethodKeys(methods) : []
  const buyerSeesDemoOnly = methods ? isDemoOnly(methods) : false

  return (
    <SingleColumnPage hasOutlet={false} widgets={{ before: [], after: [] }}>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading>{t("paymentSettings.title")}</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("paymentSettings.subtitle")}
            </Text>
          </div>
          {unreadable ? (
            <Badge size="2xsmall" color="red" data-testid="payments-state">
              {t("integrations.state.unreadable")}
            </Badge>
          ) : settings ? (
            <Badge size="2xsmall" color={settings.is_enabled ? "green" : "grey"}>
              {settings.is_enabled
                ? settings.is_test
                  ? t("paymentSettings.stateTest")
                  : t("paymentSettings.stateLive")
                : t("paymentSettings.stateOff")}
            </Badge>
          ) : loaded ? (
            <Badge size="2xsmall" color="grey">
              {t("paymentSettings.stateNone")}
            </Badge>
          ) : null}
        </div>

        {methods ? (
          <div className="flex flex-col gap-y-3 px-6 py-4" data-testid="payment-methods-summary">
            <Text size="small" weight="plus">
              {t("paymentSettings.methodsSummary.title")}
            </Text>
            <ul className="flex flex-col gap-y-2">
              {visibleMethodKeys({ cryptoAvailable }).map((key) => (
                <li key={key} className="flex items-center justify-between">
                  <Text size="small">{t(METHOD_LABEL_KEYS[key])}</Text>
                  <Badge
                    size="2xsmall"
                    color={isMethodConnected(methods, key) ? "green" : "grey"}
                    data-testid={`payment-method-status-${key}`}
                  >
                    {isMethodConnected(methods, key)
                      ? t("paymentSettings.methodsSummary.connected")
                      : t("paymentSettings.methodsSummary.notConnected")}
                  </Badge>
                </li>
              ))}
            </ul>
            <Text
              size="small"
              className="text-ui-fg-subtle"
              data-testid="payment-methods-buyer-hint"
            >
              {buyerSeesDemoOnly
                ? t("paymentSettings.methodsSummary.buyerSeesDemoOnly")
                : t("paymentSettings.methodsSummary.buyerSees", {
                    methods: connected
                      .map((key) => t(METHOD_LABEL_KEYS[key]))
                      .join(t("paymentSettings.methodsSummary.listSeparator")),
                  })}
            </Text>
          </div>
        ) : null}

        <div className="flex flex-col gap-y-3 px-6 py-4">
          {unreadable ? <UnreadableSecretAlert testId="payments-unreadable" /> : null}
          <CrossLink
            to="/settings/integrations/robokassa"
            hint={t("integrations.crossLink.credentialsHint")}
            label={t("integrations.robokassa.title")}
            testId="payments-credentials-link"
          />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-y-6 px-6 py-6">
          {noAccount && !unreadable ? (
            <Text size="small" className="text-ui-fg-subtle" data-testid="payments-no-account">
              {t("integrations.robokassa.noAccount")}
            </Text>
          ) : null}

          <RobokassaBehaviourFields form={form} />

          {unreadable ? (
            <Text
              size="small"
              className="text-ui-fg-subtle"
              data-testid="payments-unreadable-hint"
            >
              {t("integrations.robokassa.unreadableBehaviour")}
            </Text>
          ) : null}

          <div className="flex items-center gap-x-2">
            <Button
              type="submit"
              size="small"
              isLoading={isSaving}
              disabled={busy || noAccount}
              data-testid="payments-save"
            >
              {t("paymentSettings.save")}
            </Button>
          </div>
        </form>

        <div className="flex flex-col gap-y-2 px-6 py-4">
          <Text size="small" weight="plus">
            {t("paymentSettings.resultUrlTitle")}
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            {t("paymentSettings.resultUrlHint")}
          </Text>
          <code
            className="txt-compact-small rounded-md border bg-ui-bg-subtle px-2 py-1"
            data-testid="robokassa-result-url"
          >
            {resultUrl ?? t("paymentSettings.loading")}
          </code>
        </div>
      </Container>

      {/* ask-20261005-070255-438f: the shop's own BTCPay Server store. */}
      <BtcpayCard />

      {/* ask-20261005-070255-438f, stage 2: the shop's own Bitcart store. */}
      <BitcartCard />

      {/* t-2026-10-03-33: USDC to the shop's own address over x402. */}
      <X402Card />

      {/* olavka-payments: crypto wallets and manager contacts on the manual provider. */}
      <ManualPaymentCard />

      {/* Rule 5zd (t-2026-10-03-32): the pre-payment notice's per-method fields. */}
      <PaymentPreNoticeCard />
    </SingleColumnPage>
  )
}
