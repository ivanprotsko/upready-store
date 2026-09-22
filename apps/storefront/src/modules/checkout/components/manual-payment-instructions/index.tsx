"use client"

import type {
  ManualPaymentKind,
  ManualPaymentWallet,
  TenantManualPayment,
} from "@lib/tenant/manual-payment"
import { Check, SquareTwoStack } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import ManagerContactCTA from "@modules/checkout/components/manager-contact-cta"
import { useTranslations } from "next-intl"
import Image from "next/image"
import { useState } from "react"

/**
 * The QR is rendered by a public service from the address alone; the address
 * is already on the page in clear text next to it, so nothing leaves the
 * browser that the buyer does not see. `unoptimized`, because the image is
 * generated per address and Next's optimizer would only add a hop.
 */
const qrSrc = (data: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=176x176&margin=0&data=${encodeURIComponent(data)}`

export const WalletCard = ({ wallet }: { wallet: ManualPaymentWallet }) => {
  const t = useTranslations("ManualPayment")
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(wallet.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // The clipboard is unavailable outside a secure context; the address is
      // still on screen to select by hand.
    }
  }

  return (
    <div
      className="flex flex-row gap-x-4 rounded-[6px] border border-ui-border-base bg-ui-bg-base p-4"
      data-testid={`wallet-${wallet.currency}`}
    >
      <Image
        src={qrSrc(wallet.address)}
        alt={t("qrAlt", { currency: wallet.currency })}
        width={88}
        height={88}
        unoptimized
        className="h-[88px] w-[88px] shrink-0 rounded-[4px] bg-white"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-y-2">
        <span className="txt-compact-medium-plus text-ui-fg-base">
          {wallet.currency}{" "}
          <span className="text-ui-fg-subtle">({wallet.network})</span>
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={t("walletCopyLabel", { currency: wallet.currency })}
          data-testid={`wallet-copy-${wallet.currency}`}
          className={clx(
            "group flex w-full flex-row items-center gap-x-3 rounded-[4px] border border-ui-border-base bg-ui-bg-subtle px-3 py-2 text-start",
            "transition-colors hover:border-ui-border-interactive/50"
          )}
        >
          <code className="min-w-0 flex-1 truncate font-mono txt-compact-small text-ui-fg-base">
            {wallet.address}
          </code>
          <span
            className={clx(
              "inline-flex shrink-0 items-center gap-x-1 whitespace-nowrap rounded-[4px] px-2 py-1 txt-compact-xsmall-plus",
              copied
                ? "bg-ui-tag-green-bg text-ui-tag-green-text"
                : "bg-ui-bg-base text-ui-fg-subtle group-hover:text-ui-fg-base"
            )}
          >
            {copied ? <Check /> : <SquareTwoStack />}
            {copied ? t("copied") : t("copy")}
          </span>
        </button>
      </div>
    </div>
  )
}

type Props = {
  kind: ManualPaymentKind
  manualPayment: TenantManualPayment
}

/**
 * What the buyer sees under the chosen kind, BEFORE the order exists
 * (olavka-payments). Crypto: the shop's wallets to pay to, with a QR and a copy
 * button each, and how the payment gets confirmed. Manager: what happens after
 * the order is placed, the owner's own note, and the contacts to write to now.
 * Every address and contact here came from the shop's panel.
 */
const ManualPaymentInstructions = ({ kind, manualPayment }: Props) => {
  const t = useTranslations("ManualPayment")

  if (kind === "crypto") {
    return (
      <div className="flex flex-col gap-y-3" data-testid="manual-payment-crypto">
        {manualPayment.crypto.wallets.map((wallet) => (
          <WalletCard key={`${wallet.currency}-${wallet.network}`} wallet={wallet} />
        ))}
        <p className="txt-compact-small text-ui-fg-subtle">{t("cryptoConfirm")}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-y-3" data-testid="manual-payment-other">
      <p className="txt-compact-small text-ui-fg-subtle">{t("managerHint")}</p>
      {manualPayment.manager.note && (
        <p className="txt-compact-small text-ui-fg-base" data-testid="manager-note">
          {manualPayment.manager.note}
        </p>
      )}
      <p className="txt-compact-small text-ui-fg-subtle">{t("contactNow")}</p>
      <ManagerContactCTA contacts={manualPayment.manager} />
    </div>
  )
}

export default ManualPaymentInstructions
