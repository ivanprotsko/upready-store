import { clx } from "@medusajs/ui"

/**
 * The table's shared classes. A plain module, not `order-cell.tsx`: what a server component
 * imports from a `"use client"` file is a client reference, not the string.
 */

export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"

/** 44 px on a phone and a tablet (QR-HIT), 36 px in the desktop table's denser rows. */
export const CONTROL = "h-11 small:h-9"

/** The primary button, «В корзину»: the table's one filled control. */
export const BUTTON = clx(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius)] border px-4 text-base font-medium transition-opacity hover:opacity-90 motion-reduce:transition-none small:text-sm",
  "border-[var(--layer-button-border,var(--primary))] bg-[var(--layer-button-bg,var(--primary))] text-[var(--layer-button-fg,var(--primary-foreground))]",
  CONTROL,
  focusRing
)

/**
 * The outlined cell for a row that cannot go to the cart from the table: «Выбрать» (a link to
 * the product) and «Нет в наличии» (disabled, muted). The fill stays «В корзину»'s alone.
 */
export const QUIET = clx(
  "inline-flex w-full items-center justify-center whitespace-nowrap rounded-[var(--radius)] border border-[var(--border)] px-4 text-base font-medium min-[600px]:w-auto small:text-sm",
  CONTROL
)

/** A SKU in capitals at 12 px is tracked (QR-CASE). */
export const SKU = "tabular-nums tracking-[0.08em]"
