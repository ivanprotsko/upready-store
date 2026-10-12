import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getTemplate } from "@lib/templates/catalog"
import { validateTemplate } from "@lib/templates/manifest"

import { BLOCKS, CATEGORY_BLOCKS, blockById } from "../../registry"
import RichText from "."
import { richText } from "./block"
import { PRIMARY_LABEL, SECONDARY_LABEL, parseRichTextProps, type RichTextProps } from "./props"

vi.mock("server-only", () => ({}))

const locale = vi.hoisted(() => ({ current: "ru" }))
vi.mock("next-intl/server", () => ({ getLocale: async () => locale.current }))
vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/ru${href}`} {...rest}>
      {children}
    </a>
  ),
}))

const render = async (props: RichTextProps) => {
  const tree = await RichText(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const blank: RichTextProps = {
  eyebrow: {},
  heading: {},
  paragraphs: [],
  primary: null,
  secondary: null,
  align: "left",
  width: "narrow",
  tone: "plain",
}

beforeEach(() => {
  locale.current = "ru"
})

describe("parseRichTextProps", () => {
  it("reads absent props as an empty, left, narrow, plain section", () => {
    expect(parseRichTextProps(undefined)).toEqual({ ok: true, value: blank })
  })

  it("gives a button without a label the block's own Russian and English words", () => {
    const result = parseRichTextProps({ primary: { href: "/store" }, secondary: { href: "/shipping" } })
    expect(result.ok && result.value.primary).toEqual({ href: "/store", label: PRIMARY_LABEL })
    expect(result.ok && result.value.secondary).toEqual({ href: "/shipping", label: SECONDARY_LABEL })
    expect(PRIMARY_LABEL.ru && PRIMARY_LABEL.en && SECONDARY_LABEL.ru && SECONDARY_LABEL.en).toBeTruthy()
  })

  it("refuses bad props with the path of every field", () => {
    const result = parseRichTextProps({
      heading: { xx: "Hello" },
      paragraphs: [{ ru: "ok" }, { ru: "я".repeat(601) }, "plain"],
      primary: { label: { ru: "Каталог" } },
      secondary: { href: "//evil.example" },
      width: "full",
      body: { ru: "old name" },
    })
    expect(result.ok ? [] : result.errors).toEqual([
      "heading.xx: not a language of i18n/config.ts",
      "paragraphs[1].ru is 601 characters, at most 600",
      "paragraphs[2] must be an object of language code to string",
      "primary.href is required",
      "secondary.href: // leads to another site; write https://",
      "width must be one of: narrow, wide",
      "body: not a prop of text/rich-text",
    ])
  })

  it("holds at most six paragraphs", () => {
    const result = parseRichTextProps({ paragraphs: Array.from({ length: 7 }, () => ({ ru: "абзац" })) })
    expect(result.ok ? [] : result.errors).toEqual(["paragraphs has 7 items, at most 6"])
  })
})

describe("RichText", () => {
  it("draws nothing without a heading and a paragraph, eyebrow and buttons or not", async () => {
    expect(await render(blank)).toBeNull()
    expect(
      await render({
        ...blank,
        eyebrow: { ru: "О нас" },
        heading: { ru: "  " },
        paragraphs: [{ ru: "" }],
        primary: { label: PRIMARY_LABEL, href: "/store" },
      })
    ).toBeNull()
    expect(await render(richText.fixtures!.empty)).toBeNull()
  })

  it("falls back to English, then any language, as pickText does", async () => {
    locale.current = "de"
    expect(await render({ ...blank, heading: { fr: "Notre boutique" } })).toContain("Notre boutique")
  })

  it("draws the sample in its section shell with every role and keeps the line breaks", async () => {
    const html = (await render(richText.fixtures!.sample))!
    expect(html).toMatch(/^<section data-block="text\/rich-text" class="py-\[calc\(var\(--layer-section-gap,3rem\)\/2\)\]">/)
    expect(html).toContain('data-role="section-header"')
    expect(html).toMatch(/<p data-role="label"[^>]*>О магазине<\/p>/)
    expect(html).toMatch(/<h2 data-role="heading"[^>]*>[^<]+<\/h2>/)
    const paragraphs = html.match(/<p data-role="description"[^>]*>[^<]*<\/p>/g) ?? []
    expect(paragraphs.length).toBe(richText.fixtures!.sample.paragraphs.length)
    expect(paragraphs.every((p) => p.includes("whitespace-pre-line"))).toBe(true)
    expect(html).toContain("\n")
    expect(html).toMatch(/<a href="\/ru\/store" data-role="cta-primary"[^>]*>Перейти в каталог<\/a>/)
    expect(html).toMatch(/<a href="\/ru\/shipping" data-role="cta-secondary"[^>]*>Доставка и оплата<\/a>/)
  })

  it("keeps the text plain: markup in the props is shown, not run", async () => {
    const html = (await render({ ...blank, paragraphs: [{ ru: '<b>жирный</b> <script>alert(1)</script>' }] }))!
    expect(html).not.toContain("<b>")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;b&gt;жирный&lt;/b&gt;")
  })

  it("lays out left, narrow and plain by default, centre, wide and muted on request, tokens only", async () => {
    const plain = (await render({ ...blank, heading: { ru: "О нас" } }))!
    expect(plain).toContain("max-w-2xl")
    expect(plain).not.toContain("mx-auto")
    expect(plain).not.toContain("text-center")
    expect(plain).not.toContain("bg-[var(--muted)]")

    const muted = (await render({ ...blank, heading: { ru: "О нас" }, align: "center", width: "wide", tone: "muted" }))!
    expect(muted).toContain("max-w-4xl")
    expect(muted).toContain("mx-auto")
    expect(muted).toContain("text-center")
    expect(muted).toContain("bg-[var(--muted)]")
    expect(muted).toContain("rounded-[var(--radius)]")
    expect(muted).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(/i)
  })

  it("draws the primary button in the template's button layer and an https link as a plain anchor", async () => {
    const html = (await render({
      ...blank,
      heading: { ru: "Пишите нам" },
      primary: { label: { ru: "Telegram" }, href: "https://t.me/shop" },
    }))!
    expect(html).toMatch(/<a data-role="cta-primary" href="https:\/\/t\.me\/shop"[^>]*>Telegram<\/a>/)
    expect(html).toContain("bg-[var(--layer-button-bg,var(--primary))]")
    expect(html).toContain("text-[var(--layer-button-fg,var(--primary-foreground))]")
    expect(html).not.toContain('data-role="cta-secondary"')
  })

  it("draws a secondary button alone when the primary is absent", async () => {
    const html = (await render({ ...blank, heading: { ru: "Доставка" }, secondary: { label: SECONDARY_LABEL, href: "/shipping" } }))!
    expect(html).not.toContain('data-role="cta-primary"')
    expect(html).toContain('data-role="cta-secondary"')
  })
})

describe("text/rich-text in the registry", () => {
  it("is a static lab home block with the roles it draws, after the announcement blocks", () => {
    expect(blockById("text/rich-text")).toBe(richText)
    expect(richText).toMatchObject({ category: "text", variant: "rich-text", data: ["static"], status: "lab", placement: "home" })
    expect([...richText.roles].sort()).toEqual(
      ["cta-primary", "cta-secondary", "description", "heading", "label", "section-header"].sort()
    )
    expect(CATEGORY_BLOCKS.text.map((b) => b.id)).toContain("text/rich-text")
    const ids = BLOCKS.map((b) => b.id)
    const lastAnnouncement = Math.max(...CATEGORY_BLOCKS.announcement.map((b) => ids.indexOf(b.id)))
    expect(ids.indexOf("text/rich-text")).toBeGreaterThan(lastAnnouncement)
  })

  it("may stand in a template, and a template's bad props are refused with their path", () => {
    const manifest = structuredClone(getTemplate("long-morning")!.manifest)
    manifest.sections.splice(1, 0, { block: "text/rich-text", props: richText.fixtures!.sample })
    const result = validateTemplate(manifest, blockById)
    expect(result.ok ? [] : result.errors).toEqual([])

    manifest.sections[1] = { block: "text/rich-text", props: { tone: "loud" } }
    const refused = validateTemplate(manifest, blockById)
    expect(refused.ok ? [] : refused.errors.map((e) => e.message)).toEqual(["tone must be one of: plain, muted"])
  })
})
