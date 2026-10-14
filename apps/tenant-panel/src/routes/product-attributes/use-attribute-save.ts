import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import {
  ProductAttributeBody,
  ProductAttributeResponse,
  useProductAttribute,
  useUpdateProductAttribute,
} from "../../hooks/api/product-attributes"
import { useTenantLocaleSettings } from "../../hooks/api/locale-settings"
import { attributeBody } from "./attribute-model"

// t-2026-10-14-01 (panel redesign, G2): the one save of the card's three
// drawers (`edit`, `translations/edit`, `values/edit`). Each sends the saved
// record with its own fields on top (`attributeBody`); the toast names the
// product values a save cleared, as the old single form did.

export const useAttributeSave = () => {
  const { t } = useTranslation()
  const { id } = useParams()
  const { product_attribute: attribute, isPending, isError, error } = useProductAttribute(id!)
  const { mutateAsync } = useUpdateProductAttribute(id!)

  if (isError) {
    throw error
  }

  const save = (patch: Partial<ProductAttributeBody>) =>
    mutateAsync(attributeBody(attribute!, patch, t("productAttributes.values.starter")))

  const savedMessage = (result: unknown) => {
    const cleared = (result as ProductAttributeResponse | undefined)?.cleared_values ?? 0
    return cleared
      ? t("productAttributes.savedCleared", { count: cleared })
      : t("productAttributes.saved")
  }

  return { attribute, isPending: isPending || !attribute, save, savedMessage }
}

/** The storefront's languages besides its default: the ones a name is translated into. */
export const useOtherLocales = () => {
  const { locale_settings: settings, isPending } = useTenantLocaleSettings()
  const locales = (settings?.enabled_locales ?? []).filter(
    (code) => code !== settings?.default_locale
  )
  return { locales, isPending }
}
