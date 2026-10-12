import type { ComponentType } from "react"

import type { StorefrontSettingsInput } from "@lib/theme/composition"

/**
 * One block variant as the template programme sees it (t-2026-10-12-33,
 * `docs/templates/BLOCK-CONTRACT.md`). A template names blocks by id, `<category>/<variant>`;
 * the registry (`./registry.ts`) answers which component that is, what it shows and where
 * it may stand.
 *
 * Pure module, no JSX: the manifest validator (`lib/templates/manifest.ts`) and the tests
 * read the entries without rendering anything.
 */

/** The block families. The first five are the composition slots that exist today. */
export type BlockCategory = "header" | "hero" | "tiles" | "listing" | "footer" | "announcement"

export const BLOCK_CATEGORIES: readonly BlockCategory[] = [
  "header",
  "hero",
  "tiles",
  "listing",
  "footer",
  "announcement",
]

/** `<category>/<variant>`, e.g. `hero/g`, `announcement/text-bar`. */
export type BlockId = `${BlockCategory}/${string}`

/**
 * What the block draws, as element roles. The same vocabulary the competitor teardowns use
 * (A-2026-10-12-55, point 2), so a section of another platform maps onto our blocks role
 * by role rather than by eye.
 */
export type BlockRole =
  | "brand"
  | "navigation"
  | "search"
  | "cart"
  | "category-links"
  | "heading"
  | "body-text"
  | "cta-primary"
  | "media"
  | "product-card"
  | "price"
  | "promo-text"
  | "newsletter"
  | "legal"
  | "contacts"

/** Where the block's content comes from. */
export type BlockData =
  /** the shop's products, read through `lib/data` */
  | "products"
  /** the shop's categories, read through `lib/data` */
  | "categories"
  /** the shop's own home document or settings (name, copy, links) */
  | "shop"
  /** the build profile baked into the image (single-store stands only) */
  | "profile"
  /** only the props the template gives it */
  | "static"

/**
 * `live`: part of the composition contract, a tenant can save it today.
 * `lab`: exists on the `templates/*` branches only; a template may use it, the panel not yet.
 * `placeholder`: a key that renders another variant until its own one is built (footer f4).
 */
export type BlockStatus = "live" | "lab" | "placeholder"

/** `site`: header and footer, drawn by `(main)/layout.tsx` on every page. `home`: a home section. */
export type BlockPlacement = "site" | "home"

export type PropsResult<P> = { ok: true; value: P } | { ok: false; errors: string[] }

export type BlockEntry<P extends object = object> = {
  id: BlockId
  category: BlockCategory
  variant: string
  /** English working name for the playground and the contact sheet; never shown to a shopper. */
  title: string
  /** The next-intl key the panel shows for it; set once the block is `live`. */
  labelKey?: string
  roles: readonly BlockRole[]
  data: readonly BlockData[]
  status: BlockStatus
  placement: BlockPlacement
  /**
   * For a variant of the composition document: the field and value that select it. A
   * template that lists the block must carry the same value in its `settings`.
   */
  setting?: { field: keyof StorefrontSettingsInput; value: string }
  /** The component, by reference. Existing variants stay where they are. */
  component: ComponentType<P>
  /** Validates a template's `props` for this block. Absent: the block takes no props. */
  parseProps?: (input: unknown) => PropsResult<P>
  /** Props for the playground: what an empty shop shows, and a filled example. */
  fixtures?: { empty: P; sample: P }
}
