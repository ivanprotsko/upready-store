import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { TenantArticleSummary } from "@lib/data/tenant-articles"
import MarkdownContent from "@modules/content/components/markdown-content"
import ArticleToc from "@modules/journal/components/article-toc"
import ArticleTocFab from "@modules/journal/components/article-toc-fab"
import CategoryRail from "@modules/journal/components/category-rail"
import FeedRow from "@modules/journal/components/feed-row"
import JournalHero from "@modules/journal/components/journal-hero"
import Masthead from "@modules/journal/components/masthead"
import NextArticleLink from "@modules/journal/components/next-article-link"

/**
 * t-2026-10-05-03. Ivan: «я не понял, почему дизайн журнала черкашино отличается от того,
 * который был в проекте chrxnasdmds?» The journal is rebuilt after the chrxnasdmds «Журнал
 * здоровья»; these suites pin the parts of each component the reference shows, the data the
 * shop does not have (authors, read times) staying out, and the theme tokens as the only
 * source of colour.
 */

vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/ru${href}`} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("next/image", () => ({
  default: ({ src, alt, sizes }: { src: string; alt: string; sizes?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- the test reads the markup, not the optimiser
    <img src={src} alt={alt} sizes={sizes} />
  ),
}))

const article = (n: number, over: Partial<TenantArticleSummary> = {}): TenantArticleSummary => ({
  slug: `statya-${n}`,
  locale: "ru",
  title: `Статья ${n}`,
  excerpt: `Анонс ${n}`,
  cover_url: `https://cdn.test/cover-${n}.webp`,
  status: "published",
  published: true,
  published_at: "2026-09-12T00:00:00.000Z",
  category: "Пептиды",
  author: "Выдуманный Автор",
  tags: [],
  reading_minutes: 7,
  ...over,
})

const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0

/** A hex, rgb() or hsl() colour written into a class or a style: rule 27 allows tokens only. */
const RAW_COLOUR = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i

describe("MarkdownContent, the article variant", () => {
  const body = [
    "> **Кратко**",
    "> - Первый вывод",
    "> - Второй вывод",
    "",
    "## Почему детокс не заходит",
    "",
    "Абзац текста.",
    "",
    "### Шаг первый",
    "",
    "- пункт",
  ].join("\n")

  it("gives every heading the anchor the TOC links to", () => {
    const html = renderToStaticMarkup(<MarkdownContent source={body} variant="article" />)
    expect(html).toContain('<h2 id="почему-детокс-не-заходит"')
    expect(html).toContain('<h3 id="шаг-первый"')
    expect(html).toContain("scroll-mt-24")
  })

  it("draws the «Кратко» quote as a callout with a title and numbered points", () => {
    const html = renderToStaticMarkup(<MarkdownContent source={body} variant="article" />)
    expect(html).toContain('data-testid="article-callout"')
    expect(html).toContain("Кратко")
    expect(count(html, /<li/g)).toBe(3)
    expect(html).toMatch(/<ol[^>]*>/)
  })

  it("leaves the default variant as it was: no anchors, no callout", () => {
    const html = renderToStaticMarkup(<MarkdownContent source={body} />)
    expect(html).not.toContain('id="почему-детокс-не-заходит"')
    expect(html).not.toContain("article-callout")
  })
})

describe("Masthead", () => {
  it("centres the title between two hairlines with the subtitle under it", () => {
    const html = renderToStaticMarkup(<Masthead title="Журнал здоровья" subtitle="Травы и ритуалы" />)
    expect(html).toContain('data-testid="journal-heading"')
    expect(count(html, /h-px flex-1 bg-ui-border-base/g)).toBe(2)
    expect(html).toContain("Травы и ритуалы")
  })

  it("draws no subtitle paragraph without one", () => {
    const html = renderToStaticMarkup(<Masthead title="Журнал" />)
    expect(html).not.toContain("<p")
  })
})

describe("JournalHero", () => {
  it("puts the lead article large and two beside it, with no author or reading time", () => {
    const html = renderToStaticMarkup(
      <JournalHero main={article(1)} aside={[article(2), article(3)]} />
    )
    expect(count(html, /data-testid="journal-hero-main"/g)).toBe(1)
    expect(count(html, /data-testid="journal-hero-aside"/g)).toBe(2)
    expect(html).toContain('href="/ru/journal/statya-1"')
    expect(html).not.toContain("Выдуманный Автор")
    expect(html).not.toMatch(/мин\b|min read/)
    expect(html).not.toMatch(RAW_COLOUR)
  })

  it("skips the rubric line of an article without one", () => {
    const html = renderToStaticMarkup(
      <JournalHero main={article(1, { category: null })} aside={[]} />
    )
    expect(html).not.toContain("Пептиды")
  })
})

