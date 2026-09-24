"use client"

import type {
  ManualPaymentKind,
  ManualPaymentWallet,
} from "@lib/tenant/manual-payment"
import { ChatBubble, CurrencyDollar } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import { useTranslations } from "next-intl"
import Image from "next/image"

/** The marks the storefront ships for the assets a shop may take; any other currency prints its code. */
const CRYPTO_LOGOS: Record<string, string> = {
  USDT: "/payment/usdt.svg",
  USDC: "/payment/usdc.svg",
}

type Props = {
  /** The kinds this shop offers, from `availableManualPaymentKinds`; never rendered with fewer than one. */
  kinds: ManualPaymentKind[]
  /** The shop's wallets, for the asset marks under the crypto option. */
  wallets: ManualPaymentWallet[]
  value: ManualPaymentKind | null
  onChange: (kind: ManualPaymentKind) => void
}

/**
 * Which of the shop's offline ways to pay the buyer takes (olavka-payments):
 * a crypto transfer or «card via manager». Both run on `pp_system_default`,
 * so the provider strip above shows one method and this radio group is the
 * choice inside it. Only the kinds the owner enabled in the panel are here.
 */
const ManualPaymentKindSelect = ({ kinds, wallets, value, onChange }: Props) => {
  const t = useTranslations("ManualPayment")
  const currencies = Array.from(new Set(wallets.map((wallet) => wallet.currency)))

  const spec: Record<
    ManualPaymentKind,
    { title: string; description: string; icon: React.ReactNode }
  > = {
    crypto: {
      title: t("cryptoTitle"),
      description: t("cryptoDesc"),
      icon: <CurrencyDollar className="text-ui-fg-subtle" />,
    },
    other: {
      title: t("otherTitle"),
      description: t("otherDesc"),
      icon: <ChatBubble className="text-ui-fg-subtle" />,
    },
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("kindHeading")}
      className="flex flex-col gap-y-2"
      data-testid="manual-payment-kinds"
    >
      {kinds.map((kind) => {
        const active = value === kind
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(kind)}
            data-testid={`manual-payment-kind-${kind}`}
            className={clx(
              "w-full rounded-[6px] border bg-ui-bg-base p-4 text-start transition-colors",
              active
                ? "border-ui-border-interactive"
                : "border-ui-border-base hover:border-ui-border-interactive/50"
            )}
          >
            <div className="flex items-start gap-x-3">
              <span
                aria-hidden
                className={clx(
                  "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  active ? "border-ui-fg-interactive" : "border-ui-border-strong"
                )}
              >
                {active && (
                  <span className="block h-2 w-2 rounded-full bg-ui-fg-interactive" />
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-y-1">
                <span className="txt-compact-medium-plus text-ui-fg-base">
                  {spec[kind].title}
                </span>
                <span className="txt-compact-small text-ui-fg-subtle">
                  {spec[kind].description}
                </span>
                {kind === "crypto" && currencies.length > 0 && (
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {currencies.map((currency) =>
                      CRYPTO_LOGOS[currency] ? (
                        <Image
                          key={currency}
                          src={CRYPTO_LOGOS[currency]}
                          alt={currency}
                          width={24}
                          height={24}
                          className="h-6 w-6"
                        />
                      ) : (
                        <span
                          key={currency}
                          className="txt-compact-xsmall-plus rounded-full border border-ui-border-base px-2 py-0.5 text-ui-fg-subtle"
                        >
                          {currency}
                        </span>
                      )
                    )}
                  </span>
                )}
              </div>
              <span className="mt-0.5 shrink-0" aria-hidden>
                {spec[kind].icon}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default ManualPaymentKindSelect
