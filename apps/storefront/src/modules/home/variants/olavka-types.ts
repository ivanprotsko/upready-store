/**
 * Olavka redesign home blocks (t-2026-09-24-n15, branch `redesign-olavka`): the data
 * shapes the Cover, Navigation and HeroSlider blocks take. A plain module — no
 * `"use client"` / `"use server"` — so the server loaders (`lib/data/olavka-home.ts`),
 * the server wrappers and the client carousel island all import the same types.
 */

/**
 * One slide of the hero slider. TODO(panel editor): today the list is ASSEMBLED
 * (`lib/data/olavka-home.ts`) — the tenant's hero from its home document first, then
 * top-level categories illustrated by one of their own product photographs — because the
 * tenant document (`upready.tenant-home/v1`) has no `slides` field yet. When the panel
 * grows a slides editor, its rows map 1:1 onto this shape and the assembly goes away.
 */
export type OlavkaHeroSlide = {
  /** Stable key — the hero's own id or the category handle. */
  id: string
  /** Where the slide came from; the carousel reads it only for `data-*` attributes. */
  source: "tenant-hero" | "category"
  title: string
  subtitle: string | null
  ctaLabel: string | null
  ctaHref: string | null
  image: string | null
}

/** One entry of the category navigation row. */
export type OlavkaNavItem = {
  id: string
  name: string
  handle: string
  /** `metadata.image_url` of the category when the owner uploaded one, else null. */
  image: string | null
}
