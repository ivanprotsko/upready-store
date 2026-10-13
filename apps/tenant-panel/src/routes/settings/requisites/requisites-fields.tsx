import { DatePicker, Input, Text, Textarea } from "@medusajs/ui"
import { Control, FieldValues, Path } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { Form } from "../../../components/common/form"
import { formatRequisiteDate, parseRequisiteDate, type RequisiteTextField } from "./requisites-model"

// The three field shapes the section drawers use. Label and hint come from one
// key family, `requisitesSettings.fields.<field>`, so a screen string is never a
// literal and the read page and the drawer say the same words.

type FieldProps<T extends FieldValues> = {
  control: Control<T>
  name: Path<T> & RequisiteTextField
  /** Registration numbers and links read in monospace. */
  mono?: boolean
  /** The field's hint key exists in ru.json and en.json. */
  hint?: boolean
  optional?: boolean
  placeholder?: string
}

export const RequisiteTextInput = <T extends FieldValues>({
  control,
  name,
  mono,
  hint,
  optional,
  placeholder,
  multiline,
}: FieldProps<T> & { multiline?: boolean }) => {
  const { t } = useTranslation()

  return (
    <Form.Field
      control={control}
      name={name}
      render={({ field }) => (
        <Form.Item>
          <Form.Label optional={optional}>{t(`requisitesSettings.fields.${name}.label`)}</Form.Label>
          <Form.Control>
            {multiline ? (
              <Textarea {...field} rows={4} placeholder={placeholder} />
            ) : (
              <Input
                {...field}
                autoComplete="off"
                placeholder={placeholder}
                className={mono ? "font-mono" : undefined}
              />
            )}
          </Form.Control>
          {hint ? <Form.Hint>{t(`requisitesSettings.fields.${name}.hint`)}</Form.Hint> : null}
          <Form.ErrorMessage />
        </Form.Item>
      )}
    />
  )
}

export const RequisiteDateInput = <T extends FieldValues>({ control, name }: FieldProps<T>) => {
  const { t } = useTranslation()

  return (
    <Form.Field
      control={control}
      name={name}
      render={({ field }) => {
        const text = String(field.value ?? "").trim()
        const picked = parseRequisiteDate(text)

        return (
          <Form.Item>
            <Form.Label optional>{t(`requisitesSettings.fields.${name}.label`)}</Form.Label>
            <Form.Control>
              <DatePicker
                granularity="day"
                value={picked}
                onChange={(date) => field.onChange(formatRequisiteDate(date))}
              />
            </Form.Control>
            {text && !picked ? (
              <Text size="xsmall" className="text-ui-fg-subtle text-pretty">
                {t("requisitesSettings.dateAsWritten", { value: text })}
              </Text>
            ) : null}
            <Form.ErrorMessage />
          </Form.Item>
        )
      }}
    />
  )
}
