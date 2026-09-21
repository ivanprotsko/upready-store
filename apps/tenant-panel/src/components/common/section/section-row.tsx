import { Text, clx } from "@medusajs/ui"
import { ReactNode } from "react"

export type SectionRowProps = {
  title: string
  value?: ReactNode | string | null
  actions?: ReactNode
}

export const SectionRow = ({ title, value, actions }: SectionRowProps) => {
  const isValueString = typeof value === "string" || !value
  // o21-owner-panel-ux (P6): a long text (a product description) in half of a
  // phone screen is a column of three words per line. It goes under its label.
  const isLongText = typeof value === "string" && value.length > 80

  return (
    <div
      className={clx(
        `text-ui-fg-subtle grid w-full grid-cols-2 items-center gap-4 px-6 py-4`,
        {
          "grid-cols-[1fr_1fr_28px]": !!actions,
          "max-md:grid-cols-1 max-md:items-start max-md:gap-1": isLongText && !actions,
        }
      )}
    >
      <Text size="small" weight="plus" leading="compact">
        {title}
      </Text>

      {isValueString ? (
        <Text
          size="small"
          leading="compact"
          className="whitespace-pre-line text-pretty"
        >
          {value ?? "-"}
        </Text>
      ) : (
        <div className="flex flex-wrap gap-1 min-w-0">{value}</div>
      )}

      {actions && <div>{actions}</div>}
    </div>
  )
}
