import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import type { SettingsRow, SettingsSection } from "../../../../components/settings"
import {
  EMPTY_PRE_NOTICE_ENTRY,
  type PaymentPreNoticeProviderKey,
  useTenantPaymentPreNotice,
} from "../../../../hooks/api/payment-pre-notice"
import { prePaymentNoticeShownWhen, prePaymentNoticeText } from "../../../../lib/payment-pre-notice"

/**
 * «Уведомление перед оплатой» (rule 5zd, t-2026-10-03-32).
 *
 * t-2026-10-14-01 (panel redesign, G3): no longer one card with a «Способ
 * оплаты» select under the payment forms. Every method that takes the buyer
 * off the site or charges in another currency gets this section on its own
 * card (design-system rule 17): what the buyer reads, ready-made, and when.
 * The edit is the shared drawer `…/pre-notice/edit` (`PaymentPreNoticeEdit`),
 * the method fixed by the card it hangs under. Tribute, BTCPay, Bitcart and
 * the transfer by requisites carry it; Robokassa only while its stored entry
 * says something (the audit took the section off a rouble method on the site,
 * and an entry the owner already wrote must stay readable and erasable);
 * «Иностранная карта» has no card while the checkout has no such method.
 */
export const usePreNoticeSection = (providerKey: PaymentPreNoticeProviderKey) => {
  const { t } = useTranslation()
  const { paymentPreNotice, isPending, isError, error } = useTenantPaymentPreNotice()

  if (isError) {
    throw error
  }

  const entry = paymentPreNotice?.[providerKey] ?? EMPTY_PRE_NOTICE_ENTRY
  const text = prePaymentNoticeText(entry, t)
  const when = prePaymentNoticeShownWhen(entry)
  const currency = entry.charge_currency_code?.trim().toUpperCase() ?? ""

  const rows: SettingsRow[] = [
    {
      id: "pre-notice-text",
      label: t("paymentMethods.preNotice.buyerSees"),
      value:
        text === null ? (
          when === "currency" ? (
            t("paymentMethods.preNotice.notForRub")
          ) : (
            t("paymentMethods.preNotice.notSet")
          )
        ) : (
          <Text
            size="small"
            className="bg-ui-bg-subtle text-pretty rounded-md px-3 py-2"
            data-testid="pre-notice-preview"
          >
            {text || t("paymentMethods.preNotice.onlyIntro")}
          </Text>
        ),
    },
  ]

  if (when !== "never") {
    rows.push({
      id: "pre-notice-when",
      label: t("paymentMethods.preNotice.shown"),
      value:
        when === "always"
          ? t("paymentMethods.preNotice.shownAlways")
          : t("paymentMethods.preNotice.shownCurrency", { currency }),
      hint: when === "currency" ? t("paymentMethods.preNotice.shownCurrencyHint", { currency }) : undefined,
    })
  }

  const section: SettingsSection = {
    id: "pre-notice",
    title: t("paymentMethods.preNotice.title"),
    description: t("paymentMethods.preNotice.description"),
    editTo: "pre-notice/edit",
    rows,
  }

  return { section, isSet: when !== "never", isPending }
}
