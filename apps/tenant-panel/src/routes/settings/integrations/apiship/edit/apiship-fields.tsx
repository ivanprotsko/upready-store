import { Input, Select, toast } from "@medusajs/ui"
import type { TFunction } from "i18next"
import { Control, FieldValues, Path } from "react-hook-form"

import { Form } from "../../../../../components/common/form"
import {
  type ApishipSaveResponse,
  type PutApishipBody,
  useApiship,
  useSaveApiship,
} from "../../../../../hooks/api/apiship"

// t-2026-10-14-58, part B: what the ApiShip drawers share — one text field,
// one select, and the save that sends only the drawer's own fields (the route
// keeps every field the body leaves out) and says what ApiShip skipped.

type TextFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: Path<T>
  label: string
  hint?: string
  optional?: boolean
  placeholder?: string
  type?: "text" | "password" | "tel" | "email"
  inputMode?: "numeric" | "decimal"
  mono?: boolean
}

export const ApishipTextField = <T extends FieldValues>({
  control,
  name,
  label,
  hint,
  optional,
  placeholder,
  type = "text",
  inputMode,
  mono,
}: TextFieldProps<T>) => (
  <Form.Field
    control={control}
    name={name}
    render={({ field }) => (
      <Form.Item>
        <Form.Label optional={optional}>{label}</Form.Label>
        <Form.Control>
          <Input
            {...field}
            type={type}
            inputMode={inputMode}
            autoComplete={type === "password" ? "new-password" : "off"}
            placeholder={placeholder}
            className={mono ? "font-mono" : undefined}
          />
        </Form.Control>
        {hint ? <Form.Hint>{hint}</Form.Hint> : null}
        <Form.ErrorMessage />
      </Form.Item>
    )}
  />
)

export const ApishipSelectField = <T extends FieldValues>({
  control,
  name,
  label,
  hint,
  options,
}: {
  control: Control<T>
  name: Path<T>
  label: string
  hint?: string
  options: Array<{ value: string; label: string }>
}) => (
  <Form.Field
    control={control}
    name={name}
    render={({ field: { onChange, ref, ...field } }) => (
      <Form.Item>
        <Form.Label>{label}</Form.Label>
        <Form.Control>
          <Select {...field} onValueChange={onChange}>
            <Select.Trigger ref={ref}>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value}>
                  {option.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </Form.Control>
        {hint ? <Form.Hint>{hint}</Form.Hint> : null}
        <Form.ErrorMessage />
      </Form.Item>
    )}
  />
)

/** What a save tells beyond «сохранено»: carriers left off and a webhook ApiShip refused. */
export const warnAfterSave = (t: TFunction, answer: ApishipSaveResponse) => {
  const skipped = answer.verified?.carriers_skipped ?? []
  if (skipped.length) {
    const labels = skipped.map(
      (key) => answer.carriers.find((carrier) => carrier.provider_key === key)?.label ?? key
    )
    toast.warning(t("integrations.apiship.carriersSkipped", { carriers: labels.join(", ") }))
  }
  if (answer.webhook && !answer.webhook.registered && answer.webhook.error) {
    toast.warning(t("integrations.apiship.webhookFailed", { error: answer.webhook.error }))
  }
}

export const useApishipEdit = () => {
  const { apiship, isPending, isError, error } = useApiship()
  const { mutateAsync } = useSaveApiship()

  if (isError) {
    throw error
  }

  return {
    apiship,
    settings: apiship?.settings ?? null,
    isPending,
    save: (body: PutApishipBody) => mutateAsync(body),
  }
}

/** A positive whole number written in a field, in the limits the route accepts. */
export const wholeNumber = (min: number, max: number) => (text: string) => {
  const value = Number(text.trim())
  return text.trim() !== "" && Number.isInteger(value) && value >= min && value <= max
}
