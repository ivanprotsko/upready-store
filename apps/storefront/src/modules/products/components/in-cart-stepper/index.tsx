"use client"

import { deleteLineItem, updateLineItem } from "@lib/data/cart"
import { Link } from "@i18n/navigation"
import { Minus, Plus } from "@medusajs/icons"
import { useTranslations } from "next-intl"
import { useEffect, useState, type ReactNode } from "react"

import { applyStep, cartStep, type CartLine } from "./logic"

const STEP_BUTTON =
  "grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-ui-button-inverted-hover disabled:opacity-50 focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-contrast-fg-primary"

/**
 * BRANCH-LOCAL (`redesign-olavka`, t-2026-09-24-n15, Ivan's remark 24): once the variant is
 * in the cart, its «В корзину» button turns into «В КОРЗИНЕ − N +», after chrxnasdmds'
 * `grid-add-to-cart.tsx` and Ivan's reference (a filled pill: «В КОРЗИНЕ» left, − N +
 * right). The pill takes the add button's place, size and fill (`ui-button-inverted`), so
 * nothing moves; «В КОРЗИНЕ» opens the cart.
 *
 * `line` is the cart line as the server last rendered it. «+» / «−» change it at once
 * (optimistic) and send the request; the cart requests revalidate the cart, so the page —
 * this line and the header's count with it — comes back from the server with the truth,
 * and a failed request falls back to it. «−» on 1 removes the line, and `addButton` is shown
 * again. With no line the caller's own `addButton` is rendered, untouched.
 */
export default function InCartStepper({
  line: serverLine,
  max = Infinity,
  addButton,
  className = "",
  "data-testid": testId = "in-cart-stepper",
}: {
  line: CartLine | null
  /** The most the cart may hold (`maxQuantity`): «+» stops there. */
  max?: number
  addButton: ReactNode
  className?: string
  "data-testid"?: string
}) {
  const t = useTranslations("ProductActions")
  const [line, setLine] = useState(serverLine)
  const [busy, setBusy] = useState(false)

  // The server's line after every cart request (the requests revalidate the cart).
  useEffect(() => {
    setLine(serverLine)
  }, [serverLine])

  if (!line) {
    return <>{addButton}</>
  }

  const press = async (delta: 1 | -1) => {
    const step = cartStep(line, delta, max)
    if (busy || step.kind === "none" || step.kind === "add") return
    setBusy(true)
    setLine(applyStep(line, step))
    try {
      if (step.kind === "remove") await deleteLineItem(step.lineId)
      else await updateLineItem({ lineId: step.lineId, quantity: step.quantity })
    } catch {
      setLine(serverLine)
    } finally {
      setBusy(false)
    }
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
          onClick={() => press(-1)}
          disabled={busy}
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
          {line.quantity}
        </span>
        <button
          type="button"
          onClick={() => press(1)}
          disabled={busy || line.quantity >= max}
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
