import { isManual } from "@lib/constants"
import { getTenantManualPayment } from "@lib/data/tenant-manual-payment"
import { readManualPaymentKind } from "@lib/tenant/manual-payment"
import { convertToLocale } from "@lib/util/money"
import type { HttpTypes } from "@medusajs/types"
import { Heading, Text } from "@medusajs/ui"
import ManagerContactCTA from "@modules/checkout/components/manager-contact-cta"
import {
  BankCard,
  WalletCard,
} from "@modules/checkout/components/manual-payment-instructions"
import PaymentReceiptForm from "@modules/order/components/payment-receipt-form"
import { getLocale, getTranslations } from "next-intl/server"

type Props = {
  order: HttpTypes.StoreOrder
}

/**
 * The «now pay» block on the confirmation page (olavka-payments), for an order
 * placed through one of the shop's offline methods on `pp_system_default`. The
 * checkout stamped the kind on the cart (`manual_payment_kind`), Medusa copied
 * it onto the order, and this reads it back: «card via manager» gets the
 * contacts with a message ready to send, crypto gets the wallets again plus
 * the same contacts to confirm the transfer.
 *
 * Renders nothing for a real gateway payment (already paid), for a manual
 * order that predates the split (the demo card, no stamp), and for a shop whose
 * owner has since switched the section off — the contacts and wallets come from
 * the shop's CURRENT settings, never from the order.
 *
 * Nothing is captured here or anywhere on the storefront: the order stays
 * «awaiting payment» until the owner captures it in the panel.
 */
/** `order.metadata.payment_receipt`, as the storefront reads it (batch 6, Q3.3 contract). */
export const readPaymentReceipt = (
  metadata: Record<string, unknown> | null | undefined
): { sent: boolean; rejected: { reason: string | null; at: string | null } | null } => {
  const raw = metadata?.payment_receipt
  if (!raw || typeof raw !== "object") return { sent: false, rejected: null }
  const receipt = raw as Record<string, unknown>
  if (receipt.status === "rejected") {
    return {
      sent: false,
      rejected: {
        reason: typeof receipt.rejected_reason === "string" ? receipt.rejected_reason : null,
        at: typeof receipt.rejected_at === "string" ? receipt.rejected_at : null,
      },
    }
  }
  // No `status` (or any other value): sent and waiting.
  return { sent: true, rejected: null }
}

/** Whether the order still waits for the buyer's payment: nothing captured, not cancelled. */
export const awaitsManualPayment = (order: HttpTypes.StoreOrder): boolean =>
  order.status !== "canceled" &&
  !["captured", "refunded", "partially_refunded"].includes(order.payment_status ?? "")

const ManualPaymentHandover = async ({ order }: Props) => {
  const provider = order.payment_collections?.[0]?.payments?.[0]?.provider_id
  if (!isManual(provider)) {
    return null
  }
  // Batch 6: once the shop confirmed the payment, or the order was cancelled, the
  // «now pay» block, the cards and «Я оплатил» are gone — the page says the new state.
  if (!awaitsManualPayment(order)) {
    return null
  }
  const receipt = readPaymentReceipt(order.metadata as Record<string, unknown> | null | undefined)

  const kind = readManualPaymentKind(
    order.metadata as Record<string, unknown> | null | undefined
  )
  if (!kind) {
    return null
  }

  const manualPayment = await getTenantManualPayment()
  const wallets = kind === "crypto" ? manualPayment.crypto.wallets : []
  const contacts = manualPayment.manager
  // «Card via manager» with the shop's cards: pay to a card first, the manager only if something goes wrong.
  const cards = kind === "other" ? contacts.cards : []
  const showContacts = contacts.enabled || kind === "crypto"

  if (kind === "crypto" && wallets.length === 0 && !contacts.enabled) {
    return null
  }
  if (kind === "other" && !contacts.enabled) {
    return null
  }

  const [t, locale] = await Promise.all([
    getTranslations("ManualPayment"),
    getLocale(),
  ])

  const orderNumber = String(order.display_id ?? order.id)
  const total = convertToLocale({
    amount: order.total,
    currency_code: order.currency_code,
    locale,
  })
  const values = { orderNumber, total }

  return (
    <div
      className="flex flex-col gap-y-4 rounded-[8px] border border-ui-border-base bg-ui-bg-subtle p-6"
      data-testid="manual-payment-handover"
    >
      <Heading level="h2" className="text-xl-semi text-ui-fg-base">
        {t(
          kind === "crypto"
            ? "handoverCryptoTitle"
            : cards.length > 0
              ? "handoverCardsTitle"
              : "handoverTitle"
        )}
      </Heading>
      <Text className="txt-medium text-ui-fg-subtle">
        {t(
          kind === "crypto"
            ? "handoverCryptoBody"
            : cards.length > 0
              ? "handoverCardsBody"
              : "handoverBody",
          values
        )}
      </Text>

      {cards.length > 0 && (
        <div className="flex flex-col gap-y-3" data-testid="manual-payment-cards">
          {cards.map((card) => (
            <BankCard key={`${card.bank}-${card.number}`} card={card} />
          ))}
          <PaymentReceiptForm orderId={order.id} sent={receipt.sent} rejected={receipt.rejected} />
        </div>
      )}

      {wallets.length > 0 && (
        <div className="flex flex-col gap-y-3">
          {wallets.map((wallet) => (
            <WalletCard key={`${wallet.currency}-${wallet.network}`} wallet={wallet} />
          ))}
        </div>
      )}

      {contacts.note && kind === "other" && (
        <Text className="txt-medium text-ui-fg-base" data-testid="manager-note">
          {contacts.note}
        </Text>
      )}

      {showContacts && cards.length > 0 && (
        <Text className="txt-compact-small text-ui-fg-subtle">
          {t("cardsManagerFallback")}
        </Text>
      )}

      {showContacts && (
        <ManagerContactCTA
          variant="single"
          contacts={contacts}
          message={t(
            kind === "crypto"
              ? "handoverCryptoMessage"
              : cards.length > 0
                ? "handoverCardsMessage"
                : "handoverMessage",
            values
          )}
          emailSubject={t("emailSubject", { orderNumber })}
        />
      )}

      <Text className="txt-compact-small text-ui-fg-subtle">
        {t("handoverClosedNote")}
      </Text>
    </div>
  )
}

export default ManualPaymentHandover
