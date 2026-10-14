import { useTranslation } from "react-i18next"
import { Navigate } from "react-router-dom"

import { SettingsDetail, type SettingsSection } from "../../../../components/settings"
import { useTenantBtcpay } from "../../../../hooks/api/btcpay"
import type { MaskedSecret } from "../../../../hooks/api/payment-settings"
import { WAY_STATE_COLOR, storedState, wayStateKey } from "../payment-ways"
import { AddressValue } from "./address-value"
import { usePreNoticeSection } from "./payment-pre-notice-card"

/**
 * «Криптовалюта (BTCPay Server)» (ask-20261005-070255-438f): the shop's own
 * BTCPay Server store. Only the «own server» mode: the owner creates the
 * store, a Greenfield API key and a webhook on a BTCPay Server of their
 * choosing and pastes four values. The two secrets come back as
 * `{ set, last4 }`; a store is saved switched off until the owner turns it on.
 *
 * t-2026-10-14-01 (panel redesign, G3, prototype state `payments-btcpay`):
 * the card reads state → requisites (with the webhook address to paste back
 * into BTCPay) → the notice before payment; the requisites and the switch are
 * edited in the drawer `edit`, the notice in the shared `pre-notice/edit`.
 *
 * The card exists only where the backend answers `available: true`
 * (`PAYMENTS_CRYPTO_AVAILABLE`); on the RU instance its address leads back to
 * the list, the way the old card rendered nothing there.
 */
export const BtcpayCard = () => {
  const { t } = useTranslation()
  const { btcpay, isPending, isError, error } = useTenantBtcpay()
  const preNotice = usePreNoticeSection("btcpay")

  if (isError) {
    throw error
  }

  if (btcpay && btcpay.available !== true) {
    return <Navigate to="/settings/payments" replace />
  }

  const settings = btcpay?.settings ?? null
  const state = storedState(settings, btcpay?.unreadable)
  const secret = (masked: MaskedSecret | undefined) =>
    masked?.set ? t("paymentMethods.masked", { last4: masked.last4 ?? "" }) : t("paymentMethods.notSet")

  const stateSection: SettingsSection = {
    id: "btcpay",
    title: t("paymentMethods.ways.btcpay.title"),
    description: t("paymentMethods.ways.btcpay.description"),
    status: { color: WAY_STATE_COLOR[state], label: t(wayStateKey(state)) },
    editTo: "edit",
    rows: [
      {
        id: "is_enabled",
        label: t("btcpay.fields.is_enabled"),
        value: settings?.is_enabled ? t("paymentMethods.yes") : t("paymentMethods.no"),
        hint: btcpay?.unreadable
          ? t("paymentMethods.unreadableHint")
          : settings
            ? undefined
            : t("paymentMethods.fillRequisites"),
      },
    ],
  }

  const requisitesSection: SettingsSection = {
    id: "requisites",
    title: t("paymentMethods.requisites"),
    description: t("paymentMethods.btcpay.requisitesDescription"),
    editTo: "edit",
    rows: [
      { id: "server_url", label: t("btcpay.fields.server_url"), value: settings?.server_url, mono: true },
      { id: "store_id", label: t("paymentMethods.btcpay.storeId"), value: settings?.store_id, mono: true },
      { id: "api_key", label: t("paymentMethods.accessKey"), value: secret(settings?.api_key) },
      { id: "webhook_secret", label: t("btcpay.fields.webhook_secret"), value: secret(settings?.webhook_secret) },
      {
        id: "webhook_url",
        label: t("paymentMethods.btcpay.webhook"),
        value: btcpay?.webhook_url ? <AddressValue value={btcpay.webhook_url} testId="btcpay-webhook-url" /> : null,
        hint: t("btcpay.webhookHint"),
      },
    ],
  }

  return (
    <SettingsDetail
      isPending={isPending || preNotice.isPending}
      sections={[stateSection, requisitesSection, preNotice.section]}
    />
  )
}
