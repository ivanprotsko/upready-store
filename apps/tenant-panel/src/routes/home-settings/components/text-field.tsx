import { Input, Textarea } from "@medusajs/ui"
import { Control, FieldValues, Path } from "react-hook-form"

import { Form } from "../../../components/common/form"

// t-2026-10-14-01 (panel redesign, G4): the one field shape the drawers of the
// home page repeat — a label, an input (or a textarea), a hint and the field's
// error — the way `MethodTextField` serves the payment drawers. `maxLength` is
// the platform's own cap, so the owner cannot type past what a save accepts.

type TextFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: Path<T>
  label: string
  hint?: string
  placeholder?: string
  optional?: boolean
  maxLength: number
  /** A textarea of this many rows instead of one line. */
  rows?: number
  disabled?: boolean
  testId?: string
}

export const TextField = <T extends FieldValues>({
  control,
  name,
  label,
  hint,
  placeholder,
  optional,
  maxLength,
  rows,
  disabled,
  testId,
}: TextFieldProps<T>) => (
  <Form.Field
    control={control}
    name={name}
    render={({ field }) => (
      <Form.Item>
        <Form.Label optional={optional}>{label}</Form.Label>
        <Form.Control>
          {rows ? (
            <Textarea
              {...field}
              rows={rows}
              maxLength={maxLength}
              placeholder={placeholder}
              disabled={disabled}
              data-testid={testId}
            />
          ) : (
            <Input
              {...field}
              autoComplete="off"
              maxLength={maxLength}
              placeholder={placeholder}
              disabled={disabled}
              data-testid={testId}
            />
          )}
        </Form.Control>
        {hint ? <Form.Hint>{hint}</Form.Hint> : null}
        <Form.ErrorMessage />
      </Form.Item>
    )}
  />
)
