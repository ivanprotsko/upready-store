import { Text } from "@medusajs/ui"

// w12-marketplace-core: one label/value line of a marketplace card. Taken
// verbatim from the Wildberries page's `wb-field-row`, which it replaces: the
// row was never Wildberries-specific, and one copy per marketplace is exactly
// the drift this task removes (rule 20).
export const MpFieldRow = ({
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
