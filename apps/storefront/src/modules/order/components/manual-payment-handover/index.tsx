import { isManual } from "@lib/constants"
import { getTenantManualPayment } from "@lib/data/tenant-manual-payment"
import { hasManagerContact, readManualPaymentKind } from "@lib/tenant/manual-payment"
import { awaitsPayment } from "@lib/util/buyer-order-status"
import { convertToLocale } from "@lib/util/money"
import { readPaymentReceipt } from "@lib/util/payment-receipt"
import type { HttpTypes } from "@medusajs/types"
import { Heading, Text } from "@medusajs/ui"
import ManagerContactCTA from "@modules/checkout/components/manager-contact-cta"
import PaymentReceiptForm from "@modules/order/components/payment-receipt-form"
import RequisitesList from "@modules/order/components/requisites-list"
import { getLocale, getTranslations } from "next-intl/server"

type Props = {
  order: HttpTypes.StoreOrder
}

export { readPaymentReceipt }

/** Kept for the callers of batch 6; `awaitsPayment` is the one rule now. */
export const awaitsManualPayment = (order: HttpTypes.StoreOrder): boolean => awaitsPayment(order)

/**
 * The «now pay» block on the order page (olavka-payments → batch 7), for an order
 * placed through «Перевод по реквизитам» on `pp_system_default`. The checkout
 * stamped the kind on the cart (`manual_payment_kind`), Medusa copied it onto the
 * order, and this reads it back: ONE list of the shop's requisites — bank cards
 * and crypto wallets in the owner's order, each opening to its number or address
 * with copy buttons — then the receipt form, then the one manager button with a
 * message ready to send.
 *
 * Renders nothing for a real gateway payment (already paid), for a manual order
 * that predates the split (the demo card, no stamp), once the shop confirmed the
 * payment or cancelled the order, and for a shop whose owner has since switched
 * the method off — the requisites and the contacts come from the shop's CURRENT
 * settings, never from the order.
 *
 * Nothing is captured here or anywhere on the storefront: the order stays
 * «awaiting payment» until the owner captures it in the panel.
 */
const ManualPaymentHandover = async ({ order }: Props) => {
  const provider = order.payment_collections?.[0]?.payments?.[0]?.provider_id
  if (!isManual(provider)) {
    return null
  }
  // Batch 6: once the shop confirmed the payment, or the order was cancelled, the
  // «now pay» block, the requisites and «Я оплатил» are gone — the page says the new state.
  if (!awaitsPayment(order)) {
    return null
  }

  const kind = readManualPaymentKind(order.metadata as Record<string, unknown> | null | undefined)
  if (!kind) {
    return null
  }

  const manualPayment = await getTenantManualPayment()
  const requisites = manualPayment.requisites
  const contacts = manualPayment.contacts
  const showContacts = hasManagerContact(contacts)

  if (!manualPayment.enabled || (requisites.length === 0 && !showContacts)) {
    return null
  }

  const receipt = readPaymentReceipt(order.metadata as Record<string, unknown> | null | undefined)

  const [t, locale] = await Promise.all([getTranslations("ManualPayment"), getLocale()])

  const orderNumber = String(order.display_id ?? order.id)
  const total = convertToLocale({
    amount: order.total,
    currency_code: order.currency_code,
    locale,
  })
  const values = { orderNumber, total }

  return (
    <div
      className="flex flex-col gap-y-4 rounded-[8px] border border-ui-border-base bg-ui-bg-subtle p-4 small:p-6"
      data-testid="manual-payment-handover"
    >
      <Heading level="h2" className="text-xl-semi text-ui-fg-base">
        {t(requisites.length > 0 ? "handoverRequisitesTitle" : "handoverTitle")}
      </Heading>
      <Text className="txt-medium text-ui-fg-subtle">
        {t(requisites.length > 0 ? "handoverRequisitesBody" : "handoverBody", values)}
      </Text>

      {requisites.length > 0 && <RequisitesList requisites={requisites} />}

      {contacts.note && (
        <Text className="txt-medium text-ui-fg-base" data-testid="manager-note">
          {contacts.note}
        </Text>
      )}

      {requisites.length > 0 && (
        <PaymentReceiptForm orderId={order.id} sent={receipt.sent} rejected={receipt.rejected} />
      )}

      <div className="flex flex-col gap-y-2" data-testid="manager-contact-block">
        {/* Ivan 03.10: «Комментарий "связаться с менеджером" для подтверждения заказа».
            The sentence always; the button only when the owner entered a contact in
            the panel (live has none today) — never a dead button or an empty link. */}
        <Text className="txt-compact-small text-ui-fg-subtle" data-testid="manager-contact-hint">
          {t("contactManagerHint")}
        </Text>
        {showContacts && (
          <ManagerContactCTA
            variant="single"
            contacts={contacts}
            message={t(requisites.length > 0 ? "handoverRequisitesMessage" : "handoverMessage", values)}
            emailSubject={t("emailSubject", { orderNumber })}
          />
        )}
      </div>

      <Text className="txt-compact-small text-ui-fg-subtle">{t("handoverClosedNote")}</Text>
    </div>
  )
}

export default ManualPaymentHandover
