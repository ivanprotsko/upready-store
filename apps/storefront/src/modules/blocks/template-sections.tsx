import { Fragment, type ReactNode } from "react"

import type { HomeBlockKey } from "@modules/home/variants"
import type { TemplateSection } from "@lib/templates/manifest"

import { blockById } from "./registry"

/** The home slot each composition category fills on `(main)/page.tsx`. */
const SLOT_OF: Partial<Record<string, HomeBlockKey>> = {
  hero: "hero",
  tiles: "categories",
  listing: "products",
}

/**
 * The home page of a template (t-2026-10-12-33), previewed or saved by the shop, section
 * by section. A hero, tiles or listing variant of the composition is the page's own slot,
 * built by `(main)/page.tsx` exactly as it builds it for the shop (its variant already comes
 * from the template's `settings`, the validator holds the two in step); every other block,
 * a hero written for templates included, is drawn from the registry with the props the
 * template gives it, parsed once more on the way in.
 *
 * Only `(main)/page.tsx` renders this, and only when `getActiveTemplate()` answered.
 */
export default function TemplateSections({
  sections,
  slots,
}: {
  sections: readonly TemplateSection[]
  slots: Record<HomeBlockKey, ReactNode>
}) {
  return sections.map((section, index) => {
    const entry = blockById(section.block)
    if (!entry) return null
    const key = `${index}-${entry.id}`
    // Only a composition variant is the shop's own slot; a block written for templates
    // (`hero/split`) stands in its place with the template's props (the validator turns the slot off).
    const slot = entry.setting ? SLOT_OF[entry.category] : undefined
    if (slot) return <Fragment key={key}>{slots[slot]}</Fragment>
    const props = entry.parseProps ? entry.parseProps(section.props) : { ok: true as const, value: {} }
    if (!props.ok) return null
    const Block = entry.component
    return <Block key={key} {...props.value} />
  })
}
