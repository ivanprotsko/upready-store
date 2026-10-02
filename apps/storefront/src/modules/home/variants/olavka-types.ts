/**
 * Olavka redesign home blocks (t-2026-09-24-n15, branch `redesign-olavka`): the data
 * shapes the Cover, Navigation and HeroSlider blocks take. A plain module — no
 * `"use client"` / `"use server"` — so the server loaders (`lib/data/olavka-home.ts`),
 * the server wrappers and the client carousel island all import the same types.
 */

/**
 * One card of the HeroSliders block (Figma 238:17551): a picture, four corner chips —
 * kicker top-left, label top-right, title bottom-left, button bottom-right — and ONE
 * link the whole card carries. Built from the tenant's `content.banners` (the panel's
 * «Баннеры на главной»); with no banners saved, from the shop's course products
 * (`source: "course"`), so an untouched tenant does not get an empty block.
 */
export type OlavkaHeroSlide = {
  id: string
  source: "banner" | "course"
  kicker: string | null
  label: string | null
  title: string
  button: string | null
  image: {
    src: string
    alt: string
    /** Ready `srcset` attribute value (`url 480w, …`) when the picture has variants. */
    srcSet: string | null
    width: number | null
    height: number | null
  } | null
  href: string
  /** `http(s)://` somewhere else: opens in a new tab with `rel="noopener noreferrer"`. */
  external: boolean
}

/** One entry of the category navigation row. */
export type OlavkaNavItem = {
  id: string
  name: string
  handle: string
}
