// tenant-panel: the «Шаблоны» section of `/home-settings` (t-2026-10-12-33 P2). The
// catalogue comes from `GET /tenants/home/templates`, which reads the storefront's export
// (`apps/backend/src/api/tenants/home/template/catalog.generated.json`); a template is applied
// through `POST /tenants/home/template` with `{ id, overrides? }`.
//
// Pure module, no React and no i18n: the section's choices, the overrides they make and the
// palette rule live here, so `src/__tests__/home-templates.test.mjs` runs them as they are.
// The panel's own theme picker (`composition.ts` `THEME_PRESETS`) is not touched: this
// section reads its palettes from the endpoint.

export type Swatch = { background: string; foreground: string; primary: string; accent: string; muted: string }

export type Radius = "sharp" | "soft" | "round" | "pill"
export type ButtonStyle = "filled" | "outlined"
export type PhotoStyle = "square" | "portrait" | "landscape" | "wide"
export type Density = "compact" | "comfortable" | "spacious"

export type TemplateLayers = { radius: Radius; buttonStyle: ButtonStyle; photoStyle: PhotoStyle; density: Density }

export type LayerName = keyof TemplateLayers

/**
 * Words from the catalogue (P2b): `{ "ru": "…", "en": "…" }` as the template's manifest and the
 * palette's theme file give them, or one string for every language. The section shows `textFor()`.
 */
export type TemplateText = string | Record<string, string>

export type TemplateCard = {
  id: string
  title: TemplateText
  description: TemplateText
  defaultMode: "light" | "dark"
  theme: TemplateLayers & { palette: string; fontPair: { display: string; body: string } }
  sections: { block: string; category: string }[]
}

export type PaletteEntry = {
  id: string
  label: TemplateText
  lightOnly: boolean
  colours: { light: Swatch; dark?: Swatch }
}

export type CurrentTemplate = {
  id: string
  palette: string
  layers: TemplateLayers | null
  fontPair: { display: string; body: string }
}

export type TemplateCatalogue = {
  templates: TemplateCard[]
  palettes: PaletteEntry[]
  layers: Record<LayerName, string[]>
  /** The storefront's gap between home sections at each density, in px (its `--layer-section-gap`). */
  sectionGapPx: Record<Density, number>
  current: CurrentTemplate | null
}

/**
 * The words in the panel's language (`i18n.language`, `ru-RU` read as `ru`), else English, else
 * any line given; the storefront picks a block's text the same way (`pickText`). A string is
 * the same words in every language.
 */
export function textFor(text: TemplateText, language: string | undefined): string {
  if (typeof text === "string") return text
  const own = language?.split("-")[0]
  const line = [own ? text[own] : undefined, text.en, ...Object.values(text)].find((candidate) => candidate?.trim())
  return line?.trim() ?? ""
}

/** The panel language's alphabet; a `lng` that is not a language tag gets the browser's own. */
function collatorFor(language: string | undefined): Intl.Collator {
  try {
    return new Intl.Collator(language)
  } catch {
    return new Intl.Collator()
  }
}

/**
 * The cards' order (P2c): the template on the storefront now first, the rest by their title in
 * the panel's language, in that language's alphabet. The export keys `templates` by id, so the
 * file's layout sets no order; a list of ids in the catalogue would make every two template PRs
 * conflict. Returns a new list.
 */
export function orderTemplates(
  templates: readonly TemplateCard[],
  current: CurrentTemplate | null,
  language: string | undefined
): TemplateCard[] {
  const collator = collatorFor(language)
  const live = (template: TemplateCard) => (current?.id === template.id ? 0 : 1)
  const title = (template: TemplateCard) => textFor(template.title, language)
  return [...templates].sort(
    (a, b) => live(a) - live(b) || collator.compare(title(a), title(b)) || collator.compare(a.id, b.id)
  )
}

/** What the owner has chosen for one template: its palette and four layers. */
export type TemplateChoice = { palette: string; layers: TemplateLayers }

