/**
 * A store template is a manifest over the composition the storefront already has
 * (t-2026-10-12-33, `docs/templates/BLOCK-CONTRACT.md` §Template contract). One JSON file
 * per template, `src/templates/<id>/template.json`:
 *
 *   - `settings`: a `StorefrontSettingsInput`, the very document `getEffectiveSettings()`
 *     answers today, checked by the same `validate()` (field enums, then `FORBIDDEN`);
 *   - `theme`: the style layers (gramlink's idea, A-2026-10-12-55), each mapped onto what
 *     already paints the page: the palette is a `data-theme` preset, the mode is
 *     `settings.defaultMode`, the radius is the presets' own `--radius`, and the layers no
 *     preset carries yet are CSS variables on `<html>`, written through the same inline
 *     style the owner's brand colour uses (`app/layout.tsx`);
 *   - `sections`: the home page, in order, by block id (`modules/blocks/registry.ts`).
 *
 * `resolveTemplate()` turns a valid manifest into exactly those inputs, so there is no
 * second theming path: a template changes what the existing readers read, nothing more.
 */

import {
  ADVISORY,
  isAdvisory,
  validate,
  type AdvisoryRule,
  type FieldError,
  type ForbiddenRule,
  type Mode,
  type StorefrontSettingsInput,
} from "@lib/theme/composition"
import { FONT_NAMES, type FontName } from "@lib/theme/fonts"
import { activeFonts } from "@lib/theme/fonts.generated"
import { LIGHT_ONLY_THEME_IDS, THEME_IDS } from "@lib/theme/presets.generated"
import { LOCALE_CODES, pickText, type LocalizedText } from "@modules/blocks/shared/localized-text"
import type { BlockEntry } from "@modules/blocks/types"

import { templateFontPair } from "./fonts"

export const TEMPLATE_SCHEMA = "upready.storefront-template/v1"

/* ------------------------------------------------------------------ style layers */

export const RADII = ["sharp", "soft", "round", "pill"] as const
export const BUTTON_STYLES = ["filled", "outlined"] as const
export const PHOTO_STYLES = ["square", "portrait", "landscape", "wide"] as const
export const DENSITIES = ["compact", "comfortable", "spacious"] as const

export type Radius = (typeof RADII)[number]
export type ButtonStyle = (typeof BUTTON_STYLES)[number]
export type PhotoStyle = (typeof PHOTO_STYLES)[number]
export type Density = (typeof DENSITIES)[number]

/** `--radius` is written by every preset in `styles/themes.css` (0.125rem to 0.5rem). */
const RADIUS_VALUE: Record<Radius, string> = {
  sharp: "0.125rem",
  soft: "0.375rem",
  round: "0.75rem",
  pill: "1.5rem",
}

/** Token references only: the layer picks which theme colours a button wears. */
const BUTTON_VARS: Record<ButtonStyle, Record<string, string>> = {
  filled: {
    "--layer-button-bg": "var(--primary)",
    "--layer-button-fg": "var(--primary-foreground)",
    "--layer-button-border": "var(--primary)",
  },
  outlined: {
    "--layer-button-bg": "transparent",
    "--layer-button-fg": "var(--foreground)",
    "--layer-button-border": "var(--border)",
  },
}

const PHOTO_ASPECT: Record<PhotoStyle, string> = {
  square: "1 / 1",
  portrait: "3 / 4",
  landscape: "4 / 3",
  wide: "16 / 9",
}

/** A multiplier on a block's own vertical rhythm, and the gap between home sections. */
const DENSITY_VARS: Record<Density, Record<string, string>> = {
  compact: { "--layer-density": "0.75", "--layer-section-gap": "2rem" },
  comfortable: { "--layer-density": "1", "--layer-section-gap": "3rem" },
  spacious: { "--layer-density": "1.25", "--layer-section-gap": "4.5rem" },
}

export type TemplateTheme = {
  /**
   * A preset of `specs/design-system/themes`, the `data-theme` the page paints with. A
   * light-only one (`LIGHT_ONLY_THEME_IDS`) asks for `settings.defaultMode` "light".
   */
  palette: string
  /** The template's own files when both families have them (`./fonts.ts`): see `ResolvedTemplate.fonts`. */
  fontPair: { display: FontName; body: FontName }
  radius: Radius
  buttonStyle: ButtonStyle
  photoStyle: PhotoStyle
  density: Density
}

/* ------------------------------------------------------------------ manifest */

export type TemplateSection = { block: string; props?: Record<string, unknown> }

/**
 * Words the panel shows the owner (P2b): `{ "ru": "…", "en": "…" }` keyed by the codes of
 * `i18n/config.ts`, the blocks' `LocalizedText`. A plain string is the same words in every
 * language, so a template written before P2b stays valid.
 */
export type TemplateText = string | LocalizedText

