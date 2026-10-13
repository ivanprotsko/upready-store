import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getTemplate } from "@lib/templates/catalog"
import { validateTemplate } from "@lib/templates/manifest"

import { BLOCKS, CATEGORY_BLOCKS, blockById } from "../../registry"
import { SECTION_TYPE } from "../../shared/section-type"
import SlideshowBanners from "."
import { slideshowBanners } from "./block"
import { keyTarget, rotates, wrapIndex } from "./carousel"
import {
  BUTTON_LABEL,
  NEXT_LABEL,
  PAUSE_LABEL,
  PLAY_LABEL,
  PREVIOUS_LABEL,
  REGION_LABEL,
  SLIDE_LABEL,
  nameSlide,
  parseSlideshowBannersProps,
  type BannerSlide,
  type SlideshowBannersProps,
} from "./props"

const resolveImageRef = vi.fn()

// The registry reaches `server-only` loaders through the header and footer variants. Hoisted by vitest.
vi.mock("server-only", () => ({}))

const locale = vi.hoisted(() => ({ current: "ru" }))
vi.mock("next-intl/server", () => ({ getLocale: async () => locale.current }))
vi.mock("@lib/data/block-image", () => ({ resolveImageRef: (...args: unknown[]) => resolveImageRef(...args) }))
vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/ru${href}`} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("next/image", () => ({
  default: ({ src, alt, className, priority }: { src: string; alt: string; className?: string; priority?: boolean }) => (
    <span data-image={src} aria-label={alt} data-priority={priority ? "true" : undefined} className={className} />
  ),
  getImageProps: ({ src, alt, sizes, priority }: { src: string; alt: string; sizes: string; priority?: boolean }) => ({
    props: { src, alt, sizes, srcSet: `${src}?w=640 640w, ${src}?w=1920 1920w`, loading: priority ? undefined : "lazy" },
  }),
}))

const chrome = {
  label: REGION_LABEL,
  slideLabel: SLIDE_LABEL,
  previousLabel: PREVIOUS_LABEL,
  nextLabel: NEXT_LABEL,
  pauseLabel: PAUSE_LABEL,
  playLabel: PLAY_LABEL,
}
const sample = slideshowBanners.fixtures!.sample
const slide = (product: string, heading = product, rest: Partial<BannerSlide> = {}): BannerSlide => ({
  image: { product, index: 0, alt: {} },
  imageMobile: null,
  heading: { ru: heading },
  text: {},
  button: null,
  ...rest,
})
const render = async (props: Partial<SlideshowBannersProps> = {}) => {
  const tree = await SlideshowBanners({ ...sample, ...props })
  return tree === null ? null : renderToStaticMarkup(tree)
}
const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length

beforeEach(() => {
  locale.current = "ru"
  resolveImageRef.mockReset()
  resolveImageRef.mockImplementation(async (ref: { product?: string; category?: string }) => {
    const name = ref.product ?? ref.category
    return name?.startsWith("no-such") ? null : { url: `https://cdn.test/${name}.webp`, alt: name, width: null, height: null }
  })
})

