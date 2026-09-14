import { Text } from "@medusajs/ui"

/** A single label/value row inside the tenant's general-info Container. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 py-4">
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <div className="text-ui-fg-base text-right text-sm">{children}</div>
    </div>
  )
}
