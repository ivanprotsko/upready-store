import { Input } from "@medusajs/ui"
import { Control, FieldValues, Path } from "react-hook-form"

import { Form } from "../../../../components/common/form"

// t-2026-10-14-01 (panel redesign, G3): the one field shape the BTCPay,
// Bitcart and x402 requisites drawers repeat — a label, an input, a hint and
// the field's error — the way `RequisiteTextInput` serves the requisites
// drawers. A `secret` field is a write-only password input: it starts empty,
// and empty keeps the stored value.

type MethodTextFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: Path<T>
  label: string
  hint?: string
  placeholder?: string
  secret?: boolean
  mono?: boolean
  testId?: string
}

export const MethodTextField = <T extends FieldValues>({
  control,
  name,
  label,
  hint,
  placeholder,
  secret,
  mono,
  testId,
}: MethodTextFieldProps<T>) => (
  <Form.Field
    control={control}
    name={name}
    render={({ field }) => (
      <Form.Item>
        <Form.Label>{label}</Form.Label>
        <Form.Control>
          <Input
            {...field}
            type={secret ? "password" : "text"}
            autoComplete={secret ? "new-password" : "off"}
            placeholder={placeholder}
            className={mono ? "font-mono" : undefined}
            data-testid={testId}
          />
        </Form.Control>
        {hint ? <Form.Hint>{hint}</Form.Hint> : null}
        <Form.ErrorMessage />
      </Form.Item>
    )}
  />
)