export type TemplateManifest = {
  schema: typeof TEMPLATE_SCHEMA
  id: string
  /** The template's name, and one sentence on what it is for and how it looks; no internal names. */
  title: TemplateText
  description: TemplateText
  settings: StorefrontSettingsInput
  theme: TemplateTheme
  sections: TemplateSection[]
}

export type TemplateValidation =
  | { ok: true; value: TemplateManifest; advisories: string[] }
  | { ok: false; errors: FieldError[]; forbidden?: ForbiddenRule }

/**
 * The three home slots of the composition document, and the block category of each. A
 * section of the category is the slot: a composition variant (an entry with `setting`) is
 * the shop's own, chosen by `settings`; a block written for templates (`hero/split`) takes
 * the slot's place, so `settings` must turn the slot `off`. Either way the slot renders once.
 */
const HOME_SLOTS = [
  { field: "hero", category: "hero", off: "none" },
  { field: "tiles", category: "tiles", off: "off" },
  { field: "listing", category: "listing", off: "none" },
] as const

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function oneOf<T extends string>(
  errors: FieldError[],
  field: string,
  value: unknown,
  allowed: readonly T[]
): value is T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return true
  errors.push({ field, message: `${field} must be one of: ${allowed.join(", ")}.` })
  return false
}

/** A `TemplateText`: a non-empty string, or at least one language of `i18n/config.ts`, each a non-empty string. */
function textErrors(field: string, value: unknown): FieldError[] {
  if (typeof value === "string" && value.trim()) return []
  if (!isObject(value) || Object.keys(value).length === 0) {
    return [{ field, message: `${field} must be a non-empty string or an object of language code to text.` }]
  }
  const errors: FieldError[] = []
  for (const [code, line] of Object.entries(value)) {
    const at = `${field}.${code}`
    if (!LOCALE_CODES.has(code)) errors.push({ field: at, message: `${at} is not a language of i18n/config.ts.` })
    else if (typeof line !== "string" || !line.trim()) errors.push({ field: at, message: `${at} must be a non-empty string.` })
  }
  return errors
}

/** The words in `locale`, else English, else any line given; a string is the same in every language. */
export const templateText = (text: TemplateText, locale: string): string =>
  typeof text === "string" ? text : pickText(text, locale) ?? ""

/**
 * Checks a parsed `template.json`. `lookup` answers a block id with its registry entry
 * (`blockById` in production, a stub in a test).
 *
 * Errors are everything that would make the template render something other than what it
 * says; advisories are the composition's own `ADVISORY` rules and blocks that are still
 * placeholders, which render but should not ship in a template unseen.
 */
