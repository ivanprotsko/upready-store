import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createTranslator } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TenantArticle, TenantArticleSummary } from "@lib/data/tenant-articles"

/**
 * t-2026-10-05-03. The two journal pages, composed after the chrxnasdmds «Журнал здоровья»
 * (Ivan, 26.10: «я не понял, почему дизайн журнала черкашино отличается от того, который
 * был в проекте chrxnasdmds?»). The pages are async server components: they are called with
 * the data layer mocked, and their markup is read. Each state of `content-contract.md` has
 * its case here.
 */

const STOREFRONT = join(__dirname, "../../../../..")
const messages = JSON.parse(readFileSync(join(STOREFRONT, "messages/ru.json"), "utf8"))

let journal: TenantArticleSummary[] = []
let categories: { category: string; count: number }[] = []
let olavka = false
let current: TenantArticle | null = null

const listTenantArticles = vi.fn(
  async (params: { limit?: number; offset?: number; category?: string }) => {
    const all = params.category
      ? journal.filter((a) => a.category === params.category)
      : journal
    const offset = params.offset ?? 0
    return {
      articles: all.slice(offset, offset + (params.limit ?? 12)),
      count: all.length,
      limit: params.limit ?? 12,
      offset,
    }
  }
)

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: "ru", messages, namespace }),
  getLocale: async () => "ru",
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}))
vi.mock("@lib/data/tenant-articles", () => ({
  listTenantArticles: (params: { limit?: number }) => listTenantArticles(params),
  listTenantArticleCategories: async () => categories,
  getTenantArticle: async () => current,
  getTenantArticleWithRelated: async () =>
    current ? { article: current, related: journal.slice(0, 3) } : null,
}))
vi.mock("@lib/data/olavka-shop", () => ({ isOlavkaShop: async () => olavka }))
vi.mock("@lib/data/cookies", () => ({
  getSiteName: async () => "Черкашино",
  getRequestBaseURL: async () => "https://shop.test",
}))
vi.mock("@lib/util/page-title", () => ({ pageTitle: async (title: string) => title }))
vi.mock("@lib/util/alternates", () => ({ buildAlternates: async () => ({}) }))
vi.mock("@lib/util/json-ld", () => ({
  localeUrl: (base: string, locale: string, path: string) => `${base}/${locale}${path}`,
}))
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

const summary = (n: number, over: Partial<TenantArticleSummary> = {}): TenantArticleSummary => ({
  slug: `statya-${n}`,
  locale: "ru",
  title: `Статья ${n}`,
  excerpt: `Анонс ${n}`,
  cover_url: `https://cdn.test/cover-${n}.webp`,
  status: "published",
  published: true,
  published_at: "2026-09-12T00:00:00.000Z",
  category: n % 2 ? "Пептиды" : "Детокс",
  author: "Выдуманный Автор",
  tags: [],
  reading_minutes: 7,
  ...over,
})

const full = (n: number, body: string): TenantArticle => ({
  ...summary(n),
  id: `article-${n}`,
  body,
  seo_title: null,
  seo_description: null,
})

const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0

const renderFeed = async (searchParams: { page?: string; category?: string } = {}) => {
  const { default: JournalFeed } = await import("./page")
  return renderToStaticMarkup(
    await JournalFeed({
      params: Promise.resolve({ locale: "ru" }),
      searchParams: Promise.resolve(searchParams),
    })
  )
}

const renderArticle = async (slug: string) => {
  const { default: JournalArticle } = await import("./[slug]/page")
  return renderToStaticMarkup(await JournalArticle({ params: Promise.resolve({ slug }) }))
}

beforeEach(() => {
  journal = Array.from({ length: 9 }, (_, i) => summary(i + 1))
  categories = [
    { category: "Пептиды", count: 5 },
    { category: "Детокс", count: 4 },
    { category: "Detox", count: 4 },
  ]
  olavka = false
  current = null
  listTenantArticles.mockClear()
})