/** The body's `overrides` of `POST /tenants/home/template`; no section props in this screen. */
export type TemplateOverrides = { palette?: string; layers?: Partial<TemplateLayers> }

export const LAYER_NAMES: readonly LayerName[] = ["radius", "buttonStyle", "photoStyle", "density"]

const layersOf = (template: TemplateCard): TemplateLayers => ({
  radius: template.theme.radius,
  buttonStyle: template.theme.buttonStyle,
  photoStyle: template.theme.photoStyle,
  density: template.theme.density,
})

/** The template's own values: what «Сбросить к шаблону» returns to. */
export const templateChoice = (template: TemplateCard): TemplateChoice => ({
  palette: template.theme.palette,
  layers: layersOf(template),
})

/**
 * Where the settings open: the values on the storefront now for the template the shop has
 * saved (its overrides included), the template's own values for any other.
 */
export const initialChoice = (template: TemplateCard, current: CurrentTemplate | null): TemplateChoice =>
  current && current.id === template.id
    ? { palette: current.palette, layers: current.layers ?? layersOf(template) }
    : templateChoice(template)

/**
 * The overrides a choice makes: only what differs from the template's own values, so a
 * template applied as it is goes with no `overrides` at all.
 */
export function overridesFrom(template: TemplateCard, choice: TemplateChoice): TemplateOverrides | undefined {
  const own = templateChoice(template)
  const overrides: TemplateOverrides = {}
  if (choice.palette !== own.palette) overrides.palette = choice.palette
  const layers: Partial<TemplateLayers> = {}
  for (const name of LAYER_NAMES) {
    if (choice.layers[name] !== own.layers[name]) Object.assign(layers, { [name]: choice.layers[name] })
  }
  if (Object.keys(layers).length) overrides.layers = layers
  return Object.keys(overrides).length ? overrides : undefined
}

/** True when the choice is the template's own, so the reset has nothing to do. */
export const isTemplateOwn = (template: TemplateCard, choice: TemplateChoice): boolean =>
  overridesFrom(template, choice) === undefined

/**
 * A light-only palette has no dark mode: the backend refuses it with 400 on a template that
 * opens dark (`settings.defaultMode` not "light"), so the section greys it there and says why.
 */
export const paletteAllowed = (template: TemplateCard, palette: PaletteEntry): boolean =>
  !palette.lightOnly || template.defaultMode === "light"

/** The colours the schematic is painted in: the template's own mode, light when the palette has no dark. */
export const swatchFor = (palette: PaletteEntry, mode: "light" | "dark"): Swatch =>
  mode === "dark" && palette.colours.dark ? palette.colours.dark : palette.colours.light

/**
 * What the toast says when applying failed. The page's save renders the server's message the
 * same way: a 422 `forbidden_combination` carries the rule's reason as its message, a 400
 * names the field; with no message the screen's own words stand.
 */
export const failureText = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback

/** The schematic's geometry for each layer value, in px of the small preview. */
export const RADIUS_PX: Record<Radius, number> = { sharp: 0, soft: 2, round: 4, pill: 6 }
export const PHOTO_RATIO: Record<PhotoStyle, string> = {
  square: "1 / 1",
  portrait: "3 / 4",
  landscape: "4 / 3",
  wide: "16 / 9",
}

/**
 * The schematic's gap between home sections: the storefront's own gap at the density, from the catalogue export
 * (`sectionGapPx`), drawn at an eighth of its size. The three densities keep the storefront's proportion.
 */
export const densityGapPx = (sectionGapPx: Record<Density, number>, density: Density): number => sectionGapPx[density] / 8

/** The preview link, `<origin>/<locale>?template=<id>`, or null when the panel has no preview origin. */
export const previewHref = (origin: string | undefined, locale: string, id: string): string | null =>
  origin ? `${origin.replace(/\/+$/, "")}/${locale}?template=${encodeURIComponent(id)}` : null
