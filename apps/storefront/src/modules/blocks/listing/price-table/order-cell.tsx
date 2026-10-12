"use client"

import type { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"
import { Minus, Plus } from "lucide-react"
import { useEffect, useState } from "react"

import { useCartQueue } from "@lib/cart-store"
import { draftLineFor } from "@lib/cart-store/draft"

import type { OrderLine } from "./rows"
import { BUTTON, CONTROL, focusRing } from "./styles"

/** The table's words for this cell, already in the visitor's language. */
export type OrderCellLabels = {
  quantity: string
  decrease: string
  increase: string
  addToCart: string
  added: string
}

const STEP = clx(
  "inline-flex w-11 shrink-0 items-center justify-center text-[var(--foreground)] transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none small:w-9",
  CONTROL,
  focusRing
)

/** How long «Добавлено» stays on the button after an add. */
const ADDED_MS = 2000

/** The typed quantity as a whole number from 1 to `max`; anything else falls back to 1. */
export function clampQuantity(typed: string, max: number | null): number {
  const value = Number.parseInt(typed, 10)
  if (!Number.isFinite(value) || value < 1) return 1
  return max === null ? value : Math.min(value, Math.max(1, max))
}

/**
 * The order cell of a row with one variant that can be bought: a quantity stepper, at least 1
 * and at most the stock when the shop counts it, and «В корзину». The add goes through the
 * client cart queue exactly as `AddToBagButton` sends it (`useCartQueue().add` with
 * `draftLineFor`), so the header's count moves on the click and the request follows; the
 * button says «Добавлено» for two seconds, and a screen reader hears it once.
 *
 * The cell is a group named after the product, so «Меньше», «Больше» and «В корзину» are
 * heard with the row they belong to.
 */
export default function OrderCell({
  line,
  productTitle,
  labels,
}: {
  line: OrderLine
  productTitle: string
  labels: OrderCellLabels
}) {
  const queue = useCartQueue()
  const [typed, setTyped] = useState("1")
  const [added, setAdded] = useState(false)
  const quantity = clampQuantity(typed, line.max)

  useEffect(() => {
    if (!added) return
    const timer = window.setTimeout(() => setAdded(false), ADDED_MS)
    return () => window.clearTimeout(timer)
  }, [added])

  const step = (delta: 1 | -1) => setTyped(String(clampQuantity(String(quantity + delta), line.max)))

  const add = () => {
    setTyped(String(quantity))
    queue.add(
      line.variant.id,
      quantity,
      draftLineFor(line.product as HttpTypes.StoreProduct, line.variant as HttpTypes.StoreProductVariant)
    )
    setAdded(true)
  }

  return (
    <div role="group" aria-label={productTitle} className="flex flex-wrap items-center gap-2">
      <div
        data-role="quantity-input"
        className="inline-flex shrink-0 items-center rounded-[var(--radius)] border border-[var(--border)]"
      >
        <button
          type="button"
          aria-label={labels.decrease}
          disabled={quantity <= 1}
          onClick={() => step(-1)}
          className={STEP}
        >
          <Minus aria-hidden className="size-4" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={labels.quantity}
          value={typed}
          onChange={(event) => setTyped(event.target.value.replace(/\D/g, "").slice(0, 4))}
          onBlur={() => setTyped(String(quantity))}
          className={clx(
            "w-12 min-w-0 bg-transparent text-center text-base tabular-nums text-[var(--foreground)] small:w-10 small:text-sm",
            CONTROL,
            focusRing
          )}
        />
        <button
          type="button"
          aria-label={labels.increase}
          disabled={line.max !== null && quantity >= line.max}
          onClick={() => step(1)}
          className={STEP}
        >
          <Plus aria-hidden className="size-4" />
        </button>
      </div>
      <button type="button" data-role="cta-primary" onClick={add} className={clx(BUTTON, "min-w-0 flex-1 small:flex-none")}>
        {/* Both words in one cell, the hidden one invisible, so the button keeps the longer one's
            width and its name is the word it shows. */}
        <span className="grid">
          <span className={clx("col-start-1 row-start-1", added && "invisible")}>{labels.addToCart}</span>
          <span className={clx("col-start-1 row-start-1", !added && "invisible")}>{labels.added}</span>
        </span>
      </button>
      <span className="sr-only" aria-live="polite">
        {added ? labels.added : ""}
      </span>
    </div>
  )
}
