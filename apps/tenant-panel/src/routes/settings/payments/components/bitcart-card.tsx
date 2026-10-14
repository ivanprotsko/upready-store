import { useTranslation } from "react-i18next"
import { Navigate } from "react-router-dom"

import { SettingsDetail, type SettingsSection } from "../../../../components/settings"
import { useTenantBitcart } from "../../../../hooks/api/bitcart"
import { WAY_STATE_COLOR, storedState, wayStateKey } from "../payment-ways"
import { AddressValue } from "./address-value"
import { usePreNoticeSection } from "./payment-pre-notice-card"

/**
 * «Криптовалюта (Bitcart)» (ask-20261005-070255-438f, stage 2): the shop's own
 * Bitcart store, built the way BTCPay is. Only the «own server» mode. Two
 * addresses, because Bitcart serves its API and the page where the buyer pays
 * from two different places, and the API does not report the second. There
 * is no webhook to set up: every invoice tells Bitcart where to report.
 *
 * t-2026-10-14-01 (panel redesign, G3): the BTCPay card's template with
 * Bitcart's own fields — state → requisites → the notice before payment —
 * and the old card's two text blocks, «Возвраты» and «Уведомления об
 * оплате», as read sections at the bottom (the prototype's notes: «две
 * текстовые секции чтения внизу»).
 *
 * The card exists only where the backend answers `available: true`; on the RU
 * instance its address leads back to the list.
 */
export const BitcartCard = () => {
  const { t } = useTranslation()
  const { bitcart, isPending, isError, error } = useTenantBitcart()
  const preNotice = usePreNoticeSection("bitcart")

  if (isError) {
    throw error
  }

  if (bitcart && bitcart.available !== true) {
    return <Navigate to="/settings/payments" replace />
  }

  const settings = bitcart?.settings ?? null
  const state = storedState(settings, bitcart?.unreadable)

  const stateSection: SettingsSection = {
    id: "bitcart",
    title: t("paymentMethods.ways.bitcart.title"),
    description: t("paymentMethods.ways.bitcart.description"),
    status: { color: WAY_STATE_COLOR[state], label: t(wayStateKey(state)) },
    editTo: "edit",
    rows: [
      {
        id: "is_enabled",
        label: t("bitcart.fields.is_enabled"),
        value: settings?.is_enabled ? t("paymentMethods.yes") : t("paymentMethods.no"),
        hint: bitcart?.unreadable
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
    description: t("paymentMethods.bitcart.requisitesDescription"),
    editTo: "edit",
    rows: [
      { id: "server_url", label: t("bitcart.fields.server_url"), value: settings?.server_url, mono: true },
      { id: "admin_url", label: t("bitcart.fields.admin_url"), value: settings?.admin_url, mono: true },
      { id: "store_id", label: t("paymentMethods.bitcart.storeId"), value: settings?.store_id, mono: true },
      {
        id: "api_key",
        label: t("paymentMethods.accessKey"),
        value: settings?.api_key?.set
          ? t("paymentMethods.masked", { last4: settings.api_key.last4 ?? "" })
          : t("paymentMethods.notSet"),
      },
    ],
  }

  const refundSection: SettingsSection = {
    id: "refunds",
    title: t("bitcart.refundTitle"),
    description: t("bitcart.refundHint"),
    actions: [],
    rows: [],
  }

  const notificationSection: SettingsSection = {
    id: "notifications",
    title: t("bitcart.notificationTitle"),
    description: bitcart?.notification_url ? t("bitcart.notificationHint") : t("bitcart.notificationOff"),
    actions: [],
    rows: bitcart?.notification_url
      ? [
          {
            id: "notification_url",
            label: t("paymentMethods.bitcart.notificationUrl"),
            value: <AddressValue value={bitcart.notification_url} testId="bitcart-notification-url" />,
          },
        ]
      : [],
  }

  return (
    <SettingsDetail
      isPending={isPending || preNotice.isPending}
      sections={[stateSection, requisitesSection, preNotice.section, refundSection, notificationSection]}
    />
  )
}
