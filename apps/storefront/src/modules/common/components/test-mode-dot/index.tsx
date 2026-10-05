import { testModeLabel, type TenantTestMode } from "@lib/tenant/test-mode"

/**
 * The red dot in the storefront's top-right corner while this shop takes test payments or ships
 * in a test contour (t-2026-10-04-21, checkout-v2 acceptance A3); hovering it says which. Driven
 * by the providers' own test flags (`lib/tenant/test-mode.ts`), so going live in the panel is
 * what removes it. Renders nothing for a live shop or a stand with no tenant.
 */
export default function TestModeDot({ mode, locale }: { mode: TenantTestMode; locale: string }) {
  const label = testModeLabel(mode, locale)

  if (!label) {
    return null
  }

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid="test-mode-dot"
      className="fixed right-1 top-1 z-[1000] flex h-5 w-5 cursor-help items-center justify-center"
    >
      <span
        aria-hidden
        className="block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: "var(--destructive)", boxShadow: "0 0 0 2px var(--background)" }}
      />
    </span>
  )
}
