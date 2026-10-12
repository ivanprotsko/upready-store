import type { TenantHome } from "@lib/data/tenant-home"
import { blockById } from "@modules/blocks/registry"

import { resolveTemplate, validateTemplate, type ResolvedTemplate } from "./manifest"

const warned = new Set<string>()

/**
 * The template a shop saved (t-2026-10-12-33), resolved exactly as the preview resolves a
 * catalogue one: the document's fields are put back into a manifest, checked by the same
 * `validateTemplate()` against the live registry, and turned into the same
 * `ResolvedTemplate` by `resolveTemplate()`. The root layout and the home page then paint
 * it through the code they already run for `?template=`.
 *
 *   - `settings` is the document's own, which applying the template wrote;
 *   - the palette is `theme.preset`, the four layers are `theme.layers`;
 *   - the sections are `content.sections`;
 *   - the font pair is the one the template asked for, so `fonts.loaded` stays honest.
 *
 * Null when the document carries no template, or when what it carries no longer validates
 * (a block left the registry, a layer value was renamed): the shop then renders from its
 * composition, as a shop with no template does, and the reason is logged once per process.
 */
export function resolveSavedTemplate(home: TenantHome): ResolvedTemplate | null {
  const { template, theme, content } = home
  if (!template || !theme.layers || !content.sections) return null

  const result = validateTemplate(
    {
      schema: template.schema,
      id: template.id,
      title: template.id,
      description: `Saved by the shop from ${template.id}.`,
      settings: home.settings,
      theme: { palette: theme.preset, fontPair: template.fontPair, ...theme.layers },
      sections: content.sections,
    },
    blockById
  )
  if (!result.ok) {
    if (!warned.has(template.id)) {
      warned.add(template.id)
      console.warn(
        `[templates] the saved ${template.id} no longer validates; the shop renders from its composition:`,
        result.errors
      )
    }
    return null
  }
  return resolveTemplate(result.value)
}