export function validateTemplate(
  input: unknown,
  lookup: (id: string) => BlockEntry | null
): TemplateValidation {
  if (!isObject(input)) return { ok: false, errors: [{ field: "_root", message: "A template is a JSON object." }] }
  const errors: FieldError[] = []
  const advisories: string[] = []

  if (input.schema !== TEMPLATE_SCHEMA) {
    errors.push({ field: "schema", message: `schema must be "${TEMPLATE_SCHEMA}".` })
  }
  if (typeof input.id !== "string" || !ID_PATTERN.test(input.id)) {
    errors.push({ field: "id", message: "id must be kebab-case: a-z, 0-9 and single hyphens." })
  }
  for (const field of ["title", "description"] as const) errors.push(...textErrors(field, input[field]))

  // settings: the composition's own validation, field enums first and FORBIDDEN after.
  const settings = validate(input.settings)
  if (!settings.ok) {
    if (settings.kind === "invalid_field") {
      errors.push(...settings.errors.map((e) => ({ field: `settings.${e.field}`, message: e.message })))
    } else {
      const rule = settings.rule
      errors.push({
        field: `settings.${rule.field}`,
        message: `${rule.field} "${rule.value}" with ${rule.against} "${rule.againstValue}" is forbidden: ${rule.reason}`,
      })
      return { ok: false, errors, forbidden: rule }
    }
  } else {
    const advisory: AdvisoryRule | null = isAdvisory(settings.value)
    if (advisory) advisories.push(`settings.${advisory.field}: ${advisory.reason}`)
  }

  // theme: every layer from its own list.
  const theme = input.theme
  if (!isObject(theme)) {
    errors.push({ field: "theme", message: "theme must be an object." })
  } else {
    if (oneOf(errors, "theme.palette", theme.palette, ["default", ...THEME_IDS, ...LIGHT_ONLY_THEME_IDS])) {
      const lightOnly = (LIGHT_ONLY_THEME_IDS as readonly string[]).includes(theme.palette)
      if (lightOnly && settings.ok && settings.value.defaultMode !== "light") {
        errors.push({
          field: "settings.defaultMode",
          message: `theme.palette "${theme.palette}" has no dark mode; settings.defaultMode must be "light".`,
        })
      }
    }
    if (!isObject(theme.fontPair)) {
      errors.push({ field: "theme.fontPair", message: "theme.fontPair must be { display, body }." })
    } else {
      oneOf(errors, "theme.fontPair.display", theme.fontPair.display, FONT_NAMES)
      oneOf(errors, "theme.fontPair.body", theme.fontPair.body, FONT_NAMES)
    }
    oneOf(errors, "theme.radius", theme.radius, RADII)
    oneOf(errors, "theme.buttonStyle", theme.buttonStyle, BUTTON_STYLES)
    oneOf(errors, "theme.photoStyle", theme.photoStyle, PHOTO_STYLES)
    oneOf(errors, "theme.density", theme.density, DENSITIES)
  }

  // sections: known home blocks, valid props, and the three slots in step with settings.
  if (!Array.isArray(input.sections) || input.sections.length === 0) {
    errors.push({ field: "sections", message: "sections must be a non-empty array." })
  } else {
    const seen = new Map<string, number>()
    input.sections.forEach((section: unknown, index: number) => {
      const at = `sections[${index}]`
      if (!isObject(section) || typeof section.block !== "string") {
        errors.push({ field: at, message: `${at} must be { block, props? }.` })
        return
      }
      const entry = lookup(section.block)
      if (!entry) {
        errors.push({ field: `${at}.block`, message: `${section.block} is not a registered block.` })
        return
      }
      if (entry.placement !== "home") {
        errors.push({
          field: `${at}.block`,
          message: `${entry.id} is drawn on every page from settings.${entry.setting?.field}; it is not a home section.`,
        })
        return
      }
      seen.set(entry.category, (seen.get(entry.category) ?? 0) + 1)
      if (entry.setting && settings.ok && settings.value[entry.setting.field] !== entry.setting.value) {
        errors.push({
          field: `${at}.block`,
          message: `${entry.id} needs settings.${entry.setting.field} "${entry.setting.value}", the template says "${settings.value[entry.setting.field]}".`,
        })
      }
      const slot = HOME_SLOTS.find((candidate) => candidate.category === entry.category)
      if (!entry.setting && slot && settings.ok && settings.value[slot.field] !== slot.off) {
        errors.push({
          field: `${at}.block`,
          message: `${entry.id} takes the ${slot.field} slot itself and needs settings.${slot.field} "${slot.off}", the template says "${settings.value[slot.field]}".`,
        })
      }
      if (entry.status === "placeholder") {
        advisories.push(`${at}: ${entry.id} is a placeholder and renders another variant.`)
      }
      // A block with a props parser judges its props, absent ones included; a block
      // without one takes none.
      if (entry.parseProps) {
        const parsed = entry.parseProps(section.props)
        if (!parsed.ok) errors.push(...parsed.errors.map((message) => ({ field: `${at}.props`, message })))
      } else if (section.props !== undefined) {
        errors.push({ field: `${at}.props`, message: `${entry.id} takes no props from a template.` })
      }
    })

    if (settings.ok) {
      for (const slot of HOME_SLOTS) {
        const count = seen.get(slot.category) ?? 0
        const on = settings.value[slot.field] !== slot.off
        if (count > 1) {
          errors.push({ field: "sections", message: `${slot.category} appears ${count} times; the slot renders once.` })
        } else if (on && count === 0) {
          errors.push({
            field: "sections",
            message: `settings.${slot.field} is "${settings.value[slot.field]}" but no ${slot.category} section places it.`,
          })
        }
      }
    }
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, value: input as unknown as TemplateManifest, advisories }
}

/* ------------------------------------------------------------------ resolution */

export type ResolvedTemplate = {
  manifest: TemplateManifest
  settings: StorefrontSettingsInput
  /** `data-theme` and `data-mode` of `<html>`. */
  preset: string
  mode: Mode
  /** CSS variables for `<html>`'s inline style, merged over the owner's brand colour. */
  style: Record<string, string>
  /**
   * The pair the template asks for, and whether the page gets it. `pair` is the value of
   * `<html data-font-pair>`: set when both families have files in `public/fonts/templates`
   * (`./fonts.ts`), null otherwise. `loaded` is true then, or when the build profile's own
   * `next/font` pair is this one; a pair with neither shows the build's type.
   */
  fonts: { display: FontName; body: FontName; loaded: boolean; pair: string | null }
}

export function resolveTemplate(manifest: TemplateManifest): ResolvedTemplate {
  const { theme, settings } = manifest
  const pair = templateFontPair(theme.fontPair)
  const fontsLoaded =
    pair !== null ||
    (activeFonts?.display === theme.fontPair.display && activeFonts?.body === theme.fontPair.body)
  return {
    manifest,
    settings,
    preset: theme.palette,
    mode: settings.defaultMode,
    style: {
      "--radius": RADIUS_VALUE[theme.radius],
      ...BUTTON_VARS[theme.buttonStyle],
      "--layer-photo-aspect": PHOTO_ASPECT[theme.photoStyle],
      ...DENSITY_VARS[theme.density],
    },
    fonts: { ...theme.fontPair, loaded: fontsLoaded, pair },
  }
}

/** Re-exported for the contract and the tests: the composition's advisory pairs a template inherits. */
export { ADVISORY }
