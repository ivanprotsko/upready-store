import { blockById } from "@modules/blocks/registry"

import { resolveTemplate, validateTemplate, type ResolvedTemplate } from "./manifest"
import longMorning from "../../templates/long-morning/template.json"
import ferrite from "../../templates/ferrite/template.json"
import katalog from "../../templates/katalog/template.json"
import lending from "../../templates/lending/template.json"
import moda from "../../templates/moda/template.json"
import opt from "../../templates/opt/template.json"
import uhod from "../../templates/uhod/template.json"

/**
 * Every template of this branch, `src/templates/<id>/template.json` (t-2026-10-12-33). A
 * new template is one import and one line below; `manifest.test.ts` validates each of them
 * and fails on the first error, so an invalid file never reaches a preview.
 */
export const TEMPLATE_SOURCES: Record<string, unknown> = {
  "long-morning": longMorning,
  ferrite,
  katalog,
  lending,
  moda,
  opt,
  uhod,
}

export const TEMPLATE_IDS = Object.keys(TEMPLATE_SOURCES)

/** The template, validated and resolved, or null when it is unknown or invalid (logged). */
export function getTemplate(id: string): ResolvedTemplate | null {
  const source = TEMPLATE_SOURCES[id]
  if (!source) return null
  const result = validateTemplate(source, blockById)
  if (!result.ok) {
    console.warn(`[templates] ${id} is invalid and is not previewed:`, result.errors)
    return null
  }
  return resolveTemplate(result.value)
}
