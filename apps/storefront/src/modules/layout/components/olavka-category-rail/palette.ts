/**
 * The category buttons' colours. t-2026-10-20-61 D2: one neutral pair for the search button and
 * every category — the theme's muted surface with its foreground ink — instead of the ten
 * pastel tints of Ivan's Figma frame CatalogNav (t-2026-10-09-41), which read as a rainbow row.
 * Theme tokens, so the row follows the light and the dark preset.
 */
export type CategoryTint = { fill: string; ink: string; shade: string }

const NEUTRAL: CategoryTint = { fill: "var(--muted)", ink: "var(--foreground)", shade: "var(--border)" }

/** The search button's pair (`Name=search`): the same neutral one. */
export const SEARCH_TINT: CategoryTint = NEUTRAL

/** The category pair: the same for every button, whatever its place in the row. */
export function categoryTint(_position: number): CategoryTint {
  return NEUTRAL
}
