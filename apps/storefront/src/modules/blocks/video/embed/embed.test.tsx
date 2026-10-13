import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { blockById, CATEGORY_BLOCKS } from "../../registry"
import { SECTION_TYPE } from "../../shared/section-type"
import VideoEmbed from "."
import { videoEmbed } from "./block"
import { PlayingMedia } from "./player"
import { PLAY_LABEL, parseVideoEmbedProps, type VideoEmbedProps } from "./props"
import { mediaOf, parseVideoUrl } from "./video"

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

const resolveImageRef = vi.hoisted(() => vi.fn())
vi.mock("@lib/data/block-image", () => ({ resolveImageRef }))

vi.mock("next/image", () => ({
  default: ({ src, alt, fill, sizes, className }: { src: string; alt: string; fill?: boolean; sizes?: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- a stand-in for next/image in the test
    <img src={src} alt={alt} data-fill={fill ? "true" : "false"} sizes={sizes} className={className} />
  ),
}))

const LODGE = "https://www.youtube.com/watch?v=y-3W2A1W7bE"
const RUTUBE_ID = "c6cc4d620b1d4338901770a44b3e82f4"

const blank: VideoEmbedProps = {
  video: null,
  cover: null,
  heading: {},
  text: {},
  button: null,
  playLabel: PLAY_LABEL,
  textPosition: "above",
  aspect: "16/9",
  width: "container",
  loop: false,
  muted: false,
}

const cover = { product: "skillet", index: 0, alt: {} }
const filled: VideoEmbedProps = {
  ...blank,
  video: { url: LODGE },
  cover,
  heading: { ru: "Первая неделя чугунной сковороды" },
  text: { ru: "Как мыть, сушить и смазывать." },
}

const render = async (props: VideoEmbedProps) => {
  const tree = await VideoEmbed(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

/** The class list of the element carrying `data-role="<role>"`. */
const classOf = (html: string, role: string) => html.match(new RegExp(`data-role="${role}"[^>]*class="([^"]*)"`))?.[1] ?? ""

beforeEach(() => {
  locale.current = "ru"
  resolveImageRef.mockReset()
  resolveImageRef.mockResolvedValue({ url: "https://shipshift.dev/static/skillet.webp", alt: "Сковорода", width: null, height: null })
})

describe("parseVideoUrl", () => {
  it.each([
    [LODGE, "youtube", "https://www.youtube-nocookie.com/embed/y-3W2A1W7bE?autoplay=1&rel=0&playsinline=1"],
    ["https://youtu.be/y-3W2A1W7bE?si=abc", "youtube", "https://www.youtube-nocookie.com/embed/y-3W2A1W7bE?autoplay=1&rel=0&playsinline=1"],
    ["https://m.youtube.com/shorts/y-3W2A1W7bE", "youtube", "https://www.youtube-nocookie.com/embed/y-3W2A1W7bE?autoplay=1&rel=0&playsinline=1"],
    ["https://www.youtube-nocookie.com/embed/y-3W2A1W7bE", "youtube", "https://www.youtube-nocookie.com/embed/y-3W2A1W7bE?autoplay=1&rel=0&playsinline=1"],
    ["https://vk.com/video-22822305_456242110", "vk", "https://vk.com/video_ext.php?oid=-22822305&id=456242110&autoplay=1"],
    ["https://vkvideo.ru/video-22822305_456242110", "vk", "https://vk.com/video_ext.php?oid=-22822305&id=456242110&autoplay=1"],
    [
      "https://vk.com/video_ext.php?oid=-22822305&id=456242110&hash=e037414127166efe&hd=2",
      "vk",
      "https://vk.com/video_ext.php?oid=-22822305&id=456242110&hash=e037414127166efe&autoplay=1",
    ],
    [`https://rutube.ru/video/${RUTUBE_ID}/`, "rutube", `https://rutube.ru/play/embed/${RUTUBE_ID}`],
    [`https://rutube.ru/play/embed/${RUTUBE_ID}?p=Ab_9-x`, "rutube", `https://rutube.ru/play/embed/${RUTUBE_ID}?p=Ab_9-x`],
  ])("reads %s as %s and embeds it the official way", (url, provider, embed) => {
    expect(parseVideoUrl(url)).toEqual({ provider, embed })
  })

  it.each([
    "http://www.youtube.com/watch?v=y-3W2A1W7bE",
    "https://www.youtube.com.evil.example/watch?v=y-3W2A1W7bE",
    "https://evil.example/www.youtube.com/watch?v=y-3W2A1W7bE",
    "https://user:pass@www.youtube.com/watch?v=y-3W2A1W7bE",
    "https://www.youtube.com:8443/watch?v=y-3W2A1W7bE",
    "https://www.youtube.com/watch?v=y-3W2A1W7b",
    "https://www.youtube.com/watch?v=y-3W2A1W7bE%22onload",
    "https://www.youtube.com/playlist?list=PL123",
    "https://vimeo.com/76979871",
    "https://vk.com/wall-1_2",
    "https://vk.com/video_ext.php?oid=-1&id=2&hash=nothex",
    "https://rutube.ru/video/not-an-id/",
    `https://rutube.ru/play/embed/${RUTUBE_ID}?p=<script>`,
    "javascript:alert(1)",
    "//www.youtube.com/watch?v=y-3W2A1W7bE",
  ])("refuses %s", (url) => {
    expect(parseVideoUrl(url)).toBeNull()
  })
})

describe("parseVideoEmbedProps", () => {
  it("reads absent props as no video, above, 16/9, in the container, with the block's own play label", () => {
    expect(parseVideoEmbedProps(undefined)).toEqual({ ok: true, value: blank })
    expect(PLAY_LABEL.ru && PLAY_LABEL.en).toBeTruthy()
  })

  it("takes a link or a file of the template, never both", () => {
    expect(parseVideoEmbedProps({ video: { url: LODGE } }).ok).toBe(true)
    expect(parseVideoEmbedProps({ video: { file: "/templates/long-morning/kitchen.mp4" }, loop: true, muted: true }).ok).toBe(true)
    const both = parseVideoEmbedProps({ video: { url: LODGE, file: "/templates/a/b.mp4" } })
    expect(both.ok ? [] : both.errors).toEqual(["video must name exactly one of: url, file"])
  })

  it("refuses bad props with the path of every field", () => {
    const result = parseVideoEmbedProps({
      video: { url: "https://vimeo.com/76979871" },
      aspect: "21/9",
      width: "wide",
      textPosition: "below",
    })
    expect(result.ok ? [] : result.errors).toEqual([
      "video.url must be a YouTube, VK Video or Rutube link (https, the video's own page or embed address)",
      "textPosition must be one of: above, left, right",
      "aspect must be one of: 16/9, 4/3, 9/16",
      "width must be one of: container, full",
    ])
  })

  it("refuses a file outside the template's folder or of another kind", () => {
    for (const file of ["/static/tenants/ten_1/clip.mp4", "/templates/a/clip.mov", "https://cdn.example/clip.mp4", "/templates/../clip.mp4"]) {
      const result = parseVideoEmbedProps({ video: { file } })
      expect(result.ok ? [] : result.errors).toEqual(["video.file must be /templates/<template-id>/<file>.(mp4|webm)"])
    }
  })

  it("keeps loop and muted to a file: a third party's player takes neither", () => {
    const result = parseVideoEmbedProps({ video: { url: LODGE }, loop: true })
    expect(result.ok ? [] : result.errors).toEqual(["loop and muted apply to a file of the template only"])
  })

  it("accepts both fixtures and registers the block under video/embed", () => {
    expect(parseVideoEmbedProps(videoEmbed.fixtures?.empty).ok).toBe(true)
    expect(parseVideoEmbedProps(videoEmbed.fixtures?.sample).ok).toBe(true)
    expect(blockById("video/embed")).toBe(videoEmbed)
    expect(CATEGORY_BLOCKS.video.map((entry) => entry.id)).toContain("video/embed")
    expect(videoEmbed.roles).toEqual(["video-player", "headline", "description", "cta-primary"])
    expect(videoEmbed.status).toBe("lab")
  })
})

describe("mediaOf", () => {
  it("turns a link into its embed and a file into itself, with loop and muted", () => {
    expect(mediaOf({ url: LODGE }, { loop: false, muted: false })).toEqual({
      kind: "frame",
      provider: "youtube",
      src: "https://www.youtube-nocookie.com/embed/y-3W2A1W7bE?autoplay=1&rel=0&playsinline=1",
    })
    expect(mediaOf({ file: "/templates/a/b.webm" }, { loop: true, muted: true })).toEqual({
      kind: "file",
      src: "/templates/a/b.webm",
      loop: true,
      muted: true,
    })
    expect(mediaOf({ url: "https://vimeo.com/1" }, { loop: false, muted: false })).toBeNull()
  })
})

describe("VideoEmbed", () => {
  it("draws nothing without a video, and reads nothing", async () => {
    expect(await render(blank)).toBeNull()
    expect(await render({ ...blank, cover })).toBeNull()
    expect(resolveImageRef).not.toHaveBeenCalled()
  })

  it("draws nothing for a link whose cover is not there: no grey box, no third party", async () => {
    resolveImageRef.mockResolvedValue(null)
    expect(await render(filled)).toBeNull()
    expect(await render({ ...filled, cover: null })).toBeNull()
  })

  it("shows the cover as one play button first, and no address of the video's host", async () => {
    const html = (await render(filled))!
    expect(html).toContain('data-block="video/embed"')
    expect(html).toMatch(/<button type="button"[^>]*data-role="video-player"[^>]*aria-label="Смотреть видео"/)
    expect(html).toContain('src="https://shipshift.dev/static/skillet.webp"')
    expect(html).not.toMatch(/youtube|ytimg|vk\.com|rutube|<iframe|<video/)
    expect(html).toMatch(new RegExp(`<h2 data-role="headline" class="[^"]*${SECTION_TYPE.heading.split(" ")[0]}`))
    expect(html).toContain('data-role="description"')
    expect(classOf(html, "video-player")).toContain("aspect-video")
    expect(classOf(html, "video-player")).toContain("rounded-[var(--radius)]")
  })

  it("plays a template's file without a cover on its own first frame", async () => {
    const html = (await render({ ...blank, video: { file: "/templates/a/clip.mp4" } }))!
    expect(html).toMatch(/<video[^>]*preload="metadata"/)
    expect(html).toContain('src="/templates/a/clip.mp4"')
    expect(html).not.toContain("<button")
  })

  it("stands the words beside the video from 1024 px, and above it at full width", async () => {
    expect(await render({ ...filled, textPosition: "left" })).toContain("small:grid-cols-[1fr_2fr]")
    expect(await render({ ...filled, textPosition: "right" })).toContain("small:grid-cols-[2fr_1fr]")
    const full = (await render({ ...filled, textPosition: "left", width: "full" }))!
    expect(full).not.toContain("small:grid-cols-")
    expect(classOf(full, "video-player")).not.toContain("rounded-[var(--radius)]")
  })

  it("holds a 9/16 video to a narrow column so it never outgrows the screen", async () => {
    expect(classOf((await render({ ...filled, aspect: "9/16" }))!, "video-player")).toContain("max-w-sm")
  })

  it("draws the template's button as the primary action", async () => {
    const html = (await render({ ...filled, button: { label: { ru: "В каталог" }, href: "/store" } }))!
    expect(html).toMatch(/<a href="\/ru\/store" data-role="cta-primary"[^>]*>В каталог<\/a>/)
  })
})

describe("PlayingMedia", () => {
  it("embeds a link's player with autoplay allowed, full screen and a title", () => {
    const html = renderToStaticMarkup(
      <PlayingMedia media={mediaOf({ url: LODGE }, { loop: false, muted: false })!} title="Первая неделя" poster={null} />
    )
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/y-3W2A1W7bE?autoplay=1&amp;rel=0&amp;playsinline=1"')
    expect(html).toContain('allow="autoplay; encrypted-media; picture-in-picture; fullscreen"')
    expect(html).toContain('title="Первая неделя"')
    expect(html).toContain("allowFullScreen")
  })

  it("plays a file with its loop and mute", () => {
    const html = renderToStaticMarkup(
      <PlayingMedia media={mediaOf({ file: "/templates/a/b.mp4" }, { loop: true, muted: true })!} title="Клип" poster="/x.webp" />
    )
    expect(html).toMatch(/<video[^>]*autoPlay|<video[^>]*autoplay/)
    expect(html).toContain("loop")
    expect(html).toContain('muted=""')
    expect(html).toContain('poster="/x.webp"')
  })
})
