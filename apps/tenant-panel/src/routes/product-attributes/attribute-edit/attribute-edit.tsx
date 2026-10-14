import { Hint, Input, Label, Select } from "@medusajs/ui"
import { useMemo } from "react"
import { UseFormReturn, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { SwitchBox } from "../../../components/common/switch-box"
import { SettingsEditDrawer } from "../../../components/settings"
import { useProductCategories } from "../../../hooks/api/categories"
import { ProductAttributeType } from "../../../hooks/api/product-attributes"
import { ATTRIBUTE_TYPES } from "../attribute-labels"
import { ALL_CATALOG } from "../attribute-model"
import { useAttributeSave } from "../use-attribute-save"

// t15-product-attributes: everything the owner can change about ONE
// characteristic but its translations and its values.
//
// t-2026-10-14-01 (panel redesign, G2, prototype state `attribute-edit`): the
// form that stood on the card itself is this drawer, `/product-attributes/:id/edit`.
// `key` stays read-only and says why: a filter address and an import column
// carry it. The unit field stays for numbers (nothing the owner can do today
// is lost). The save sends the whole record (`useAttributeSave`).

type GeneralDraft = {
  name: string
  type: ProductAttributeType
  unit: string
  position: number
  category: string
  show_on_product: boolean
  use_as_filter: boolean
}

const GeneralFields = ({ form, attributeKey }: { form: UseFormReturn<GeneralDraft>; attributeKey: string }) => {
  const { t } = useTranslation()
  const type = useWatch({ control: form.control, name: "type" })
  const { product_categories: categories } = useProductCategories({ limit: 200 })

  return (
    <>
      <Form.Field
        control={form.control}
        name="name"
        render={({ field }) => (
          <Form.Item>
            <Form.Label>{t("productAttributes.fields.name")}</Form.Label>
            <Form.Control>
              <Input {...field} autoComplete="off" />
            </Form.Control>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
      <div className="flex flex-col gap-y-2">
        <Label size="small" weight="plus" htmlFor="attribute_key">
          {t("productAttributes.fields.key")}
        </Label>
        <Input id="attribute_key" value={attributeKey} disabled readOnly className="font-mono" />
        <Hint>{t("productAttributes.fields.keyLocked")}</Hint>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Form.Field
          control={form.control}
          name="type"
          render={({ field: { value, onChange, ref, ...field } }) => (
            <Form.Item>
              <Form.Label>{t("productAttributes.fields.type")}</Form.Label>
              <Form.Control>
                <Select {...field} value={value} onValueChange={onChange}>
                  <Select.Trigger ref={ref}>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {ATTRIBUTE_TYPES.map((option) => (
                      <Select.Item key={option} value={option}>
                        {t(`productAttributes.types.${option}`)}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </Form.Control>
              <Form.ErrorMessage />
            </Form.Item>
          )}
        />
        <Form.Field
          control={form.control}
          name="position"
          render={({ field: { value, onChange, ...field } }) => (
            <Form.Item>
              <Form.Label>{t("productAttributes.fields.position")}</Form.Label>
              <Form.Control>
                <Input
                  {...field}
                  type="number"
                  min={0}
                  value={String(value)}
                  onChange={(event) => onChange(Number(event.target.value) || 0)}
                />
              </Form.Control>
              <Form.ErrorMessage />
            </Form.Item>
          )}
        />
      </div>
      <Hint>{t(`productAttributes.typeHints.${type}`)}</Hint>
      {type === "number" ? (
        <Form.Field
          control={form.control}
          name="unit"
          render={({ field }) => (
            <Form.Item>
              <Form.Label optional>{t("productAttributes.fields.unit")}</Form.Label>
              <Form.Control>
                <Input {...field} autoComplete="off" className="max-w-[160px]" />
              </Form.Control>
              <Form.Hint>{t("productAttributes.fields.unitHint")}</Form.Hint>
              <Form.ErrorMessage />
            </Form.Item>
          )}
        />
      ) : null}
      <Form.Field
        control={form.control}
        name="category"
        render={({ field: { value, onChange, ref, ...field } }) => (
          <Form.Item>
            <Form.Label>{t("productAttributes.fields.category")}</Form.Label>
            <Form.Control>
              <Select {...field} value={value} onValueChange={onChange}>
                <Select.Trigger ref={ref}>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value={ALL_CATALOG}>{t("productAttributes.allCatalog")}</Select.Item>
                  {(categories ?? []).map((category) => (
                    <Select.Item key={category.id} value={category.id}>
                      {category.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </Form.Control>
            <Form.Hint>{t("productAttributes.fields.categoryHint")}</Form.Hint>
            <Form.ErrorMessage />
          </Form.Item>
        )}
      />
      <SwitchBox
        control={form.control}
        name="show_on_product"
        label={t("productAttributes.fields.showOnProductSwitch")}
        description={t("productAttributes.fields.showOnProductHint")}
      />
      <SwitchBox
        control={form.control}
        name="use_as_filter"
        label={t("productAttributes.fields.useAsFilterSwitch")}
        description={t("productAttributes.fields.useAsFilterHint")}
      />
    </>
  )
}

export const AttributeEdit = () => {
  const { t } = useTranslation()
  const { attribute, isPending, save, savedMessage } = useAttributeSave()

  const schema = useMemo(
    () =>
      zod.object({
        name: zod.string().trim().min(1, { message: t("productAttributes.errors.nameRequired") }),
        type: zod.enum(ATTRIBUTE_TYPES as [ProductAttributeType, ...ProductAttributeType[]]),
        unit: zod.string().trim().max(30),
        position: zod.number().int().min(0).max(9999),
        category: zod.string(),
        show_on_product: zod.boolean(),
        use_as_filter: zod.boolean(),
      }),
    [t]
  )

  return (
    <SettingsEditDrawer<GeneralDraft>
      title={t("productAttributes.edit.title")}
      isPending={isPending}
      schema={schema}
      defaultValues={{
        name: attribute?.name ?? "",
        type: attribute?.type ?? "text",
        unit: attribute?.unit ?? "",
        position: attribute?.position ?? 0,
        category: attribute?.category_id ?? ALL_CATALOG,
        show_on_product: attribute?.show_on_product ?? true,
        use_as_filter: attribute?.use_as_filter ?? false,
      }}
      onSubmit={(draft) =>
        save({
          name: draft.name,
          type: draft.type,
          unit: draft.unit.trim() ? draft.unit.trim() : null,
          position: draft.position,
          category_id: draft.category === ALL_CATALOG ? null : draft.category,
          show_on_product: draft.show_on_product,
          use_as_filter: draft.use_as_filter,
        })
      }
      successMessage={savedMessage}
    >
      {(form) => <GeneralFields form={form} attributeKey={attribute?.key ?? ""} />}
    </SettingsEditDrawer>
  )
}
