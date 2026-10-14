import type { TFunction } from "i18next"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { SettingsEditDrawer } from "../../../../../components/settings"
import { toNumber } from "../apiship-model"
import { ApishipTextField, useApishipEdit, warnAfterSave, wholeNumber } from "./apiship-fields"

// Drawers «Посылка по умолчанию» (`edit/parcel`) and «Наценка» (`edit/markup`):
// numbers only, in the units the route stores — grams, centimetres, roubles,
// per cent. The limits are the route's own (`PutTenantApishipSchema`).

const parcelSchema = (t: TFunction) => {
  const sizeError = t("integrations.apiship.parcel.sizeInvalid")
  return zod.object({
    default_weight_g: zod.string().refine(wholeNumber(1, 100_000), t("integrations.apiship.parcel.weightInvalid")),
    default_length_cm: zod.string().refine(wholeNumber(1, 300), sizeError),
    default_width_cm: zod.string().refine(wholeNumber(1, 300), sizeError),
    default_height_cm: zod.string().refine(wholeNumber(1, 300), sizeError),
  })
}

export const ApishipParcelDrawer = () => {
  const { t } = useTranslation()
  const { settings, isPending, save } = useApishipEdit()
  const schema = useMemo(() => parcelSchema(t), [t])

  return (
    <SettingsEditDrawer
      title={t("integrations.apiship.sections.parcel")}
      description={t("integrations.apiship.sections.parcelHint")}
      isPending={isPending}
      schema={schema}
      defaultValues={{
        default_weight_g: String(settings?.default_weight_g ?? 500),
        default_length_cm: String(settings?.default_length_cm ?? 30),
        default_width_cm: String(settings?.default_width_cm ?? 20),
        default_height_cm: String(settings?.default_height_cm ?? 10),
      }}
      onSubmit={async (values) => {
        const answer = await save({
          default_weight_g: Number(values.default_weight_g),
          default_length_cm: Number(values.default_length_cm),
          default_width_cm: Number(values.default_width_cm),
          default_height_cm: Number(values.default_height_cm),
        })
        warnAfterSave(t, answer)
      }}
      successMessage={t("integrations.apiship.saved")}
    >
      {(form) => (
        <>
          <ApishipTextField
            control={form.control}
            name="default_weight_g"
            inputMode="numeric"
            label={t("integrations.apiship.parcel.weightField")}
            hint={t("integrations.apiship.parcel.weightHint")}
          />
          <div className="grid grid-cols-1 gap-4 small:grid-cols-3">
            <ApishipTextField
              control={form.control}
              name="default_length_cm"
              inputMode="numeric"
              label={t("integrations.apiship.parcel.length")}
            />
            <ApishipTextField
              control={form.control}
              name="default_width_cm"
              inputMode="numeric"
              label={t("integrations.apiship.parcel.width")}
            />
            <ApishipTextField
              control={form.control}
              name="default_height_cm"
              inputMode="numeric"
              label={t("integrations.apiship.parcel.height")}
            />
          </div>
        </>
      )}
    </SettingsEditDrawer>
  )
}

const amount = (max: number) => (text: string) => {
  const value = toNumber(text)
  return value !== null && value >= 0 && value <= max
}

const markupSchema = (t: TFunction) =>
  zod.object({
    markup_amount: zod.string().refine(amount(1_000_000), t("integrations.apiship.markup.invalid")),
    markup_percent: zod.string().refine(amount(100), t("integrations.apiship.markup.percentInvalid")),
    free_above_total: zod
      .string()
      .refine((text) => text.trim() === "" || amount(100_000_000)(text), t("integrations.apiship.markup.invalid")),
  })

export const ApishipMarkupDrawer = () => {
  const { t } = useTranslation()
  const { apiship, isPending, save } = useApishipEdit()
  const schema = useMemo(() => markupSchema(t), [t])
  const pricing = apiship?.pricing

  return (
    <SettingsEditDrawer
      title={t("integrations.apiship.sections.markup")}
      description={t("integrations.apiship.sections.markupHint")}
      isPending={isPending}
      schema={schema}
      defaultValues={{
        markup_amount: String(pricing?.markup_amount ?? 0),
        markup_percent: String(pricing?.markup_percent ?? 0),
        free_above_total: pricing?.free_above_total ? String(pricing.free_above_total) : "",
      }}
      onSubmit={async (values) => {
        const answer = await save({
          markup_amount: toNumber(values.markup_amount) ?? 0,
          markup_percent: toNumber(values.markup_percent) ?? 0,
          free_above_total: toNumber(values.free_above_total),
        })
        warnAfterSave(t, answer)
      }}
      successMessage={t("integrations.apiship.saved")}
    >
      {(form) => (
        <>
          <ApishipTextField
            control={form.control}
            name="markup_amount"
            inputMode="decimal"
            label={t("integrations.apiship.markup.amountField")}
            hint={t("integrations.apiship.markup.amountHint")}
          />
          <ApishipTextField
            control={form.control}
            name="markup_percent"
            inputMode="decimal"
            label={t("integrations.apiship.markup.percentField")}
            hint={t("integrations.apiship.markup.percentHint")}
          />
          <ApishipTextField
            control={form.control}
            name="free_above_total"
            inputMode="decimal"
            optional
            label={t("integrations.apiship.markup.freeAboveField")}
            hint={t("integrations.apiship.markup.freeAboveHint")}
          />
        </>
      )}
    </SettingsEditDrawer>
  )
}
