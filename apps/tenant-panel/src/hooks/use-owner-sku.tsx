import { useCallback } from "react"
import { useTranslation } from "react-i18next"

import { useMe } from "./api/users"

/**
 * The article code the way the owner knows it (o21-owner-panel-ux, glossary
 * «артикул»). The platform keeps codes unique across shops by adding the shop's
 * own name to the end (`PL-09-CHERKASHINO`); she never typed that tail, so the
 * screen shows `PL-09`. Only a tail equal to her shop's handle is cut, a code
 * that merely ends in capital letters stays as it is.
 */
export const useOwnerSku = () => {
  const { t } = useTranslation()
  const { user } = useMe()
  const handle = user?.tenant?.handle ?? ""

  const short = useCallback(
    (sku: string) => {
      const tail = `-${handle}`
      return handle && sku.toLowerCase().endsWith(tail.toLowerCase())
        ? sku.slice(0, -tail.length)
        : sku
    },
    [handle]
  )

  return {
    short,
    /** «Артикул PL-09» */
    labelled: (sku: string) => t("fields.skuLabelled", { sku: short(sku) }),
  }
}
