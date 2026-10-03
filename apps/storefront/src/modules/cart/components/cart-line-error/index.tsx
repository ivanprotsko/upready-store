"use client"

import { useCartState } from "@lib/cart-store"
import { useTranslations } from "next-intl"

/**
 * Why a variant's quantity just went back (t-2026-10-03-66): the queue sent the
 * buyer's change, the server refused it, and the line now shows the server's quantity
 * again. Shown under the control that made the change until the buyer changes that
 * variant once more. The wording is the storefront's own error catalog, so it reads
 * the same as every other failure.
 */
export default function CartLineError({
  variantId,
  "data-testid": testId = "cart-line-error",
}: {
  variantId: string | null | undefined
  "data-testid"?: string
}) {
  const t = useTranslations("Errors")
  const code = useCartState().errors[variantId ?? ""]

  if (!variantId || !code) {
    return null
  }

  return (
    <div
      role="alert"
      className="pt-2 text-ui-fg-error text-small-regular"
      data-testid={testId}
      data-error-code={code}
    >
      <span>{code === "stock" ? t("insufficientInventory") : t("generic")}</span>
    </div>
  )
}
