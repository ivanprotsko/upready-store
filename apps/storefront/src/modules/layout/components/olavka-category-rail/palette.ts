/**
 * The category buttons' colours (t-2026-10-09-41), from Ivan's Figma frame CatalogNav
 * (node 176:166085, the `CategoryButton2` instances of its second row). Each tint is a
 * self-contained pair the node proved readable: a fill, its own dark ink, and the hue of
 * its drop shadow. The library set holds only `Style=colored-light` (11 variants), so the
 * pairs are the same in both modes, as the chips of the earlier Navigation node already are
 * (`modules/home/variants/olavka-navigation.module.css`).
 */
export type CategoryTint = { fill: string; ink: string; shade: string }

/** The search button's neutral pair (`Name=search`). */
export const SEARCH_TINT: CategoryTint = { fill: "#efeee5", ink: "#1d1e18", shade: "#5e5b3a" }

/**
 * The ten category tints in the frame's left-to-right order (`Name=courses` …
 * `Name=phyto-candles`). Keyed by those variant names only so a reader can find each in
 * the file; no category is matched to a tint by its name.
 */
export const CATEGORY_TINTS: readonly (CategoryTint & { variant: string })[] = [
  { variant: "courses", fill: "#dce5c6", ink: "#232d12", shade: "#55702b" },
  { variant: "antiseptics", fill: "#d2e3df", ink: "#172925", shade: "#3e6b63" },
  { variant: "asd", fill: "#c9dcdd", ink: "#122527", shade: "#33595b" },
  { variant: "supplements", fill: "#ead5c9", ink: "#351b10", shade: "#8a4b32" },
  { variant: "oils", fill: "#f2ddc4", ink: "#3b2210", shade: "#9a5a24" },
  { variant: "honey", fill: "#f5e4bc", ink: "#372605", shade: "#8f6512" },
  { variant: "multicookers", fill: "#dedfd8", ink: "#24251f", shade: "#5a5d53" },
  { variant: "stevia", fill: "#dfe5cf", ink: "#272e1b", shade: "#66774a" },
  { variant: "stimulants", fill: "#f0d5c8", ink: "#38190c", shade: "#8f4526" },
  { variant: "phyto-candles", fill: "#e3d3e1", ink: "#2b1b2a", shade: "#6e4c6b" },
]

/**
 * The tint of the button at `position` in the row (0 = the first category): the frame's
 * sequence, from its start again after the tenth. The owner adds, renames and removes
 * categories in her panel, so a colour follows the place in the row, not a name: any set of
 * categories gets the mockup's run of hues, and the first ten never repeat one.
 */
export function categoryTint(position: number): CategoryTint {
  const index = ((Math.trunc(position) % CATEGORY_TINTS.length) + CATEGORY_TINTS.length) % CATEGORY_TINTS.length
  const { fill, ink, shade } = CATEGORY_TINTS[index]
  return { fill, ink, shade }
}
