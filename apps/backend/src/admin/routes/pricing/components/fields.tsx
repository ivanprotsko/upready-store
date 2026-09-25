import { Button, Input, Label, Select, Text, Textarea } from "@medusajs/ui"
import type { ReactNode } from "react"

/** A labelled one-line input. */
export function TextField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  mono = false,
  testId,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  placeholder?: string
  mono?: boolean
  testId?: string
}) {
  return (
    <div className="flex flex-col gap-y-1">
      <Label size="small">{label}</Label>
      <Input
        size="small"
        className={mono ? "font-mono" : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
      {hint ? (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {hint}
        </Text>
      ) : null}
    </div>
  )
}

/** A labelled multi-line input. */
export function AreaField({
  label,
  value,
  onChange,
  hint,
  rows = 2,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  rows?: number
}) {
  return (
    <div className="flex flex-col gap-y-1">
      <Label size="small">{label}</Label>
      <Textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {hint}
        </Text>
      ) : null}
    </div>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label?: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  testId?: string
}) {
  return (
    <div className="flex flex-col gap-y-1">
      {label ? <Label size="small">{label}</Label> : null}
      <Select size="small" value={value} onValueChange={(v) => onChange(v as T)}>
        <Select.Trigger data-testid={testId}>
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
    </div>
  )
}

/** Up, down and remove for one item of an ordered list. */
export function ListControls({
  index,
  count,
  onMove,
  onRemove,
  removeLabel = "Удалить",
}: {
  index: number
  count: number
  onMove: (from: number, to: number) => void
  onRemove: () => void
  removeLabel?: string
}) {
  return (
    <div className="flex items-center gap-x-1">
      <Button
        type="button"
        size="small"
        variant="transparent"
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
        aria-label="Выше"
      >
        ↑
      </Button>
      <Button
        type="button"
        size="small"
        variant="transparent"
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
        aria-label="Ниже"
      >
        ↓
      </Button>
      <Button type="button" size="small" variant="transparent" onClick={onRemove}>
        {removeLabel}
      </Button>
    </div>
  )
}

/** A bordered block inside a Container: one tier, one section, one row. */
export function Block({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-ui-border-base">
      <div className="flex items-center justify-between gap-x-2 border-b border-ui-border-base px-4 py-2">
        <Text size="small" weight="plus">
          {title}
        </Text>
        {actions}
      </div>
      <div className="flex flex-col gap-y-3 p-4">{children}</div>
    </div>
  )
}

/** Moves one item of an array in place. */
export function move<T>(list: T[], from: number, to: number): void {
  if (to < 0 || to >= list.length) return
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item)
}
