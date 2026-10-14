import { Plus, XMark } from "@medusajs/icons"
import { Button, Hint, IconButton, Input } from "@medusajs/ui"
import { useMemo } from "react"
import { UseFormReturn, useFieldArray } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Navigate } from "react-router-dom"
import * as zod from "zod"

import { Form } from "../../../components/common/form"
import { SettingsEditDrawer } from "../../../components/settings"
import { LOCALE_LABELS, type LocaleCode } from "../../../lib/locale-catalog"
import { suggestMachineValue } from "../attribute-labels"
import { cleanTranslations, optionsProblem } from "../attribute-model"
import { useAttributeSave, useOtherLocales } from "../use-attribute-save"

// t-2026-10-14-01 (panel redesign, G2, prototype state `attribute-values-edit`):
// the values of a choice list, on `/product-attributes/:id/values/edit`. The
// backend replaces the whole list on every save, so the drawer sends all of
// it; a value removed here disappears from the products that carried it, and
// the toast says from how many. A value's machine name follows its name until
// the owner edits it (`touched`), as on the old card.

type ValueDraft = {
  label: string
  value: string
  translations: Record<string, string>
  touched: boolean
}
type ValuesDraft = { options: ValueDraft[] }

const ValueFields = ({
  form,
  locales,
}: {
  form: UseFormReturn<ValuesDraft>
  locales: LocaleCode[]
}) => {
  const { t } = useTranslation()
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "options" })

  return (
    <>
      <Hint>{t("productAttributes.values.drawerHint")}</Hint>
      {fields.map((item, index) => (
        <div
          key={item.id}
          className="border-ui-border-base flex items-start gap-x-2 border-b pb-4 last:border-b-0"
        >
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <Form.Field
              control={form.control}
              name={`options.${index}.label`}
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{t("productAttributes.fields.valueLabel")}</Form.Label>
                  <Form.Control>
                    <Input
                      {...field}
                      autoComplete="off"
                      onChange={(event) => {
                        field.onChange(event)
                        if (!form.getValues(`options.${index}.touched`)) {
                          form.setValue(`options.${index}.value`, suggestMachineValue(event.target.value))
                        }
                      }}
                    />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name={`options.${index}.value`}
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{t("productAttributes.fields.key")}</Form.Label>
                  <Form.Control>
                    <Input
                      {...field}
                      autoComplete="off"
                      className="font-mono"
                      onChange={(event) => {
                        form.setValue(`options.${index}.touched`, true)
                        field.onChange(event)
                      }}
                    />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            {locales.map((code) => (
              <Form.Field
                key={code}
                control={form.control}
                name={`options.${index}.translations.${code}`}
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label optional>{LOCALE_LABELS[code]}</Form.Label>
                    <Form.Control>
                      <Input {...field} value={field.value ?? ""} autoComplete="off" />
                    </Form.Control>
                  </Form.Item>
                )}
              />
            ))}
          </div>
          <IconButton
            type="button"
            size="small"
            variant="transparent"
            className="mt-6"
            aria-label={t("productAttributes.values.remove")}
            onClick={() => remove(index)}
          >
            <XMark />
          </IconButton>
        </div>
      ))}
      <div>
        <Button
          type="button"
          size="small"
          variant="secondary"
          onClick={() => append({ label: "", value: "", translations: {}, touched: false })}
        >
          <Plus /> {t("productAttributes.values.add")}
        </Button>
      </div>
    </>
  )
}

export const AttributeValuesEdit = () => {
  const { t } = useTranslation()
  const { attribute, isPending, save, savedMessage } = useAttributeSave()
  const { locales, isPending: localesPending } = useOtherLocales()

  // What the form refuses before asking the server, said at the list.
  const schema = useMemo(
    () =>
      zod
        .object({
          options: zod.array(
            zod.object({
              label: zod.string(),
              value: zod.string(),
              translations: zod.record(zod.string(), zod.string()),
              touched: zod.boolean(),
            })
          ),
        })
        .superRefine((draft, ctx) => {
          const problem = optionsProblem(draft.options)
          if (problem) {
            ctx.addIssue({
              code: "custom",
              path: ["options"],
              message: t(`productAttributes.values.errors.${problem}`),
            })
          }
        }),
    [t]
  )

  // Only a choice list has values: its address on another type leads back to the card.
  if (attribute && attribute.type !== "select") {
    return <Navigate to="../.." relative="path" replace />
  }

  return (
    <SettingsEditDrawer<ValuesDraft>
      title={t("productAttributes.values.title")}
      isPending={isPending || localesPending}
      schema={schema}
      defaultValues={{
        options: [...(attribute?.options ?? [])]
          .sort((a, b) => a.position - b.position)
          .map((option) => ({
            label: option.label,
            value: option.value,
            translations: option.translations ?? {},
            touched: true,
          })),
      }}
      onSubmit={(draft) =>
        save({
          options: draft.options.map((option) => ({
            value: option.value.trim(),
            label: option.label.trim(),
            translations: cleanTranslations(option.translations),
          })),
        })
      }
      successMessage={savedMessage}
    >
      {(form) => (
        <>
          <ValueFields form={form} locales={locales} />
          <ValuesError form={form} />
        </>
      )}
    </SettingsEditDrawer>
  )
}

/** The list-wide refusal (no values, an incomplete one, two alike) under the list. */
const ValuesError = ({ form }: { form: UseFormReturn<ValuesDraft> }) => {
  const message = form.formState.errors.options?.message ?? form.formState.errors.options?.root?.message
  return message ? <Hint variant="error">{message}</Hint> : null
}
