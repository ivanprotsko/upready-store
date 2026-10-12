// hint -> canonical section id (or EXCLUDED/unknown), with per-theme overrides found by looking at the shots.
import { CATALOG, EXCLUDED } from "./catalog.mjs"
const SYN = new Map(); for (const c of CATALOG) for (const s of c.syn) SYN.set(s, c.section)
// Theme-specific names that collide with another theme's meaning, checked against the shots.
export const OVERRIDES = {
  "impulse:featured-collections": "collection-list", // collection tiles (collection-item), not tabs
  "motion:featured-collections": "collection-list", // collection tiles with labels, not tabs
  "impulse:shoppable-hero": "shop-the-look", // image with product hotspots (kit-shoppable-hero)
  "horizon:collection:section": "main-collection-banner", // Horizon's generic section holding only the collection title «New in» above the grid
}
export function resolve(slug, page, s) {
  const o = OVERRIDES[`${slug}:${page}:${s.key}`]; if (o) return { section: o, via: "override after looking at the shot" }
  for (const h of s.hints || []) {
    if (h.hint === "main") return { section: page === "collection" ? "main-collection-product-grid" : page === "product" ? "main-product" : "rich-text", via: h.via + ` (the template's main section on a ${page} page)` }
    const o2 = OVERRIDES[`${slug}:${h.hint}`]; if (o2) return { section: o2, via: h.via + ", read against the shot" }
    if (EXCLUDED.includes(h.hint)) return { section: "#excluded", via: h.via }
    const base = h.hint.replace(/^main-/, "").replace(/-(section|template)$/, "")
    const c = SYN.get(h.hint) || SYN.get(base); if (c) return { section: c, via: h.via }
  }
  return null
}
