import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createTranslator } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TenantArticleSummary } from "@lib/data/tenant-articles"

import {
  JOURNAL_RAIL_LIMIT,
  JOURNAL_RAIL_PER_VIEW,
  journalRailCopies,
} from "./olavka-journal-rail-layout"

/**
 * ask d11e. Ivan: «для cherkashino .ru и .com нужно сделать "журнал", в точности такой же,
 * но с нашими цветами и токенами». The block on the home page is the rail of his frame of
 * 2026-09-25: a heading, two arrows, cards with a cover, a rubric, a title and an excerpt.
 * The component is an async server component, so it is called and its markup read.
 */

const STOREFRONT = join(__dirname, "../../../..")
const messages = JSON.parse(readFileSync(join(STOREFRONT, "messages/ru.json"), "utf8"))

let feed: TenantArticleSummary[] = []
const listTenantArticles = vi.fn(async (_params: { limit?: number }) => ({
  articles: feed,
  count: feed.length,
  limit: JOURNAL_RAIL_LIMIT,
  offset: 0,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: "ru", messages, namespace }),
}))
vi.mock("@lib/data/tenant-articles", () => ({
  listTenantArticles: (params: { limit?: number }) => listTenantArticles(params),
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
  author: null,
  tags: [],
  reading_minutes: 5,
  ...over,
})

const render = async () => {
  const { default: OlavkaJournalRail } = await import("./olavka-journal-rail")
  const element = await OlavkaJournalRail()
  return element === null ? null : renderToStaticMarkup(element)
}

const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0

// The first import pulls `@medusajs/ui` in; under a full parallel run it outlasts vitest's
// default 5 s.
describe("OlavkaJournalRail, «Журнал здоровья» on the home page", { timeout: 30_000 }, () => {
  beforeEach(() => {
    listTenantArticles.mockClear()
  })

  it("renders nothing while the shop has no published article", async () => {
    feed = []
    expect(await render()).toBeNull()
  })

  it("asks for one page of the newest articles", async () => {
    feed = [article(1)]
    await render()
    expect(listTenantArticles).toHaveBeenCalledWith({ limit: JOURNAL_RAIL_LIMIT })
  })

  it("draws the heading and a card per article: cover, rubric, title, excerpt, one link", async () => {
    feed = [article(1), article(2), article(3)]
    const html = (await render()) as string

    expect(html).toMatch(/<h2[^>]*id="olavka-journal-rail-heading"[^>]*>Журнал здоровья<\/h2>/)
    expect(html).toContain('aria-labelledby="olavka-journal-rail-heading"')
    expect(count(html, /<li /g)).toBe(3)
    expect(count(html, /data-testid="olavka-journal-card"/g)).toBe(3)
    expect(html).toMatch(/<a[^>]*href="\/ru\/journal\/statya-2"[^>]*data-testid="olavka-journal-card"/)
    expect(html).toContain('src="https://cdn.test/cover-2.webp"')
    expect(html).toContain(">Пептиды</span>")
    expect(html).toMatch(/<h3[^>]*>Статья 2<\/h3>/)
    expect(html).toMatch(/<p[^>]*>Анонс 2<\/p>/)
  })

  it("does not loop a short rail: no clones, and the arrows wait for the browser to measure", async () => {
    feed = Array.from({ length: JOURNAL_RAIL_PER_VIEW }, (_, i) => article(i + 1))
    const html = (await render()) as string

    expect(count(html, /data-copy="real"/g)).toBe(JOURNAL_RAIL_PER_VIEW)
    expect(html).not.toContain("olavka-journal-card-clone")
    expect(count(html, /<li[^>]*aria-hidden/g)).toBe(0)
    expect(html).not.toContain("data-loop=")
    expect(count(html, /<button[^>]*disabled=""[^>]*data-testid="olavka-journal-rail-(prev|next)"/g)).toBe(2)
  })

  it("loops a long rail: clone · real · clone, the clones hidden from a screen reader and from Tab", async () => {
    feed = Array.from({ length: 9 }, (_, i) => article(i + 1))
    const html = (await render()) as string

    expect(count(html, /<li /g)).toBe(27)
    expect(html.match(/data-copy="(before|real|after)"/g)?.map((m) => m.slice(11, -1))).toEqual([
      ...Array(9).fill("before"),
      ...Array(9).fill("real"),
      ...Array(9).fill("after"),
    ])
    expect(count(html, /<li[^>]*aria-hidden="true"/g)).toBe(18)
    expect(count(html, /<a[^>]*tabindex="-1"[^>]*data-testid="olavka-journal-card-clone"/g)).toBe(18)
    expect(count(html, /data-testid="olavka-journal-card"/g)).toBe(9)
    expect(html).not.toMatch(/<a[^>]*tabindex="-1"[^>]*data-testid="olavka-journal-card"/)
    expect(html).toContain('data-loop="true"')
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""/)
    expect(html).toMatch(/<button[^>]*aria-label="Назад"[^>]*data-testid="olavka-journal-rail-prev"/)
    expect(html).toMatch(/<button[^>]*aria-label="Далее"[^>]*data-testid="olavka-journal-rail-next"/)
  })

  it("keeps a card whole when the article has no cover, rubric or excerpt", async () => {
    feed = [article(1, { cover_url: null, category: null, excerpt: null })]
    const html = (await render()) as string

    expect(html).not.toContain("<img")
    expect(html).not.toMatch(/<span[ >]/)
    expect(html).not.toMatch(/<p[ >]/)
    expect(html).toMatch(/<h3[^>]*>Статья 1<\/h3>/)
  })
})

describe("journalRailCopies", () => {
  it("loops only with more articles than the widest row shows", () => {
    for (let n = 0; n <= JOURNAL_RAIL_PER_VIEW; n++) {
      expect(journalRailCopies(n)).toEqual(["real"])
    }
    expect(journalRailCopies(JOURNAL_RAIL_PER_VIEW + 1)).toEqual(["before", "real", "after"])
  })

  it("counts the widest row the way the stylesheet lays it out", () => {
    const css = readFileSync(join(__dirname, "olavka-journal-rail.module.css"), "utf8")
    const perView = Array.from(css.matchAll(/--n:\s*(\d+)/g), (m) => Number(m[1]))
    expect(Math.max(...perView)).toBe(JOURNAL_RAIL_PER_VIEW)
  })
})

describe("the home page: the journal rail is the Olavka shop's, under the tenant's own blocks", () => {
  const page = readFileSync(join(STOREFRONT, "src/app/[locale]/(main)/page.tsx"), "utf8")
  const registry = readFileSync(join(__dirname, "index.ts"), "utf8")

  it("registers the rail in the blocks that close the page", () => {
    expect(registry).toMatch(/OLAVKA_HOME_BLOCKS_AFTER = \{\s*olavkaJournalRail: OlavkaJournalRail,\s*\}/)
    expect(registry).toMatch(/OLAVKA_HOME_ORDER_AFTER[^=]*= \["olavkaJournalRail"\]/)
  })

  it("renders those blocks for the Olavka shop only, after the composed ones", () => {
    expect(page).toMatch(/\{olavka &&\s*OLAVKA_HOME_ORDER_AFTER\.map\(/)
    expect(page.indexOf("OLAVKA_HOME_ORDER_AFTER.map(")).toBeGreaterThan(page.indexOf("order.map("))
  })
})
