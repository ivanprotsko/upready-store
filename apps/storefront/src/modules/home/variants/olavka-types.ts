/**
 * Olavka redesign home blocks (t-2026-09-24-n15, branch `redesign-olavka`): the data
 * shapes the Cover, Navigation and HeroSlider blocks take. A plain module — no
 * `"use client"` / `"use server"` — so the server loaders (`lib/data/olavka-home.ts`),
 * the server wrappers and the client carousel island all import the same types.
 */

/**
 * One slide of the hero slider — Figma 227:9298 «HeroSliders» draws a course banner: a
 * kicker top-left («17 августа»), a tag top-right («Курс»), the title bottom-left, a
 * button bottom-right («Смотреть»). TODO(panel editor): today the list is ASSEMBLED from
 * the tenant's course products (`lib/data/olavka-home.ts`) because the tenant document
 * (`upready.tenant-home/v1`) has no `slides` field; the node's start date has no data
 * behind it yet, so `kicker` is null until the panel writes one. When the panel grows a
 * slides editor, its rows map 1:1 onto this shape and the assembly goes away.
 */
export type OlavkaHeroSlide = {
  /** Stable key — the product handle. */
  id: string
  source: "course"
  title: string
  /** Small uppercase line top-left (a date on the node); null = not drawn. */
  kicker: string | null
  image: string | null
  imageAlt: string
  href: string
}

/** One entry of the category navigation row. */
export type OlavkaNavItem = {
  id: string
  name: string
  handle: string
}
