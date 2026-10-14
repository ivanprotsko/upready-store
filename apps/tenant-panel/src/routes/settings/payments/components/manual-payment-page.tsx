import { useTranslation } from "react-i18next"

import { SingleColumnPageSkeleton } from "../../../../components/common/skeleton"
import { SingleColumnPage } from "../../../../components/layout/pages"
import { SettingsDetailSection, type SettingsSection } from "../../../../components/settings"
import { useTenantManualPayment } from "../../../../hooks/api/manual-payment"
import { offersNothing } from "../../../../lib/payment-requisites"
import { WAY_STATE_COLOR, type WayState, wayStateKey } from "../payment-ways"
import { ManualRequisitesCard } from "./manual-payment-card"
import { usePreNoticeSection } from "./payment-pre-notice-card"

/**
 * «Перевод по реквизитам» (olavka-payments): the buyer places the order
 * without paying on the site, transfers the money by the shop's requisites
 * and attaches the receipt; the order stays «awaiting payment» until the
 * owner confirms it under the order's payment.
 *
 * t-2026-10-14-01 (panel redesign, G3, line us-8, prototype states
 * `payments-manual`, `payments-manual-empty`, `payments-manual-requisite-edit`):
 * the card of the method reads, in the prototype's order (rule 17): the state
 * («Принимать переводы», drawer `edit`) → «Реквизиты» (the list with «…»,
 * drawers `bank/create`, `crypto/create`, `requisites/:requisiteId/edit`) →
 * «Связаться с менеджером» (drawer `contacts/edit`) → the notice before
 * payment (the shared drawer `pre-notice/edit`). Each drawer sends only what
 * it names; the backend keeps the rest. Nothing the old card did is lost:
 * the switch, the list, its order, the add / change / remove of an item and
 * the contacts each moved to a drawer or a «…».
 */
export const ManualPaymentPage = () => {
  const { t } = useTranslation()
  const { manualPayment, isPending, isError, error } = useTenantManualPayment()
  const preNotice = usePreNoticeSection("manual")

  if (isError) {
    throw error
  }

  if (isPending || preNotice.isPending || !manualPayment) {
    return <SingleColumnPageSkeleton sections={4} />
  }

  const { enabled, contacts } = manualPayment
  const state: WayState = enabled ? "connected" : "off"
  const nothingToOffer = offersNothing({ ...manualPayment, enabled: true })

  const stateSection: SettingsSection = {
    id: "manual",
    title: t("paymentMethods.ways.manual.title"),
    description: t("paymentMethods.manual.intro"),
    status: { color: WAY_STATE_COLOR[state], label: t(wayStateKey(state)) },
    editTo: "edit",
    rows: [
      {
        id: "enabled",
        label: t("paymentMethods.manual.enabled"),
        value: enabled ? t("paymentMethods.yes") : t("paymentMethods.no"),
        hint: enabled
          ? t("paymentMethods.manual.enabledHint")
          : nothingToOffer
            ? t("paymentMethods.manual.offHint")
            : undefined,
      },
    ],
  }

  const contactsSection: SettingsSection = {
    id: "contacts",
    title: t("manualPayment.contacts.title"),
    description: t("manualPayment.contacts.hint"),
    editTo: "contacts/edit",
    rows: [
      { id: "whatsapp", label: t("manualPayment.contacts.whatsapp"), value: contacts.whatsapp },
      {
        id: "telegram",
        label: t("manualPayment.contacts.telegram"),
        value: contacts.telegram ? `@${contacts.telegram}` : null,
      },
      { id: "email", label: t("manualPayment.contacts.email"), value: contacts.email },
      { id: "note", label: t("manualPayment.contacts.note"), value: contacts.note },
    ],
  }

  return (
    <SingleColumnPage widgets={{ before: [], after: [] }} hasOutlet>
      <SettingsDetailSection section={stateSection} level="h1" />
      <ManualRequisitesCard record={manualPayment} />
      <SettingsDetailSection section={contactsSection} />
      <SettingsDetailSection section={preNotice.section} />
    </SingleColumnPage>
  )
}