describe("parseSlideshowBannersProps", () => {
  it("needs only two slides with a picture and fills every other setting with its default", () => {
    const result = parseSlideshowBannersProps({ slides: [{ image: { product: "braiser" } }, { image: { category: "cookware" } }] })
    expect(result).toEqual({
      ok: true,
      value: {
        slides: [
          { image: { product: "braiser", index: 0, alt: {} }, imageMobile: null, heading: {}, text: {}, button: null },
          { image: { category: "cookware", alt: {} }, imageMobile: null, heading: {}, text: {}, button: null },
        ],
        height: "medium",
        autoplay: null,
        controls: "both",
        ...chrome,
      },
    })
    for (const text of [BUTTON_LABEL, REGION_LABEL, SLIDE_LABEL, PREVIOUS_LABEL, NEXT_LABEL, PAUSE_LABEL, PLAY_LABEL]) {
      expect(text.ru && text.en).toBeTruthy()
    }
  })

  it("gives a button its default label and takes autoplay as 5 to 10 seconds or off", () => {
    const two = [{ image: { product: "a" }, button: { href: "/store" } }, { image: { product: "b" } }]
    const button = parseSlideshowBannersProps({ slides: two, autoplay: 5 })
    expect(button.ok && button.value.slides[0].button).toEqual({ href: "/store", label: BUTTON_LABEL })
    expect(button.ok && button.value.autoplay).toBe(5)
    expect(parseSlideshowBannersProps({ slides: two, autoplay: 10 }).ok).toBe(true)
    const off = parseSlideshowBannersProps({ slides: two, autoplay: null })
    expect(off.ok && off.value.autoplay).toBeNull()
  })

  it("takes two to five slides, each with a picture, and refuses every other value with its path", () => {
    const image = { product: "braiser" }
    expect(parseSlideshowBannersProps({ slides: [{ image }] })).toEqual({ ok: false, errors: ["slides has 1 items, at least 2"] })
    expect(parseSlideshowBannersProps({ slides: Array.from({ length: 6 }, () => ({ image })) })).toEqual({
      ok: false,
      errors: ["slides has 6 items, at most 5"],
    })
    expect(parseSlideshowBannersProps(undefined)).toEqual({ ok: false, errors: ["slides is required"] })

    const result = parseSlideshowBannersProps({
      slides: [
        { image, heading: { ru: "x".repeat(61) }, button: { href: "//evil.test" } },
        { imageMobile: image, text: { ru: "y".repeat(141) } },
      ],
      height: "huge",
      autoplay: 4,
      controls: "none",
      slideLabel: { ru: "Баннер" },
      loop: true,
    })
    expect(result.ok ? [] : result.errors).toEqual([
      "slides[0].heading.ru is 61 characters, at most 60",
      "slides[0].button.href: // leads to another site; write https://",
      "slides[1].image is required",
      "slides[1].text.ru is 141 characters, at most 140",
      "height must be one of: small, medium, large",
      "autoplay must be a whole number from 5 to 10",
      "controls must be one of: both, dots, arrows",
      "slideLabel.ru must contain {index}",
      "loop: not a prop of slideshow/banners",
    ])
    for (const autoplay of [11, 5.5, true, "6"]) {
      expect(parseSlideshowBannersProps({ slides: [{ image }, { image }], autoplay }).ok, String(autoplay)).toBe(false)
    }
  })

  it("names each banner by its number and the number of banners", () => {
    expect(nameSlide(SLIDE_LABEL.ru, 1, 4)).toBe("Баннер 2 из 4")
    expect(nameSlide(SLIDE_LABEL.en, 0, 2)).toBe("Banner 1 of 2")
  })
})