// The first import pulls `@medusajs/ui` in; under a full parallel run it outlasts vitest's
// default 5 s.
describe("/journal", { timeout: 30_000 }, () => {
  it("composes the masthead, the hero, the «Лента» row and one rail per rubric", async () => {
    const html = await renderFeed()
    expect(html).toContain('data-testid="journal-masthead"')
    expect(count(html, /data-testid="journal-hero-main"/g)).toBe(1)
    expect(count(html, /data-testid="journal-hero-aside"/g)).toBe(2)
    expect(count(html, /data-testid="journal-feed-card"/g)).toBe(3)
    expect(count(html, /data-testid="journal-feed-item"/g)).toBe(3)
    // «Detox» is the English rubric: no Russian article carries it, so no empty rail.
    expect(count(html, /data-testid="category-rail"/g)).toBe(2)
    expect(html).not.toContain("Выдуманный Автор")
    expect(html).not.toContain("journal-pagination")
  })

  it("titles the masthead «Журнал» with the shop's line, «Журнал здоровья» on an Olavka shop", async () => {
    expect(await renderFeed()).toContain("Статьи магазина Черкашино.")
    olavka = true
    const html = await renderFeed()
    expect(html).toContain(messages.OlavkaHome.journal.title)
    expect(html).toContain(messages.OlavkaHome.journal.subtitle)
  })

  it("shows the hero and the feed without rubric rails when no article has a rubric (journal-no-categories)", async () => {
    journal = journal.map((a) => ({ ...a, category: null }))
    categories = []
    const html = await renderFeed()
    expect(html).toContain('data-testid="journal-hero"')
    expect(html).not.toContain('data-testid="category-rail"')
  })

  it("keeps the masthead and says so when the shop has no article (journal-empty)", async () => {
    journal = []
    categories = []
    const html = await renderFeed()
    expect(html).toContain('data-testid="journal-masthead"')
    expect(html).toContain('data-testid="journal-empty"')
    expect(html).not.toContain('data-testid="journal-hero"')
  })

  it("lists one rubric as a grid with its chip current (journal-category)", async () => {
    const html = await renderFeed({ category: "Детокс" })
    expect(html).toContain('data-testid="journal-list"')
    expect(count(html, /data-testid="journal-card"/g)).toBe(4)
    expect(html).toMatch(/aria-current="page"[^>]*>Детокс</)
    expect(html).not.toContain('data-testid="journal-hero"')
  })

  it("pages a rubric twelve at a time", async () => {
    journal = Array.from({ length: 30 }, (_, i) => summary(i + 1, { category: "Пептиды" }))
    const html = await renderFeed({ category: "Пептиды", page: "2" })
    expect(html).toContain('data-testid="journal-pagination"')
    expect(count(html, /data-testid="journal-card"/g)).toBe(12)
  })
})

describe("/journal/[slug]", { timeout: 30_000 }, () => {
  const body = [
    "> **Кратко**",
    "> - Первый вывод",
    "",
    "## Почему детокс не заходит",
    "",
    "Текст.",
    "",
    "### Шаг первый",
    "",
    "Текст.",
  ].join("\n")

  it("draws the title with «Читать далее» to the next article, the TOC and the phone button", async () => {
    current = full(3, body)
    const html = await renderArticle("statya-3")
    expect(html).toContain('id="journal-article-title"')
    expect(html).toContain('href="/ru/journal/statya-4"')
    expect(html).toContain('data-testid="article-toc"')
    expect(html).toContain('href="#почему-детокс-не-заходит"')
    expect(html).toContain('<h2 id="почему-детокс-не-заходит"')
    expect(html).toContain('data-testid="article-toc-fab"')
    expect(html).toContain('data-testid="article-callout"')
    // The byline stays in the JSON-LD for search engines; the page itself shows none.
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, "")
    expect(visible).not.toContain("Выдуманный Автор")
    expect(visible).not.toContain("мин чтения")
  })

  it("closes with «Все статьи» and «В каталог»", async () => {
    current = full(3, body)
    const html = await renderArticle("statya-3")
    expect(html).toMatch(/href="\/ru\/journal"[^>]*data-testid="journal-article-to-feed"/)
    expect(html).toMatch(/href="\/ru\/store"[^>]*data-testid="journal-article-to-catalog"/)
  })

  it("rolls «Читайте также» round from the next article, the last one wrapping to the first", async () => {
    current = full(9, body)
    const html = await renderArticle("statya-9")
    const related = html.slice(html.indexOf('data-testid="journal-related"'))
    const first = related.match(/href="\/ru\/journal\/(statya-\d+)"/)?.[1]
    expect(first).toBe("statya-1")
    expect(related).not.toContain('href="/ru/journal/statya-9"')
    expect(count(related, /data-testid="journal-card"/g)).toBe(8)
  })

  it("draws no TOC and no button for a body without headings (article-no-toc)", async () => {
    current = full(3, "Один абзац.\n\nИ второй.")
    const html = await renderArticle("statya-3")
    expect(html).not.toContain('data-testid="article-toc"')
    expect(html).not.toContain('data-testid="article-toc-fab"')
  })

  it("draws no «Читать далее» and no «Читайте также» for the only article (article-single)", async () => {
    journal = [summary(1)]
    current = full(1, body)
    const html = await renderArticle("statya-1")
    expect(html).not.toContain('data-testid="next-article-link"')
    expect(html).not.toContain('data-testid="journal-related"')
  })

  it("answers 404 for an unknown slug", async () => {
    current = null
    await expect(renderArticle("net-takoy")).rejects.toThrow("NEXT_NOT_FOUND")
  })
})
