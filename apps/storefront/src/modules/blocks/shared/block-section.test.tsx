import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import BlockSection from "./block-section"
import { SEE_ALL_LABEL } from "./section-header"
import { SECTION_TYPE } from "./section-type"

vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/ru${href}`} {...rest}>
      {children}
    </a>
  ),
}))

const header = {
  eyebrow: { ru: "Подборка", en: "Selection" },
  heading: { ru: "Новинки недели", en: "New this week" },
  description: { ru: "Пришло в понедельник", en: "Arrived on Monday" },
  seeAll: { href: "/store", label: SEE_ALL_LABEL },
}

describe("BlockSection", () => {
  it("gives the section its id, the template's gap with its fallback and the content container", () => {
    const html = renderToStaticMarkup(
      <BlockSection block="text/probe" locale="ru">
        <p>body</p>
      </BlockSection>
    )
    expect(html).toBe(
      '<section data-block="text/probe" class="py-[calc(var(--layer-section-gap,3rem)/2)]">' +
        '<div class="content-container"><p>body</p></div></section>'
    )
  })

  it("draws the header in the visitor's language, the see-all link through the shop's Link", () => {
    const html = renderToStaticMarkup(
      <BlockSection block="text/probe" locale="ru" header={header}>
        <p>body</p>
      </BlockSection>
    )
    expect(html).toContain('<header data-role="section-header"')
    expect(html).toContain('<p data-role="label"')
    expect(html).toMatch(/<h2 data-role="heading"[^>]*>Новинки недели<\/h2>/)
    expect(html).toMatch(/<p data-role="description"[^>]*>Пришло в понедельник<\/p>/)
    expect(html).toMatch(/<a href="\/ru\/store" data-role="cta-secondary"[^>]*>Смотреть все<\/a>/)
  })

  it("sets the header in the one section type of shared/section-type, the see-all link included", () => {
    const html = renderToStaticMarkup(<BlockSection block="text/probe" locale="ru" header={header} />)
    expect(html).toContain(`<p data-role="label" class="${SECTION_TYPE.label}">`)
    expect(html).toContain(`<h2 data-role="heading" class="${SECTION_TYPE.heading}">`)
    expect(html).toContain(`<p data-role="description" class="${SECTION_TYPE.description}">`)
    const link = html.match(/data-role="cta-secondary" class="([^"]*)"/)?.[1].split(" ") ?? []
    expect(link).toEqual(expect.arrayContaining(SECTION_TYPE.seeAll.split(" ")))
    expect(link.filter((token) => /^(small:)?text-(xs|sm|base|lg|xl|\dxl)$/.test(token))).toEqual(
      SECTION_TYPE.seeAll.split(" ").filter((token) => /^(small:)?text-(xs|sm|base|lg|xl|\dxl)$/.test(token))
    )
  })

  it("gives the see-all link a 44px target with no corner, text-wide on a phone, its words where they were", () => {
    const html = renderToStaticMarkup(<BlockSection block="text/probe" locale="ru" header={header} />)
    const link = html.match(/data-role="cta-secondary" class="([^"]*)"/)?.[1].split(" ") ?? []
    // QR-HIT: every target ≥ 44px high. QR-RADIUS: radii only 6 · --radius · 12 · pill, and rounded-sm was 2px.
    expect(link).toEqual(expect.arrayContaining(["inline-flex", "min-h-11", "items-center"]))
    expect(link.filter((token) => token.startsWith("rounded"))).toEqual([])
    // The header is a column below `small`: the link keeps its own width there, the row's items-end above it.
    expect(link).toEqual(expect.arrayContaining(["self-start", "small:self-auto"]))
    // The taller box grows into the gap under the header, so the words stay level with the heading.
    expect(link).toContain("-mb-3")
    // Colour, hover underline and focus ring stay as they were.
    expect(link).toEqual(
      expect.arrayContaining([
        "text-ui-fg-interactive",
        "underline-offset-4",
        "hover:text-ui-fg-interactive-hover",
        "hover:underline",
        "focus-visible:outline",
        "focus-visible:outline-2",
        "focus-visible:outline-offset-4",
        "focus-visible:outline-ui-fg-interactive",
      ])
    )
  })

  it("keeps an https see-all link a plain anchor, and draws no header without words", () => {
    const outside = renderToStaticMarkup(
      <BlockSection block="text/probe" locale="en" header={{ ...header, seeAll: { href: "https://t.me/shop", label: SEE_ALL_LABEL } }} />
    )
    expect(outside).toMatch(/<a data-role="cta-secondary" href="https:\/\/t\.me\/shop"[^>]*>See all<\/a>/)

    const empty = renderToStaticMarkup(
      <BlockSection block="text/probe" locale="ru" header={{ eyebrow: {}, heading: {}, description: {}, seeAll: null }} />
    )
    expect(empty).not.toContain("<header")
  })

  it("leaves the full width to a banner, its header still in the container", () => {
    const html = renderToStaticMarkup(
      <BlockSection block="banner/probe" locale="ru" width="full" header={header}>
        <div>wide</div>
      </BlockSection>
    )
    expect(html).toContain('class="content-container mb-')
    expect(html).toMatch(/<\/header><div>wide<\/div><\/section>$/)
  })
})
