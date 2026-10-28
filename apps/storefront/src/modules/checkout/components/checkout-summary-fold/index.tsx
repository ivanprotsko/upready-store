"use client"

import { useState, type ReactNode } from "react"

import ChevronDown from "@modules/common/icons/chevron-down"

/**
 * The order summary's fold on a phone (t-2026-10-20-61 D8): the summary stands at the top
 * of the page as one row, the heading and the total, and opens on a tap. From 1024 px the
 * row is hidden and the summary is always open in the sticky right column. It is the page's
 * existing disclosure pattern (a button with `aria-expanded`), not a new kind.
 */
export default function CheckoutSummaryFold({
  heading,
  total,
  children,
}: {
  heading: string
  total: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-x-3 rounded-lg border border-ui-border-base px-4 py-3 text-start small:hidden"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="checkout-summary-fold"
      >
        <span className="flex items-center gap-x-2 txt-medium-plus">
          {heading}
          <ChevronDown
            size="16"
            className={open ? "rotate-180 transition-transform" : "transition-transform"}
          />
        </span>
        <span className="txt-medium-plus" data-testid="checkout-summary-fold-total">
          {total}
        </span>
      </button>
      <div className={open ? "mt-4 block" : "hidden small:mt-0 small:block"}>{children}</div>
    </div>
  )
}
