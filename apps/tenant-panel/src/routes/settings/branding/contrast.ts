/**
 * Same WCAG contrast math as the backend (`api/tenants/branding/contrast.ts`),
 * duplicated here because the panel is its own app with no shared package to
 * import it from. The panel warns as the owner types; the backend's own
 * answer after save stays the source of truth.
 */
function relativeLuminance(hex: string): number {
  const int = parseInt(hex.slice(1), 16)
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

export function bestForeground(hex: string): "#ffffff" | "#000000" {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#000000") ? "#ffffff" : "#000000"
}

/**
 * NOT WCAG AA's 4.5:1 — measured (by sweeping every grayscale value) that
 * max(contrast against black, contrast against white) never drops below
 * ~4.608:1 for any colour, so a 4.5 threshold against the auto-picked
 * foreground could never fire. 7:1 (WCAG AAA) is the bound that actually
 * separates a fine colour from a medium-saturated one that is hard to put
 * any text on — see the backend's own `api/tenants/branding/contrast.ts`.
 */
const CONTRAST_WARNING_THRESHOLD = 7

export function contrastIsLow(hex: string): boolean {
  return contrastRatio(hex, bestForeground(hex)) < CONTRAST_WARNING_THRESHOLD
}
