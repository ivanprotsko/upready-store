import { Text } from "@medusajs/ui"

// w01-wb-readonly-client: one label/value line of the Wildberries card.
// The label column is fixed so the values line up down the card; on a narrow
// screen the two stack instead of squeezing.
export const WbFieldRow = ({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) => (
  <div className="grid grid-cols-1 gap-x-4 gap-y-1 py-2 md:grid-cols-[minmax(0,220px)_1fr]">
    <Text className="text-ui-fg-subtle" size="small">
      {label}
    </Text>
    <div className="txt-compact-small">{children}</div>
  </div>
)
