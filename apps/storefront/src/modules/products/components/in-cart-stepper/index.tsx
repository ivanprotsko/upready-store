"use client"

import { Link } from "@i18n/navigation"
import { Minus, Plus } from "@medusajs/icons"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

const STEP_BUTTON =
  "grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-ui-button-inverted-hover disabled:opacity-50 focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-contrast-fg-primary"

/**
 * BRANCH-LOCAL (`redesign-olavka`, t-2026-09-24-n15, Ivan's remark 24): once the variant is
 * in the cart, its «В корзину» button turns into «В КОРЗИНЕ − N +», after chrxnasdmds'
 * `grid-add-to-cart.tsx` and Ivan's reference (a filled pill: «В КОРЗИНЕ» left, − N +
 * right). The pill takes the add button's place, size and fill (`ui-button-inverted`), so
 * nothing moves; «В КОРЗИНЕ» opens the cart.
 *
 * `quantity` is the variant's quantity as the client cart queue shows it
 * (t-2026-10-03-66), and `onStep` changes it there: the number moves on every click,
 * however fast, and the queue sends the result after a pause. Nothing here waits for the
 * server or disables itself meanwhile. «−» on 1 removes the line and `addButton` is shown
 * again; «+» stops at `max`. At 0 the caller's own `addButton` is rendered, untouched.
 */
export default function InCartStepper({
  quantity,
  max = Infinity,
  onStep,
  addButton,
  className = "",
  "data-testid": testId = "in-cart-stepper",
}: {
  quantity: number
  /** The most the cart may hold (`maxQuantity`): «+» stops there. */
  max?: number
  onStep: (delta: 1 | -1) => void
  addButton: ReactNode
  className?: string
  "data-testid"?: string
}) {
  const t = useTranslations("ProductActions")

  if (quantity <= 0) {
    return <>{addButton}</>
  }

  return (
    <div
      role="group"
      aria-label={t("inCart")}
      className={`flex h-10 w-full items-center rounded-full bg-ui-button-inverted text-ui-contrast-fg-primary shadow-buttons-inverted txt-compact-medium-plus ${className}`}
      data-testid={testId}
    >
      <Link
        href="/cart"
        className="flex h-full min-w-0 flex-1 items-center truncate rounded-full pl-5 uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-contrast-fg-primary"
        data-testid={`${testId}-cart-link`}
      >
        {t("inCart")}
      </Link>
      <div className="flex shrink-0 items-center gap-x-1 pr-1">
        <button
          type="button"
          onClick={() => onStep(-1)}
          aria-label={t("decreaseQuantity")}
          className={STEP_BUTTON}
          data-testid={`${testId}-decrease`}
        >
          <Minus />
        </button>
        <span
          aria-live="polite"
          className="min-w-[1.5rem] text-center tabular-nums"
          data-testid={`${testId}-quantity`}
        >
          {quantity}
        </span>
        <button
          type="button"
          onClick={() => quantity < max && onStep(1)}
          disabled={quantity >= max}
          aria-label={t("increaseQuantity")}
          className={STEP_BUTTON}
          data-testid={`${testId}-increase`}
        >
          <Plus />
        </button>
      </div>
    </div>
  )
}