describe("SlideshowBanners", () => {
  it("draws nothing when the shop has none of the pictures, as in the empty fixture", async () => {
    const tree = await SlideshowBanners(slideshowBanners.fixtures!.empty)
    expect(tree).toBeNull()
    expect(resolveImageRef).toHaveBeenCalledTimes(2)
  })

  it("drops a banner whose picture the shop lacks and keeps the others in order", async () => {
    const html = (await render({ slides: [slide("braiser", "Первый"), slide("no-such-pot"), slide("skillet", "Третий")] }))!
    expect(count(html, /aria-roledescription="slide"/g)).toBe(2)
    expect(html).not.toContain("no-such-pot")
    expect(html.indexOf("Первый")).toBeLessThan(html.indexOf("Третий"))
    expect(html).toContain('aria-label="Баннер 2 из 2"')
  })

  it("draws a single banner still: no carousel, no slide group, no controls", async () => {
    const html = (await render({ slides: [slide("braiser", "Один"), slide("no-such-pot")] }))!
    expect(html).toContain('<section data-block="slideshow/banners"')
    expect(html).toContain('data-role="hero-image"')
    expect(html).toMatch(/<h2 data-role="headline"[^>]*>Один<\/h2>/)
    for (const absent of ["aria-roledescription", 'role="region"', 'data-role="trigger"', "snap-x", "aria-live"]) {
      expect(html, absent).not.toContain(absent)
    }
  })

  it("fills every role of its registry entry and draws the headline as the section's h2, never an h1", async () => {
    const html = (await render())!
    for (const role of slideshowBanners.roles) expect(html, role).toContain(`data-role="${role}"`)
    expect(html).not.toContain("<h1")
    const h2 = html.match(/<h2 data-role="headline" class="([^"]*)">Чугун, который переживёт нас<\/h2>/)
    expect(h2?.[1]).toBe(SECTION_TYPE.heading)
    expect(html).toMatch(new RegExp(`<p data-role="description" class="${SECTION_TYPE.description.replace(/[[\]()]/g, "\\$&")}">`))
  })

  it("is an APG carousel: a named region, each banner a named slide group, the dots named the same", async () => {
    const html = (await render())!
    expect(html).toMatch(/<div role="region" aria-roledescription="carousel" aria-label="Баннеры магазина"/)
    ;["Баннер 1 из 3", "Баннер 2 из 3", "Баннер 3 из 3"].forEach((name, index) => {
      expect(html).toContain(`role="group" aria-roledescription="slide" aria-label="${name}" tabindex="-1"`)
      expect(html).toMatch(new RegExp(`data-dot="" aria-label="${name}"${index === 0 ? ' aria-current="true"' : ""} class=`))
    })
    expect(count(html, /aria-current="true"/g)).toBe(1)
    expect(html).toContain('aria-label="Предыдущий баннер"')
    expect(html).toContain('aria-label="Следующий баннер"')
  })

  it("paints on the server with every banner reachable, the track polite and no timer control yet", async () => {
    const html = (await render())!
    expect(html).not.toContain("inert")
    expect(html).toContain('aria-live="polite"')
    // The server cannot know prefers-reduced-motion: the stop button comes with the hydrated timer.
    expect(html).not.toContain(PAUSE_LABEL.ru)
    expect(html).toMatch(/class="flex snap-x snap-mandatory overflow-x-auto[^"]*"/)
    expect(count(html, /snap-start snap-always/g)).toBe(3)
  })

  it("draws the dots, the arrows or both, as the template says", async () => {
    const dots = (await render({ controls: "dots" }))!
    expect(count(dots, /data-dot=""/g)).toBe(3)
    expect(dots).not.toContain("Следующий баннер")
    const arrows = (await render({ controls: "arrows" }))!
    expect(arrows).not.toContain('data-dot=""')
    expect(arrows).toContain("Следующий баннер")
    expect(count((await render())!, /data-role="trigger"/g)).toBe(5)
  })

  it("serves the phone crop below 512 px through one <picture>, and the first picture eagerly", async () => {
    const html = (await render())!
    // An HTML attribute's name has no case: the renderer may write `srcSet` or `srcset`.
    expect(html.toLowerCase()).toContain(
      '<picture><source media="(min-width: 512px)" srcset="https://cdn.test/braiser.webp?w=640 640w, https://cdn.test/braiser.webp?w=1920 1920w" sizes="100vw"/>'
    )
    expect(html).toMatch(/<img src="https:\/\/cdn.test\/cookware.webp" alt="braiser" sizes="100vw" srcset="[^"]*" class="object-cover"\/>/i)
    expect(html).toContain('data-image="https://cdn.test/serving-board.webp" aria-label="serving-board" class="object-cover"')
    expect(count(html, /data-priority="true"/g)).toBe(0)
    const plain = (await render({ slides: [slide("braiser"), slide("skillet")] }))!
    expect(plain).toContain('data-image="https://cdn.test/braiser.webp" aria-label="braiser" data-priority="true"')
    expect(count(plain, /data-priority="true"/g)).toBe(1)

    resolveImageRef.mockImplementation(async (ref: { product?: string; category?: string }) =>
      ref.category ? null : { url: `https://cdn.test/${ref.product}.webp`, alt: ref.product, width: null, height: null }
    )
    const fallback = (await render())!
    expect(fallback).not.toContain("<picture>")
    expect(fallback).toContain('data-image="https://cdn.test/braiser.webp"')
  })

  it("sets the picture's frame by the template's height, a ratio at a phone, from 512 and from 1024", async () => {
    const frame = async (height: SlideshowBannersProps["height"]) =>
      (await render({ height }))!.match(/data-role="hero-image" class="([^"]*)"/)![1]
    const base = "relative w-full overflow-hidden rounded-[var(--radius)] small:min-h-96"
    expect(await frame("small")).toBe(`${base} aspect-[3/2] xsmall:aspect-[5/2] small:aspect-[3/1]`)
    expect(await frame("medium")).toBe(`${base} aspect-[5/4] xsmall:aspect-[2/1] small:aspect-[5/2]`)
    expect(await frame("large")).toBe(`${base} aspect-square xsmall:aspect-[3/2] small:aspect-[2/1]`)
  })

  it("stands in the content measure, fades the track over its gutters and rings a focused banner inside them", async () => {
    const html = (await render())!
    // `.content-container` is `px-4 lg:px-6`; each banner repeats it without the class (QR-GRID-AXES).
    expect(count(html, /<div class="mx-auto w-full max-w-screen-large px-4 small:px-6">/g)).toBe(3)
    // The fade is the gutter's width, 1rem and 1.5rem from 1024: at rest it covers the page's margin only.
    expect(html).toMatch(/overflow-x-auto[^"]*\[mask-image:linear-gradient\(to_right,transparent,black_1rem,black_calc\(100%_-_1rem\),transparent\)\]/)
    expect(html).toContain("small:[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%_-_1.5rem),transparent)]")
    expect(count(html, /class="group\/slide w-full shrink-0 snap-start snap-always outline-none"/g)).toBe(3)
    expect(count(html, /group-focus-visible\/slide:outline-\[var\(--ring\)\]/g)).toBe(3)
  })

  it("puts the words on the theme's card panel from 1024 px, in tokens only", async () => {
    const html = (await render())!
    expect(html).toContain("small:absolute small:inset-0 small:flex small:items-end small:p-8")
    expect(html).toContain("small:rounded-[var(--radius)] small:bg-[var(--card)] small:p-8 small:text-[var(--card-foreground)]")
    expect(html).toContain("bg-[var(--layer-button-bg,var(--primary))]")
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(|shadow-\[|\b(bg|text)-(white|black)\b/i)
  })

  it("links a button in the shop's locale and an outside one as given, and drops a button without words", async () => {
    const html = (await render())!
    expect(html).toMatch(/<a href="\/ru\/categories\/cookware" data-role="cta-primary" class="[^"]*">Смотреть посуду<\/a>/)
    const outside = (await render({
      slides: [
        slide("braiser", "Лукбук", { button: { href: "https://example.test/lookbook", label: { ru: "Открыть" } } }),
        slide("skillet", "Без кнопки", { button: { href: "/store", label: { ru: "  " } } }),
      ],
    }))!
    expect(outside).toMatch(/<a data-role="cta-primary" href="https:\/\/example.test\/lookbook"/)
    expect(count(outside, /data-role="cta-primary"/g)).toBe(1)
  })

  it("speaks the visitor's language, else English, in its own chrome", async () => {
    locale.current = "de"
    const html = (await render())!
    expect(html).toContain('aria-label="Shop banners"')
    expect(html).toContain('aria-label="Banner 2 of 3"')
    expect(html).toContain("Cast iron that will outlive us")
  })
})

describe("the carousel's moves", () => {
  it("wraps round either end", () => {
    expect(wrapIndex(2, 1, 3)).toBe(0)
    expect(wrapIndex(0, -1, 3)).toBe(2)
    expect(wrapIndex(1, 1, 3)).toBe(2)
  })

  it("moves by the arrow keys, swapped on a right-to-left page, and to the ends by Home and End", () => {
    expect(keyTarget("ArrowRight", 0, 4, false)).toBe(1)
    expect(keyTarget("ArrowLeft", 0, 4, false)).toBe(3)
    expect(keyTarget("ArrowRight", 0, 4, true)).toBe(3)
    expect(keyTarget("ArrowLeft", 3, 4, true)).toBe(0)
    expect(keyTarget("Home", 2, 4, false)).toBe(0)
    expect(keyTarget("End", 0, 4, false)).toBe(3)
    for (const key of ["Enter", " ", "Tab", "ArrowDown"]) expect(keyTarget(key, 1, 4, false), key).toBeNull()
  })

  it("turns by itself only when asked, with two or more banners, and holds on hover, focus, a stop and reduced motion", () => {
    const moving = { autoplay: 6, count: 3, reduced: false, hovered: false, focused: false, paused: false }
    expect(rotates(moving)).toBe(true)
    expect(rotates({ ...moving, autoplay: null })).toBe(false)
    expect(rotates({ ...moving, count: 1 })).toBe(false)
    for (const hold of ["reduced", "hovered", "focused", "paused"] as const) {
      expect(rotates({ ...moving, [hold]: true }), hold).toBe(false)
    }
  })
})

describe("slideshow/banners in the registry", () => {
  it("is a static lab home block of the slideshow category with the brief's roles", () => {
    expect(blockById("slideshow/banners")).toBe(slideshowBanners)
    expect(slideshowBanners).toMatchObject({
      category: "slideshow",
      variant: "banners",
      data: ["static"],
      status: "lab",
      placement: "home",
    })
    expect([...slideshowBanners.roles].sort()).toEqual(["cta-primary", "description", "headline", "hero-image", "trigger"])
    expect(CATEGORY_BLOCKS.slideshow.map((b) => b.id)).toContain("slideshow/banners")
    expect(BLOCKS.map((b) => b.id)).toContain("slideshow/banners")
    expect(parseSlideshowBannersProps(sample)).toEqual({ ok: true, value: sample })
    expect(parseSlideshowBannersProps(slideshowBanners.fixtures!.empty).ok).toBe(true)
  })

  it("may stand in a template beside the hero, and a template's bad props are refused with their path", () => {
    const manifest = structuredClone(getTemplate("long-morning")!.manifest)
    manifest.sections.splice(1, 0, { block: "slideshow/banners", props: sample })
    const result = validateTemplate(manifest, blockById)
    expect(result.ok ? [] : result.errors).toEqual([])

    manifest.sections[1] = { block: "slideshow/banners", props: { ...sample, autoplay: 3 } }
    const refused = validateTemplate(manifest, blockById)
    expect(refused.ok ? [] : refused.errors.map((e) => e.message)).toEqual(["autoplay must be a whole number from 5 to 10"])
  })
})
