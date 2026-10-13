import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { blockById } from "../../registry"
import MediaStories from "."
import { mediaStories } from "./block"
import { TITLE_MAX, parseMediaStoriesProps, type MediaStoriesProps } from "./props"
import { SEEN_KEY, addSeen, advances, keyDirection, nameSlide, readSeen, step } from "./stories"

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

const loaders = vi.hoisted(() => ({ resolveImageRef: vi.fn() }))
vi.mock("@lib/data/block-image", () => ({ resolveImageRef: loaders.resolveImageRef }))

vi.mock("next/image", () => ({
  default: ({ src, alt, sizes, className }: { src: string; alt: string; sizes?: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- a stand-in for next/image in the test
    <img src={src} alt={alt} sizes={sizes} className={className} />
  ),
}))

/** The shop has every picture but those named `no-such-*`. */
const SHOP = (ref: { product?: string; category?: string; alt?: Record<string, string> }) => {
  const handle = ref.product ?? ref.category ?? ""
  if (handle.startsWith("no-such")) return null
  return { url: `https://shipshift.dev/static/${handle}.webp`, alt: ref.alt?.ru ?? handle, width: null, height: null }
}

const sample = () => {
  const parsed = parseMediaStoriesProps(mediaStories.fixtures!.sample)
  if (!parsed.ok) throw new Error(parsed.errors.join("; "))
  return parsed.value
}

const render = async (props: MediaStoriesProps) => {
  const tree = await MediaStories(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

beforeEach(() => {
  locale.current = "ru"
  loaders.resolveImageRef.mockReset()
  loaders.resolveImageRef.mockImplementation(async (ref) => SHOP(ref))
})

describe("media/stories entry", () => {
  it("is in the registry as a lab home block with the roles it draws", () => {
    expect(blockById("media/stories")).toBe(mediaStories)
    expect(mediaStories).toMatchObject({ category: "media", variant: "stories", status: "lab", placement: "home", data: ["static"] })
    expect(mediaStories.roles).toEqual(
      expect.arrayContaining(["section-header", "story-circle", "card-image", "dialog", "close-button", "trigger"])
    )
  })

  it("parses both fixtures", () => {
    expect(parseMediaStoriesProps(mediaStories.fixtures!.empty).ok).toBe(true)
    expect(parseMediaStoriesProps(mediaStories.fixtures!.sample).ok).toBe(true)
  })
})

describe("parseMediaStoriesProps", () => {
  const story = { title: { ru: "Новинки" }, slides: [{ image: { product: "braiser" } }] }

  it("fills the chrome with Russian and English defaults", () => {
    const parsed = parseMediaStoriesProps({ stories: [story] })
    expect(parsed.ok && parsed.value).toMatchObject({
      header: null,
      closeLabel: { ru: "Закрыть", en: "Close" },
      stories: [{ cover: null, slides: [{ text: {}, button: null }] }],
    })
  })

  it("takes one to twelve stories of one to five slides", () => {
    const errors = (input: unknown) => {
      const parsed = parseMediaStoriesProps(input)
      return parsed.ok ? [] : parsed.errors
    }
    expect(errors({ stories: [] })).toEqual(["stories has 0 items, at least 1"])
    expect(errors({ stories: Array(13).fill(story) })).toEqual(["stories has 13 items, at most 12"])
    expect(errors({ stories: [{ ...story, slides: [] }] })).toEqual(["stories[0].slides has 0 items, at least 1"])
    expect(errors({ stories: [{ ...story, slides: Array(6).fill(story.slides[0]) }] })).toEqual([
      "stories[0].slides has 6 items, at most 5",
    ])
    expect(errors({})).toEqual(["stories is required"])
  })

  it("keeps a circle's title to two lines and refuses a slide label without its number", () => {
    const long = { ...story, title: { ru: "Очень длинное название истории" } }
    const parsed = parseMediaStoriesProps({ stories: [long], slideLabel: { ru: "Слайд" } })
    expect(parsed.ok).toBe(false)
    expect(!parsed.ok && parsed.errors).toEqual([
      `stories[0].title.ru is 30 characters, at most ${TITLE_MAX}`,
      "slideLabel.ru must contain {index}",
    ])
  })

  it("refuses a link to another site dressed as a path and an unknown field", () => {
    const parsed = parseMediaStoriesProps({
      stories: [{ ...story, slides: [{ image: { product: "braiser" }, button: { href: "//evil.example" } }] }],
      video: true,
    })
    expect(parsed.ok).toBe(false)
  })
})

describe("MediaStories", () => {
  it("draws a circle per story, with its title, in the section shell", async () => {
    const html = (await render(sample()))!
    expect(html).toContain('data-block="media/stories"')
    expect(html.match(/data-role="story-circle"/g)).toHaveLength(5)
    expect(html).toContain("Посуда для готовки")
    expect(html).toContain('aria-label="Истории магазина"')
    expect(html).toContain('aria-haspopup="dialog"')
    // The server paints every ring unseen; the visitor's tab knows better once hydrated.
    expect(html.match(/border-\[var\(--primary\)\]/g)).toHaveLength(5)
  })

  it("covers a story without a cover of its own with its first slide's picture", async () => {
    const html = (await render(sample()))!
    expect(html).toContain('src="https://shipshift.dev/static/waffle-towels.webp"')
  })

  it("drops a slide the shop has no picture for, then a story with no slide left", async () => {
    const props = sample()
    props.stories[0].slides[0].image = { product: "no-such-braiser", index: 0, alt: {} }
    props.stories[1].slides[0].image = { product: "no-such-pan", index: 0, alt: {} }
    const html = (await render(props))!
    expect(html.match(/data-role="story-circle"/g)).toHaveLength(4)
    expect(html).toContain("Новинки")
    expect(html).not.toContain("Посуда для готовки")
  })

  it("draws nothing when no story is left: the empty fixture", async () => {
    const parsed = parseMediaStoriesProps(mediaStories.fixtures!.empty)
    expect(parsed.ok && (await render(parsed.value))).toBeNull()
  })

  it("speaks English on an English page", async () => {
    locale.current = "en"
    const html = (await render(sample()))!
    expect(html).toContain("Cookware")
    expect(html).toContain('aria-label="Shop stories"')
  })
})

describe("the viewer's steps", () => {
  const slides = [2, 1, 3]

  it("goes on through the slides, then the stories, and closes after the last", () => {
    expect(step({ story: 0, slide: 0 }, 1, slides)).toEqual({ story: 0, slide: 1 })
    expect(step({ story: 0, slide: 1 }, 1, slides)).toEqual({ story: 1, slide: 0 })
    expect(step({ story: 2, slide: 2 }, 1, slides)).toBeNull()
  })

  it("goes back a slide, then to the start of the story before, and stays at the very first", () => {
    expect(step({ story: 2, slide: 2 }, -1, slides)).toEqual({ story: 2, slide: 1 })
    expect(step({ story: 2, slide: 0 }, -1, slides)).toEqual({ story: 1, slide: 0 })
    expect(step({ story: 0, slide: 0 }, -1, slides)).toEqual({ story: 0, slide: 0 })
  })

  it("moves by itself only when nothing holds it", () => {
    const still = { reduced: false, paused: false, pressed: false, hovered: false }
    expect(advances(still)).toBe(true)
    expect(advances({ ...still, reduced: true })).toBe(false)
    expect(advances({ ...still, paused: true })).toBe(false)
    expect(advances({ ...still, pressed: true })).toBe(false)
    expect(advances({ ...still, hovered: true })).toBe(false)
  })

  it("takes the arrows the page's way", () => {
    expect(keyDirection("ArrowRight", false)).toBe(1)
    expect(keyDirection("ArrowLeft", false)).toBe(-1)
    expect(keyDirection("ArrowRight", true)).toBe(-1)
    expect(keyDirection("Enter", false)).toBeNull()
  })

  it("names a slide by its number", () => {
    expect(nameSlide("Слайд {index} из {count}", 1, 3)).toBe("Слайд 2 из 3")
  })
})

describe("the seen stories", () => {
  it("are a list of keys in sessionStorage, added once", () => {
    expect(SEEN_KEY).toBe("upready.stories.seen")
    const once = addSeen(null, "Новинки|a.webp")
    expect(readSeen(addSeen(once, "Новинки|a.webp"))).toEqual(["Новинки|a.webp"])
    expect(readSeen(addSeen(once, "Посуда|b.webp"))).toEqual(["Новинки|a.webp", "Посуда|b.webp"])
  })

  it("read as none when the storage holds something else", () => {
    expect(readSeen("{")).toEqual([])
    expect(readSeen('{"a":1}')).toEqual([])
    expect(readSeen('["a", 2]')).toEqual(["a"])
  })
})
