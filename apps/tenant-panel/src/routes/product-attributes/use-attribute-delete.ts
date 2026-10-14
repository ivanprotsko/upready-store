import { toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { ProductAttribute, useDeleteProductAttribute } from "../../hooks/api/product-attributes"

// t-2026-10-14-01 (panel redesign, G2): «Удалить» of a characteristic, for the
// row's «…» in the list and for the card's «…» (panel-ds E6, rule 8). The
// prompt names it and says what goes with it: its values on every product and
// its filter in the catalog.

export const useAttributeDelete = (attribute: Pick<ProductAttribute, "id" | "name">) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { mutateAsync: remove } = useDeleteProductAttribute(attribute.id)

  /** Resolves `true` once the characteristic is gone, `false` when cancelled or refused. */
  return async (): Promise<boolean> => {
    const confirmed = await prompt({
      title: t("productAttributes.delete.title"),
      description: t("productAttributes.delete.description", { name: attribute.name }),
      confirmText: t("actions.delete"),
      cancelText: t("actions.cancel"),
      variant: "danger",
    })
    if (!confirmed) {
      return false
    }
    try {
      await remove(undefined)
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : t("general.error"))
      return false
    }
    toast.success(t("productAttributes.delete.success"))
    return true
  }
}
