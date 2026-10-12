import type { ComponentType } from "react"

import {
  FOOTER_KEYS,
  HEADER_KEYS,
  HERO_KEYS,
  LISTING_KEYS,
  type StorefrontSettingsInput,
} from "@lib/theme/composition"
import CategoryTiles from "@modules/home/components/category-tiles"
import { HERO_VARIANTS, LISTING_VARIANTS } from "@modules/home/variants"
import { FOOTER_VARIANTS } from "@modules/layout/templates/footer/variants"
import { NAV_VARIANTS } from "@modules/layout/templates/nav/variants"

import type { BlockCategory, BlockData, BlockEntry, BlockId, BlockRole, BlockStatus } from "./types"

/**
 * Every variant of the composition document, registered by reference (t-2026-10-12-33).
 * Nothing moved: each `component` is the very entry of the registry the live switch reads
 * (`HERO_VARIANTS`, `LISTING_VARIANTS`, `NAV_VARIANTS`, `FOOTER_VARIANTS`), and the keys
 * are walked from the enums of `lib/theme/composition.ts`, so a key added there and not
 * described here fails `registry.test.ts`.
 *
 * Titles are the English of the panel's own labels (`messages/en.json`, `Composition.*`),
 * and `labelKey` is that key, so the template picker shows what the composition popover
 * shows today.
 */

type Meta = { roles: readonly BlockRole[]; data: readonly BlockData[]; status?: BlockStatus; title: string }

const HEADER_ROLES: readonly BlockRole[] = ["brand", "navigation", "search", "cart"]
const HEADER_STRIP: readonly BlockRole[] = [...HEADER_ROLES, "category-links"]
const FOOTER_ROLES: readonly BlockRole[] = ["brand", "navigation", "category-links", "legal"]

const HEADER_META: Record<(typeof HEADER_KEYS)[number], Meta> = {
  h1: { title: "As it is today", roles: HEADER_ROLES, data: ["shop"] },
  h2: { title: "Left, menu in a row", roles: HEADER_STRIP, data: ["shop", "categories"] },
  h3: { title: "Two tiers", roles: [...HEADER_STRIP, "promo-text"], data: ["shop", "categories"] },
  h4: { title: "Accent", roles: HEADER_STRIP, data: ["shop", "categories"] },
  h5: { title: "Slim + category strip", roles: HEADER_STRIP, data: ["shop", "categories"] },
  h6: { title: "Centre + category strip", roles: HEADER_STRIP, data: ["shop", "categories"] },
}

const HERO_META: Record<Exclude<(typeof HERO_KEYS)[number], "none">, Meta> = {
  g: { title: "Showcase", roles: ["heading", "media", "cta-primary", "price"], data: ["products"] },
  h: { title: "Shelf", roles: ["heading", "body-text", "product-card", "price"], data: ["products", "shop"] },
  j: { title: "Three doors", roles: ["heading", "media", "cta-primary"], data: ["products", "profile"] },
  k: { title: "Announcement", roles: ["heading", "body-text", "cta-primary"], data: ["profile"] },
  l: { title: "In motion", roles: ["heading", "media"], data: ["profile"], status: "placeholder" },
  m: { title: "No hero, text only", roles: ["heading", "body-text"], data: ["shop", "products"] },
  ga: { title: "Carousel with neighbours", roles: ["heading", "media", "category-links"], data: ["categories"] },
  gb: { title: "Stripes", roles: ["heading", "media", "category-links"], data: ["categories"] },
}

const LISTING_META: Record<Exclude<(typeof LISTING_KEYS)[number], "none">, Meta> = {
  p1: { title: "Grid of 4", roles: ["heading", "product-card", "price"], data: ["products"] },
  p2: { title: "Dense 6", roles: ["heading", "product-card", "price"], data: ["products"] },
  p3: { title: "Spec list", roles: ["heading", "product-card", "price", "body-text"], data: ["products"] },
  p4: { title: "Wall", roles: ["product-card", "media", "price"], data: ["products"] },
  p5: { title: "Editorial", roles: ["heading", "body-text", "product-card", "media"], data: ["products"] },
}

const FOOTER_META: Record<Exclude<(typeof FOOTER_KEYS)[number], "none">, Meta> = {
  f1: { title: "Four columns", roles: FOOTER_ROLES, data: ["shop", "categories"] },
  f2: { title: "One row", roles: FOOTER_ROLES, data: ["shop", "categories"] },
  f3: { title: "Giant wordmark", roles: [...FOOTER_ROLES, "promo-text"], data: ["shop", "categories"] },
  // Renders `FooterF1` until a newsletter endpoint exists (`footer/variants/index.ts`).
  f4: { title: "Inverted, with newsletter", roles: FOOTER_ROLES, data: ["shop", "categories"], status: "placeholder" },
  f5: { title: "Terms as tiles", roles: [...FOOTER_ROLES, "promo-text"], data: ["shop", "categories"] },
  f6: { title: "Inverted giant wordmark", roles: FOOTER_ROLES, data: ["shop", "categories"] },
  f7: { title: "Framed columns with badges", roles: [...FOOTER_ROLES, "contacts"], data: ["shop"] },
}

function entries(
  category: BlockCategory,
  field: keyof StorefrontSettingsInput,
  meta: Record<string, Meta>,
  components: Record<string, ComponentType<object>>
): BlockEntry[] {
  return Object.entries(meta).map(([variant, m]) => ({
    id: `${category}/${variant}` as BlockId,
    category,
    variant,
    title: m.title,
    labelKey: `Composition.${field}.${variant}`,
    roles: m.roles,
    data: m.data,
    status: m.status ?? "live",
    placement: category === "header" || category === "footer" ? "site" : "home",
    setting: { field, value: variant },
    component: components[variant],
  }))
}

export const EXISTING_BLOCKS: readonly BlockEntry[] = [
  ...entries("header", "header", HEADER_META, NAV_VARIANTS),
  ...entries("hero", "hero", HERO_META, HERO_VARIANTS as Record<string, ComponentType<object>>),
  {
    id: "tiles/on",
    category: "tiles",
    variant: "on",
    title: "Category tiles",
    labelKey: "Composition.tiles.on",
    roles: ["heading", "category-links", "media"],
    data: ["categories"],
    status: "live",
    placement: "home",
    setting: { field: "tiles", value: "on" },
    component: CategoryTiles as ComponentType<object>,
  },
  ...entries("listing", "listing", LISTING_META, LISTING_VARIANTS as Record<string, ComponentType<object>>),
  ...entries("footer", "footer", FOOTER_META, FOOTER_VARIANTS),
]