describe("FeedRow", () => {
  it("draws the titles column and the compact cards", () => {
    const html = renderToStaticMarkup(
      <FeedRow title="Лента" cards={[article(4), article(5), article(6)]} list={[article(7)]} />
    )
    expect(html).toContain('id="journal-feed-heading"')
    expect(count(html, /data-testid="journal-feed-card"/g)).toBe(3)
    expect(count(html, /data-testid="journal-feed-item"/g)).toBe(1)
  })

  it("renders nothing with nothing to list", () => {
    expect(renderToStaticMarkup(<FeedRow title="Лента" cards={[]} list={[]} />)).toBe("")
  })
})

describe("CategoryRail", () => {
  const labels = { previous: "Назад", next: "Далее" }

  it("draws a rubric as a scroll-snap rail with two arrows and cards without excerpts", () => {
    const html = renderToStaticMarkup(
      <CategoryRail title="Пептиды" index={0} articles={[article(1), article(2)]} labels={labels} />
    )
    expect(html).toContain('id="journal-rubric-0"')
    expect(html).toContain('aria-label="Назад"')
    expect(html).toContain('aria-label="Далее"')
    expect(html).toContain("snap-x")
    expect(count(html, /data-testid="category-rail-card"/g)).toBe(2)
    expect(html).not.toContain("Анонс 1")
  })

  it("renders nothing for a rubric with no article in this language", () => {
    expect(
      renderToStaticMarkup(<CategoryRail title="Detox" index={1} articles={[]} labels={labels} />)
    ).toBe("")
  })
})

describe("ArticleToc and its phone button", () => {
  const items = [
    { id: "a", title: "Раздел", level: 2 as const },
    { id: "b", title: "Подраздел", level: 3 as const },
  ]

  it("links every entry to its heading, sub-entries indented", () => {
    const html = renderToStaticMarkup(<ArticleToc items={items} label="В этой статье" />)
    expect(html).toContain('href="#a"')
    expect(html).toContain('href="#b"')
    expect(count(html, /data-testid="article-toc-link"/g)).toBe(2)
    expect(html).toContain("ps-7")
  })

  it("renders nothing without entries", () => {
    expect(renderToStaticMarkup(<ArticleToc items={[]} label="В этой статье" />)).toBe("")
  })

  it("starts as a closed pill below 720 px, the sheet not yet drawn", () => {
    const html = renderToStaticMarkup(
      <ArticleTocFab items={items} labels={{ toc: "В этой статье", close: "Закрыть" }} />
    )
    expect(html).toContain('data-testid="article-toc-fab-button"')
    expect(html).toContain("min-[720px]:hidden")
    expect(html).not.toContain('data-testid="article-toc-sheet"')
  })
})

describe("NextArticleLink", () => {
  it("links the next article under the «Читать далее» label", () => {
    const html = renderToStaticMarkup(
      <NextArticleLink
        href="/journal/statya-2"
        title="Статья 2"
        label="Читать далее"
        titleId="journal-article-title"
      />
    )
    expect(html).toContain('href="/ru/journal/statya-2"')
    expect(html).toContain("Читать далее")
    expect(html).toContain('data-testid="next-article-link"')
  })
})

describe("the journal's sources", () => {
  const STOREFRONT = join(__dirname, "../../..")
  const files = [
    "src/modules/journal/typography.ts",
    "src/modules/journal/components/article-toc/index.tsx",
    "src/modules/journal/components/article-toc-fab/index.tsx",
    "src/modules/journal/components/category-rail/index.tsx",
    "src/modules/journal/components/category-rail/track.tsx",
    "src/modules/journal/components/feed-row/index.tsx",
    "src/modules/journal/components/journal-hero/index.tsx",
    "src/modules/journal/components/masthead/index.tsx",
    "src/modules/journal/components/next-article-link/index.tsx",
    "src/modules/journal/components/section-header/index.tsx",
    "src/modules/journal/components/article-cover/index.tsx",
    "src/app/[locale]/(main)/journal/page.tsx",
    "src/app/[locale]/(main)/journal/[slug]/page.tsx",
  ]

  it.each(files)("%s paints with theme tokens only", (file) => {
    const source = readFileSync(join(STOREFRONT, file), "utf8")
    expect(source).not.toMatch(RAW_COLOUR)
    // An opacity modifier on a bare var() colour compiles to nothing; color-mix is the way.
    expect(source).not.toMatch(/var\(--[a-z-]+\)\]\/\d+/)
  })
})
