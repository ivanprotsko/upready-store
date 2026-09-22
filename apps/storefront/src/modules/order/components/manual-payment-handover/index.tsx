import { isManual } from "@lib/constants"
import { getTenantManualPayment } from "@lib/data/tenant-manual-payment"
import { readManualPaymentKind } from "@lib/tenant/manual-payment"
import { convertToLocale } from "@lib/util/money"
import type { HttpTypes } from "@medusajs/types"
import { Heading, Text } from "@medusajs/ui"
import ManagerContactCTA from "@modules/checkout/components/manager-contact-cta"
import { WalletCard } from "@modules/checkout/components/manual-payment-instructions"
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
const ManualPaymentHandover = async ({ order }: Props) => {
  const provider = order.payment_collections?.[0]?.payments?.[0]?.provider_id
  if (!isManual(provider)) {
    return null
  }

  const kind = readManualPaymentKind(
    order.metadata as Record<string, unknown> | null | undefined
  )
  if (!kind) {
    return null
  }

  const manualPayment = await getTenantManualPayment()
  const wallets = kind === "crypto" ? manualPayment.crypto.wallets : []
  const contacts = manualPayment.manager
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
        {t(kind === "crypto" ? "handoverCryptoTitle" : "handoverTitle")}
      </Heading>
      <Text className="txt-medium text-ui-fg-subtle">
        {t(kind === "crypto" ? "handoverCryptoBody" : "handoverBody", values)}
      </Text>

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

      {showContacts && (
        <ManagerContactCTA
          variant="full"
          contacts={contacts}
          message={t(kind === "crypto" ? "handoverCryptoMessage" : "handoverMessage", values)}
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
