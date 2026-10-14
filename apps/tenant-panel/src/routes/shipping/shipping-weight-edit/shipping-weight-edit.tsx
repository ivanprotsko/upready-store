import { Input } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { SettingsEditDrawer } from "../../../components/settings"
import {
  useShippingMethods,
  useUpdateShippingSettings,
} from "../../../hooks/api/shipping-methods"
import { isDefaultWeight } from "../labels"

// t-2026-10-14-01 (panel redesign, G2, prototype state `shipping-weight-edit`):
// the default product weight, whose field and «Сохранить» used to stand on
// /shipping itself, now in the drawer of its section's «…» → «Изменить». The
// long hint about setting product weights moved here, next to the field.

export const ShippingWeightEdit = () => {
  const { t } = useTranslation()
  const { settings, isPending, isError, error } = useShippingMethods()
  const { mutateAsync } = useUpdateShippingSettings()

  if (isError) {
    throw error
  }

  // The field is a string (an <input type="number"> yields one) and is parsed
  // once on save, the way the method form keeps its numbers.
  const schema = zod.object({
    grams: zod.string().refine(isDefaultWeight, t("shippingMethods.weight.invalid")),
  })

  return (
    <SettingsEditDrawer
      title={t("shippingMethods.weight.title")}
      isPending={isPending || !settings}
      schema={schema}
      defaultValues={{ grams: String(settings?.default_weight_g ?? "") }}
      onSubmit={(values) => mutateAsync({ default_weight_g: Number(values.grams) })}
      successMessage={t("shippingMethods.weight.saved")}
    >
      {(form) => (
        <Form.Field
          control={form.control}
          name="grams"
          render={({ field }) => (
            <Form.Item>
              <Form.Label>{t("shippingMethods.weight.label")}</Form.Label>
              <Form.Control>
                <Input {...field} type="number" min={1} max={100000} step={1} className="w-40" />
              </Form.Control>
              <Form.Hint>{t("shippingMethods.weight.hint")}</Form.Hint>
              <Form.ErrorMessage />
            </Form.Item>
          )}
        />
      )}
    </SettingsEditDrawer>
  )
}
