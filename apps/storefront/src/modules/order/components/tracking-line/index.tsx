"use client"

import { Check, SquareTwoStack } from "@medusajs/icons"
import { useCopied } from "@modules/order/components/requisites-list"

/**
 * One tracking number as «перевозчик · номер» with a copy button and the carrier's page
 * (D9, t-2026-10-20-61). It reuses the requisites list's copy helper and the shop's own
 * «Copy» / «Copied» strings, so the order page copies the way the payment block does.
 * The strings come as props because `ManualPayment` is shipped to the client only while
 * manual payment is on.
 */
export default function TrackingLine({
  display,
  number,
  url,
  labels,
}: {
  display: string
  number: string
  url: string | null
  /** Read on the server: this client file asks for no message section of its own. */
  labels: { copy: string; copied: string; track: string }
}) {
  const { copied, copy } = useCopied(number)

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="order-tracking-line">
      <span className="txt-compact-medium-plus text-ui-fg-base tabular-nums" data-testid="order-tracking-number">
        {display}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={labels.copy}
        className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-ui-fg-muted hover:text-ui-fg-base focus-visible:shadow-borders-focus"
        data-testid="order-tracking-copy"
        data-copied={copied ? "true" : undefined}
      >
        {copied ? <Check className="text-status-success" /> : <SquareTwoStack />}
      </button>
      <span role="status" className="txt-compact-xsmall-plus text-status-success-text empty:hidden">
        {copied ? labels.copied : ""}
      </span>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover focus-visible:shadow-borders-focus rounded-sm w-fit"
          data-testid="order-tracking-link"
        >
          {labels.track}
        </a>
      )}
    </span>
  )
}
