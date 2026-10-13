import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getTemplate } from "@lib/templates/catalog"
import { validateTemplate } from "@lib/templates/manifest"

import { BLOCKS, CATEGORY_BLOCKS, blockById } from "../../registry"
import { SECTION_TYPE } from "../../shared/section-type"
import NewsletterSignup from "."
import { newsletterSignup } from "./block"
import { HEADING, NETWORK_LABEL, TEXT, parseNewsletterSignupProps, type NewsletterSignupProps } from "./props"

vi.mock("server-only", () => ({}))

const locale = vi.hoisted(() => ({ current: "ru" }))
vi.mock("next-intl/server", () => ({ getLocale: async () => locale.current }))

const render = async (props: NewsletterSignupProps) => {
  const tree = await NewsletterSignup(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const telegram = { network: "telegram", href: "https://t.me/example_shop", label: NETWORK_LABEL.telegram } as const
const vk = { network: "vk", href: "https://vk.com/example_shop", label: NETWORK_LABEL.vk } as const
const max = { network: "max", href: "https://max.ru/example_shop", label: NETWORK_LABEL.max } as const

const blank: NewsletterSignupProps = {
  heading: HEADING,
  text: TEXT,
  mode: "channels",
  channels: [],
  align: "center",
  tone: "muted",
}

const errors = (input: unknown) => {
  const result = parseNewsletterSignupProps(input)
  return result.ok ? [] : result.errors
}

beforeEach(() => {
  locale.current = "ru"
})

describe("parseNewsletterSignupProps", () => {
  it("reads absent props as the block's own words, channels mode with no channel, centred on a muted panel", () => {
    expect(parseNewsletterSignupProps(undefined)).toEqual({ ok: true, value: blank })
    for (const text of [HEADING, TEXT, ...Object.values(NETWORK_LABEL)]) expect(text.ru && text.en).toBeTruthy()
  })

  it("refuses the email mode, because no subscribe endpoint exists to post to", () => {
    expect(errors({ mode: "email" })).toEqual([
      "mode: email needs a subscribe endpoint, and neither the backend nor the storefront has one yet; use channels",
    ])
    expect(errors({ mode: "sms" })).toEqual(["mode must be one of: channels"])
  })

  it("names a channel by its network when the template gives no label", () => {
    const result = parseNewsletterSignupProps({
      channels: [{ network: "telegram", href: "https://t.me/example_shop" }, { network: "vk", label: { ru: "Наша группа" } }],
    })
    expect(result.ok && result.value.channels).toEqual([
      { network: "telegram", href: "https://t.me/example_shop", label: NETWORK_LABEL.telegram },
      { network: "vk", href: null, label: { ru: "Наша группа" } },
    ])
  })

  it("accepts a link only on its own network, www. included", () => {
    const ok = parseNewsletterSignupProps({
      channels: [
        { network: "telegram", href: "https://telegram.me/example_shop" },
        { network: "vk", href: "https://www.vk.ru/example_shop" },
        { network: "max", href: "https://max.ru/example_shop" },
      ],
    })
    expect(ok.ok).toBe(true)
    expect(
      errors({
        channels: [
          { network: "telegram", href: "https://vk.com/example_shop" },
          { network: "vk", href: "/store" },
          { network: "max", href: "https://max.ru/" },
        ],
      })
    ).toEqual([
      "channels[0].href must lead to a channel on t.me or telegram.me for telegram",
      "channels[1].href must lead to a channel on vk.com or vk.ru for vk",
      "channels[2].href must lead to a channel on max.ru for max",
    ])
  })

  it("refuses bad props with the path of every field", () => {
    expect(
      errors({
        heading: { ru: "я".repeat(91) },
        text: { xx: "Hello" },
        channels: [{ network: "whatsapp", href: "//evil.example" }, { network: "vk", label: { ru: "я".repeat(31) }, icon: "send" }],
        align: "right",
        tone: "loud",
        form: true,
      })
    ).toEqual([
      "heading.ru is 91 characters, at most 90",
      "text.xx: not a language of i18n/config.ts",
      "channels[0].network must be one of: telegram, vk, max",
      "channels[0].href: // leads to another site; write https://",
      "channels[1].label.ru is 31 characters, at most 30",
      "channels[1].icon: not a field of channels[1]",
      "align must be one of: center, left",
      "tone must be one of: muted, plain",
      "form: not a prop of newsletter/signup",
    ])
  })

  it("holds at most three channels", () => {
    expect(errors({ channels: [telegram, vk, max, telegram] })).toEqual(["channels has 4 items, at most 3"])
  })
})

describe("NewsletterSignup", () => {
  it("draws nothing when no channel has a link, words or not", async () => {
    expect(await render(blank)).toBeNull()
    expect(await render({ ...blank, channels: [{ ...telegram, href: null }, { ...vk, href: null }] })).toBeNull()
    expect(await render(newsletterSignup.fixtures!.empty)).toBeNull()
  })

  it("draws the sample in its section shell: heading, text and one button per channel, the first one primary", async () => {
    const html = (await render(newsletterSignup.fixtures!.sample))!
    expect(html).toMatch(/^<section data-block="newsletter\/signup" class="py-\[calc\(var\(--layer-section-gap,3rem\)\/2\)\]">/)
    expect(html).toContain('data-role="section-header"')
    expect(html).toContain(`<h2 data-role="heading" class="${SECTION_TYPE.heading}">`)
    expect(html).toMatch(new RegExp(`<p data-role="description" class="${SECTION_TYPE.description.replace(/[[\]()]/g, "\\$&")}[^"]*">[^<]+</p>`))
    const buttons = Array.from(html.matchAll(/<a data-role="(cta-[a-z]+)" href="([^"]+)"[^>]*>.*?<\/a>/g), (m) => [m[1], m[2]])
    expect(buttons).toEqual([
      ["cta-primary", "https://t.me/example_shop"],
      ["cta-secondary", "https://vk.com/example_shop"],
      ["cta-secondary", "https://max.ru/example_shop"],
    ])
    for (const name of ["Telegram", "ВКонтакте", "MAX"]) expect(html).toMatch(new RegExp(`</svg>${name}</a>`))
  })

  it("is honest: no form, no field, no consent line while no endpoint exists", async () => {
    const html = (await render(newsletterSignup.fixtures!.sample))!
    expect(html).not.toMatch(/<form|<input|type="email"|consent/)
  })

  it("skips a channel with no link, and the first channel with one is the primary", async () => {
    const html = (await render({ ...blank, channels: [{ ...telegram, href: null }, vk, max] }))!
    expect(html).not.toContain("t.me")
    expect(html).toMatch(/<a data-role="cta-primary" href="https:\/\/vk\.com\/example_shop"/)
    expect(html.match(/data-role="cta-secondary"/g)).toHaveLength(1)
  })

  it("draws an icon per network beside its name, hidden from screen readers", async () => {
    const html = (await render({ ...blank, channels: [telegram, vk, max] }))!
    const icons = html.match(/<svg[^>]*data-role="icon"[^>]*>/g) ?? []
    expect(icons).toHaveLength(3)
    for (const icon of icons) expect(icon).toContain('aria-hidden="true"')
    expect(icons.map((icon) => icon.match(/lucide-([a-z-]+)/)?.[1])).toEqual(["send", "users", "message-circle"])
  })

  it("draws the primary in the template's button layer and the others outlined with no fill, 44 px high, full width on a phone", async () => {
    const html = (await render({ ...blank, channels: [telegram, vk] }))!
    const [primary, secondary] = Array.from(html.matchAll(/<a data-role="cta-[a-z]+"[^>]*class="([^"]*)"/g), (m) => m[1].split(" "))
    expect(primary).toEqual(
      expect.arrayContaining([
        "min-h-11",
        "w-full",
        "xsmall:w-auto",
        "bg-[var(--layer-button-bg,var(--primary))]",
        "text-[var(--layer-button-fg,var(--primary-foreground))]",
        "rounded-[var(--radius)]",
      ])
    )
    expect(secondary).toEqual(expect.arrayContaining(["min-h-11", "w-full", "xsmall:w-auto", "border-[var(--border)]", "bg-transparent"]))
    expect(secondary.some((c) => c.includes("layer-button") || c.startsWith("bg-[var("))).toBe(false)
  })

  it("uses the channel's own label, else the network's name, in the visitor's language, then English", async () => {
    locale.current = "de"
    const html = (await render({ ...blank, heading: { en: "Stay in touch" }, channels: [{ ...vk, label: { ru: "Группа", en: "Our group" } }, max] }))!
    expect(html).toMatch(/<h2[^>]*>Stay in touch<\/h2>/)
    expect(html).toContain("</svg>Our group</a>")
    expect(html).toContain("</svg>MAX</a>")
  })

  it("draws the buttons alone when the template empties the words", async () => {
    const html = (await render({ ...blank, heading: {}, text: {}, channels: [telegram] }))!
    expect(html).not.toContain('data-role="section-header"')
    expect(html).toContain('data-role="cta-primary"')
  })

  it("centres on a muted panel by default and stands left and plain on request, tokens only", async () => {
    const muted = (await render({ ...blank, channels: [telegram] }))!
    expect(muted).toContain("bg-[var(--muted)]")
    expect(muted).toContain("rounded-[var(--radius)]")
    expect(muted).toContain("mx-auto")
    expect(muted).toContain("text-center")

    const plain = (await render({ ...blank, channels: [telegram], align: "left", tone: "plain" }))!
    expect(plain).not.toContain("bg-[var(--muted)]")
    expect(plain).not.toContain("mx-auto")
    expect(plain).not.toContain("text-center")
    for (const html of [muted, plain]) expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(/i)
  })

  it("keeps the text plain: markup in the props is shown, not run", async () => {
    const html = (await render({ ...blank, text: { ru: "<b>скидки</b><script>alert(1)</script>" }, channels: [telegram] }))!
    expect(html).not.toContain("<b>")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;b&gt;скидки&lt;/b&gt;")
  })
})

describe("newsletter/signup in the registry", () => {
  it("is a static lab home block with the roles it draws", () => {
    expect(blockById("newsletter/signup")).toBe(newsletterSignup)
    expect(newsletterSignup).toMatchObject({ category: "newsletter", variant: "signup", data: ["static"], status: "lab", placement: "home" })
    expect([...newsletterSignup.roles].sort()).toEqual(
      ["cta-primary", "cta-secondary", "description", "heading", "icon", "section-header"].sort()
    )
    expect(CATEGORY_BLOCKS.newsletter.map((b) => b.id)).toContain("newsletter/signup")
    expect(BLOCKS.map((b) => b.id)).toContain("newsletter/signup")
  })

  it("may stand in a template, and a template asking for the email form is refused with its path", () => {
    const manifest = structuredClone(getTemplate("long-morning")!.manifest)
    manifest.sections.push({ block: "newsletter/signup", props: newsletterSignup.fixtures!.sample })
    const result = validateTemplate(manifest, blockById)
    expect(result.ok ? [] : result.errors).toEqual([])

    manifest.sections[manifest.sections.length - 1] = { block: "newsletter/signup", props: { mode: "email" } }
    const refused = validateTemplate(manifest, blockById)
    expect(refused.ok ? [] : refused.errors.map((e) => e.message)).toEqual([
      "mode: email needs a subscribe endpoint, and neither the backend nor the storefront has one yet; use channels",
    ])
  })
})
