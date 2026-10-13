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

/**
 * The block families, declared up front so that no block PR edits this file. The first five
 * are the composition slots that exist today; `announcement` holds the first lab block; the
 * next fourteen are the build list of the Shopify catalogue (R1,
 * `artifacts/research/2026-10-13-templates-shopify/report.md`); `trust`, `delivery` and
 * `contacts` are for the Russian-market blocks: payment and marketplace badges, delivery and
 * pick-up, contacts with a map; `logos` for a band of the brands a shop carries, from R2's
 * `logo-list`. Each has its file, `./<category>/index.ts`; the order is the registry's and the
 * playground's.
 */
export const BLOCK_CATEGORIES = [
  "header",
  "hero",
  "tiles",
  "listing",
  "footer",
  "announcement",
  "text",
  "media",
  "columns",
  "collection",
  "testimonials",
  "newsletter",
  "banner",
  "collage",
  "slideshow",
  "faq",
  "video",
  "blog",
  "promo",
  "countdown",
  "trust",
  "delivery",
  "contacts",
  "logos",
] as const

export type BlockCategory = (typeof BLOCK_CATEGORIES)[number]

/** `<category>/<variant>`, e.g. `hero/g`, `announcement/text-bar`. */
export type BlockId = `${BlockCategory}/${string}`

/**
 * What the block draws, as element roles. The same vocabulary the competitor teardowns use
 * (A-2026-10-12-55, point 2), so a section of another platform maps onto our blocks role
 * by role rather than by eye: every role of R1's `roles.json` (Shopify: 46 words of the
 * ui-upready-dev-monorepo analyser, 10 extensions) and of R2's (InSales and Tilda: 44 and 19,
 * 12 of them new here), plus `marketplace-badge` from R2's build list, next to the ones this
 * file had, sorted, one per line. `roles.test.ts` fails when either `roles.json` names a role
 * missing here. R2's Russian-market roles, by group:
 * - ordering: `step` (a numbered «how to order» step), `delivery-badge` (СДЭК, Почта России, pickup), `payment-badge` (СБП, Мир, Долями);
 * - buying from a card: `one-click-buy` («Купить в 1 клик»), `phone-form` (name and phone to the manager), `stock-badge` (in stock, out, preorder), `bonus-badge` (bonuses, cashback);
 * - keeping for later: `wishlist-toggle` and `compare-toggle` (on a product card), `drawer` (a side panel over the page: cart, favourites);
 * - the shop beyond the page: `story-circle` (a round thumbnail opening a full-screen story), `map` (Яндекс Карты, 2ГИС), `marketplace-badge` (the same shop on Ozon, Wildberries, Яндекс Маркет).
 */
export const BLOCK_ROLES = [
  "author-info",
  "badge",
  "body-text",
  "bonus-badge",
  "brand",
  "brand-logo",
  "brand-slider",
  "breadcrumb",
  "card",
  "card-image",
  "card-title",
  "cart",
  "category-links",
  "close-button",
  "compare-slider",
  "compare-toggle",
  "contacts",
  "content",
  "countdown",
  "cta-group",
  "cta-primary",
  "cta-secondary",
  "delivery-badge",
  "description",
  "dialog",
  "drawer",
  "feature-card",
  "filter",
  "form",
  "heading",
  "headline",
  "hero-image",
  "hotspot",
  "icon",
  "icon-button",
  "icon-wrapper",
  "input",
  "label",
  "legal",
  "legal-links",
  "logo",
  "map",
  "marketplace-badge",
  "marquee",
  "media",
  "mobile-menu",
  "nav",
  "nav-column",
  "nav-link",
  "navigation",
  "newsletter",
  "newsletter-form",
  "one-click-buy",
  "pagination",
  "payment-badge",
  "phone-form",
  "price",
  "product-card",
  "promo-text",
  "quantity-input",
  "quote-text",
  "search",
  "section-header",
  "social-link",
  "sort",
  "star-rating",
  "step",
  "stock-badge",
  "story-circle",
  "tab-content",
  "tab-list",
  "tab-trigger",
  "table",
  "table-row",
  "testimonial-card",
  "trigger",
  "variant-picker",
  "video-player",
  "wishlist-toggle",
] as const

export type BlockRole = (typeof BLOCK_ROLES)[number]

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
  /**
   * Props for the playground: what an empty shop shows, and a filled example. Any further one is a
   * named state of the block (`collage/mosaic`'s `five`), drawn under its own anchor
   * `block-<category>-<variant>-<name>`.
   */
  fixtures?: { empty: P; sample: P; [name: string]: P }
}
