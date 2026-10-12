import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { blockById, CATEGORY_BLOCKS } from "../../registry"
import BlogFeatured from "."
import { blogFeatured } from "./block"
import { ALL_POSTS_LABEL, parseBlogFeaturedProps, type BlogFeaturedProps } from "./props"

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

const listTenantArticles = vi.hoisted(() => vi.fn())
vi.mock("@lib/data/tenant-articles", () => ({ listTenantArticles }))

const resolveImageRef = vi.hoisted(() => vi.fn())
vi.mock("@lib/data/block-image", () => ({ resolveImageRef }))

vi.mock("next/image", () => ({
  default: ({ src, alt, fill, sizes, className }: { src: string; alt: string; fill?: boolean; sizes?: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- a stand-in for next/image in the test
    <img src={src} alt={alt} data-fill={fill ? "true" : "false"} sizes={sizes} className={className} />
  ),
}))

const render = async (props: BlogFeaturedProps) => {
  const tree = await BlogFeatured(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const defaults: BlogFeaturedProps = {
  header: null,
  limit: 3,
  columns: 3,
  showDate: true,
  showExcerpt: true,
  showSeeAll: true,
  seeAllLabel: ALL_POSTS_LABEL,
  previewPosts: [],
}

const article = (n: number, extra: Record<string, unknown> = {}) => ({
  slug: `post-${n}`,
  locale: "ru",
  title: `Статья ${n}`,
  excerpt: `Анонс статьи ${n}`,
  cover_url: `https://shipshift.dev/static/cover-${n}.webp`,
  status: "published",
  published: true,
  published_at: "2026-10-06T09:00:00.000Z",
  category: null,
  author: null,
  tags: [],
  reading_minutes: 4,
  ...extra,
})

const journal = (articles: ReturnType<typeof article>[]) => ({ articles, count: articles.length, limit: 6, offset: 0 })

const preview = {
  title: { ru: "Как ухаживать за чугуном", en: "How to care for cast iron" },
  excerpt: { ru: "Три правила, и сковорода переживёт хозяина.", en: "Three rules, and the pan outlives its owner." },
  date: "2026-10-06",
  cover: { product: "skillet", index: 0, alt: {} },
}

/** The class list of the element carrying `data-role="<role>"`. */
const classOf = (html: string, role: string) => html.match(new RegExp(`data-role="${role}"[^>]*class="([^"]*)"`))?.[1] ?? ""
const count = (html: string, needle: string) => html.split(needle).length - 1

beforeEach(() => {
  locale.current = "ru"
  vi.stubEnv("STOREFRONT_TEMPLATE_PREVIEW", "")
  listTenantArticles.mockReset()
  listTenantArticles.mockResolvedValue(journal([]))
  resolveImageRef.mockReset()
  resolveImageRef.mockResolvedValue({ url: "https://shipshift.dev/static/skillet.webp", alt: "Сковорода", width: null, height: null })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("parseBlogFeaturedProps", () => {
  it("reads absent props as the three latest posts in three columns, with date, excerpt and the link to all posts", () => {
    expect(parseBlogFeaturedProps(undefined)).toEqual({ ok: true, value: defaults })
    expect(ALL_POSTS_LABEL.ru && ALL_POSTS_LABEL.en).toBeTruthy()
  })

  it("takes 3 to 6 posts in 2 or 3 columns and refuses the rest with the path of every field", () => {
    expect(parseBlogFeaturedProps({ limit: 6, columns: 2 })).toMatchObject({ ok: true, value: { limit: 6, columns: 2 } })
    const result = parseBlogFeaturedProps({ limit: 2, columns: 4, showDate: "yes", extra: 1 })
    expect(result.ok).toBe(false)
    const errors = result.ok ? [] : result.errors
    expect(errors.some((e) => e.startsWith("limit"))).toBe(true)
    expect(errors.some((e) => e.startsWith("columns"))).toBe(true)
    expect(errors.some((e) => e.startsWith("showDate"))).toBe(true)
    expect(errors).toContain("extra: not a prop of blog/featured")
    expect(parseBlogFeaturedProps({ limit: 7 }).ok).toBe(false)
  })

  it("refuses a see-all link in the header, since the block draws its own to /journal", () => {
    const result = parseBlogFeaturedProps({ header: { heading: { ru: "Журнал" }, seeAll: { href: "/store" } } })
    expect(result.ok).toBe(false)
    expect(result.ok ? [] : result.errors).toEqual([expect.stringMatching(/^header\.seeAll: .*showSeeAll/)])
    expect(parseBlogFeaturedProps({ header: { heading: { ru: "Журнал" } } }).ok).toBe(true)
  })

  it("reads preview posts, at most six, each with a title, a real date and a picture of the shop", () => {
    const ok = parseBlogFeaturedProps({ previewPosts: [preview, { title: { ru: "Без обложки" } }] })
    expect(ok).toMatchObject({
      ok: true,
      value: { previewPosts: [preview, { title: { ru: "Без обложки" }, excerpt: {}, date: null, cover: null }] },
    })
    const bad = parseBlogFeaturedProps({
      previewPosts: [{ ...preview, date: "2026-02-30" }, { excerpt: { ru: "нет заголовка" } }, ...Array(5).fill(preview)],
    })
    const errors = bad.ok ? [] : bad.errors
    expect(errors).toContain("previewPosts[0].date must be a date YYYY-MM-DD")
    expect(errors).toContain("previewPosts[1].title must be an object of language code to string")
    expect(errors).toContain("previewPosts has 7 items, at most 6")
  })
})

describe("BlogFeatured", () => {
  it("renders nothing for a shop whose journal is empty", async () => {
    expect(await render(defaults)).toBeNull()
    expect(listTenantArticles).toHaveBeenCalledWith({ limit: 3 })
  })

  it("never shows preview posts on a live shop, only on the templates stand while the journal is empty", async () => {
    const withPreview = { ...defaults, previewPosts: [preview] }
    expect(await render(withPreview)).toBeNull()

    vi.stubEnv("STOREFRONT_TEMPLATE_PREVIEW", "1")
    const html = (await render(withPreview))!
    expect(html).toContain("Как ухаживать за чугуном")
    expect(html).toContain('href="/ru/journal"')
    expect(resolveImageRef).toHaveBeenCalledWith(preview.cover, "ru")

    listTenantArticles.mockResolvedValue(journal([article(1)]))
    const real = (await render(withPreview))!
    expect(real).toContain("Статья 1")
    expect(real).not.toContain("Как ухаживать за чугуном")
  })

  it("draws the latest posts of the journal, at most `limit`, each card one link to its article", async () => {
    listTenantArticles.mockResolvedValue(journal([1, 2, 3, 4, 5].map((n) => article(n, n === 2 ? { slug: "чай и вода" } : {}))))
    const html = (await render({ ...defaults, limit: 4 }))!
    expect(listTenantArticles).toHaveBeenCalledWith({ limit: 4 })
    expect(count(html, 'data-role="card"')).toBe(4)
    expect(html).not.toContain("Статья 5")
    expect(html).toContain('href="/ru/journal/post-1"')
    expect(html).toContain(`href="/ru/journal/${encodeURIComponent("чай и вода")}"`)
    expect(html).toContain('data-block="blog/featured"')
    expect(html).toMatch(/<article[^>]*data-role="card"/)
    expect(html).toMatch(/<h3[^>]*data-role="card-title"[^>]*>Статья 1<\/h3>/)
  })

  it("shows the date in the visitor's language and the excerpt, and hides each when switched off or absent", async () => {
    listTenantArticles.mockResolvedValue(journal([article(1), article(2, { published_at: null, excerpt: null })]))
    const html = (await render(defaults))!
    expect(html).toContain('<time dateTime="2026-10-06T09:00:00.000Z"')
    expect(html).toContain("6 октября 2026")
    expect(count(html, "<time")).toBe(1)
    expect(count(html, 'data-role="description"')).toBe(1)

    const bare = (await render({ ...defaults, showDate: false, showExcerpt: false }))!
    expect(bare).not.toContain("<time")
    expect(bare).not.toContain('data-role="description"')
  })

  it("puts the cover in a 4:3 frame and gives a post without one a drawn placeholder in the same frame", async () => {
    listTenantArticles.mockResolvedValue(journal([article(1), article(2, { cover_url: null })]))
    const html = (await render(defaults))!
    const frames = html.match(/data-role="card-image"[^>]*class="([^"]*)"/g) ?? []
    expect(frames).toHaveLength(2)
    for (const frame of frames) expect(frame).toContain("aspect-[4/3]")
    expect(html).toContain('src="https://shipshift.dev/static/cover-1.webp"')
    expect(html).toContain('data-cover="placeholder"')
    expect(count(html, "<img")).toBe(1)
  })

  it("lays the cards in one column, two from 720 px and `columns` from 1024 px", async () => {
    listTenantArticles.mockResolvedValue(journal([article(1), article(2), article(3)]))
    const three = classOf((await render(defaults))!, "card-list")
    expect(three).toContain("grid-cols-1")
    expect(three).toContain("min-[720px]:grid-cols-2")
    expect(three).toContain("small:grid-cols-3")
    expect(classOf((await render({ ...defaults, columns: 2 }))!, "card-list")).toContain("small:grid-cols-2")
  })

  it("links to all posts under the cards in the visitor's words, and leaves the shell's header without a link", async () => {
    listTenantArticles.mockResolvedValue(journal([article(1)]))
    const html = (await render({ ...defaults, header: { eyebrow: {}, heading: { ru: "Журнал" }, description: {}, seeAll: null } }))!
    expect(html).toMatch(/<a href="\/ru\/journal" data-role="cta-secondary"[^>]*>Все статьи<\/a>/)
    expect(classOf(html, "cta-secondary")).toContain("min-h-11")
    expect(html.indexOf('data-role="cta-secondary"')).toBeGreaterThan(html.indexOf('data-role="card-list"'))

    locale.current = "en"
    expect(await render(defaults)).toContain(">All posts</a>")
    expect(await render({ ...defaults, showSeeAll: false })).not.toContain('data-role="cta-secondary"')
  })

  it("shows the owner's words as text, never as markup", async () => {
    listTenantArticles.mockResolvedValue(journal([article(1, { title: "<b>Жирный</b>", excerpt: "<script>x</script>" })]))
    const html = (await render(defaults))!
    expect(html).toContain("&lt;b&gt;Жирный&lt;/b&gt;")
    expect(html).not.toContain("<script>")
  })
})

describe("blogFeatured entry", () => {
  it("is registered under blog/featured, lab, home, with the roles it draws and both fixtures parsed", () => {
    expect(blockById("blog/featured")).toBe(blogFeatured)
    expect(CATEGORY_BLOCKS.blog.map((b) => b.id)).toContain("blog/featured")
    expect(blogFeatured).toMatchObject({ status: "lab", placement: "home", data: ["shop", "products", "categories", "static"] })
    expect(blogFeatured.roles).toEqual(["section-header", "card", "card-image", "card-title", "description", "cta-secondary"])
    expect(parseBlogFeaturedProps(blogFeatured.fixtures!.empty)).toEqual({ ok: true, value: blogFeatured.fixtures!.empty })
    expect(parseBlogFeaturedProps(blogFeatured.fixtures!.sample)).toEqual({ ok: true, value: blogFeatured.fixtures!.sample })
    expect(blogFeatured.fixtures!.empty.previewPosts).toEqual([])
    expect(blogFeatured.fixtures!.sample.previewPosts.length).toBeGreaterThanOrEqual(blogFeatured.fixtures!.sample.limit)
  })

  it("keeps personal data out of the fixtures", () => {
    const text = JSON.stringify(blogFeatured.fixtures)
    expect(text).not.toMatch(/@|\+7|\b8 ?\(?9\d\d/)
  })
})
