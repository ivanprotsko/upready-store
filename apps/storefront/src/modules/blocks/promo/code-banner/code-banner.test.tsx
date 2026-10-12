import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getTemplate } from "@lib/templates/catalog"
import { validateTemplate } from "@lib/templates/manifest"

import { BLOCKS, CATEGORY_BLOCKS, blockById } from "../../registry"
import type { ImageRef } from "../../shared/image-ref"
import { SECTION_TYPE } from "../../shared/section-type"
import PromoCodeBanner from "."
import { codeBanner } from "./block"
import { copyCode } from "./copy-code"
import {
  BUTTON_LABEL,
  CODE_LABEL,
  COPIED_LABEL,
  COPY_LABEL,
  EXPIRES_LABEL,
  HEADLINE,
  SELECTED_LABEL,
  expiresAt,
  parsePromoCodeBannerProps,
  type PromoCodeBannerProps,
} from "./props"

vi.mock("server-only", () => ({}))

const state = vi.hoisted(() => ({
  locale: "ru",
  /** What `resolveImageRef` answers per source, keyed by its handle or file; absent is null. */
  pictures: {} as Record<string, string>,
  calls: [] as unknown[],
}))
vi.mock("next-intl/server", () => ({ getLocale: async () => state.locale }))
vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={`/ru${href}`} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("@lib/data/block-image", () => ({
  resolveImageRef: async (ref: ImageRef) => {
    state.calls.push(ref)
    const key = "src" in ref ? ref.src : "category" in ref ? ref.category : ref.product
    const url = state.pictures[key]
    return url ? { url, alt: ref.alt.ru ?? key, width: null, height: null } : null
  },
}))
vi.mock("next/image", () => ({
  default: ({ src, alt, fill, sizes, className }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src as string}
      alt={alt as string}
      data-fill={fill ? "" : undefined}
      sizes={sizes as string}
      className={className as string}
    />
  ),
}))

const render = async (props: PromoCodeBannerProps) => {
  const tree = await PromoCodeBanner(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const banner = (extra: Partial<PromoCodeBannerProps> = {}): PromoCodeBannerProps => ({
  code: "MORNING10",
  headline: { ru: "−10 % на первый заказ", en: "10% off your first order" },
  text: {},
  badge: {},
  terms: {},
  expires: null,
  button: null,
  image: null,
  tone: "plain",
  layout: "card",
  copyLabel: COPY_LABEL,
  copiedLabel: COPIED_LABEL,
  selectedLabel: SELECTED_LABEL,
  codeLabel: CODE_LABEL,
  expiresLabel: EXPIRES_LABEL,
  ...extra,
})

const errors = (input: unknown) => {
  const result = parsePromoCodeBannerProps(input)
  return result.ok ? [] : result.errors
}

/** The class list of the first element with `data-role` = role. */
const classOf = (html: string, role: string) =>
  html.match(new RegExp(`data-role="${role}"[^>]*?class="([^"]*)"|class="([^"]*)"[^>]*?data-role="${role}"`))?.slice(1).find(Boolean)?.split(" ") ?? null

/** The class list of the panel: the card or the band. */
const panelOf = (html: string) => html.match(/<div data-layout="(?:card|inline)" data-tone="[a-z]+" class="([^"]*)"/)![1].split(" ")

beforeEach(() => {
  state.locale = "ru"
  state.pictures = { tableware: "https://cdn.example/tableware.jpg", mug: "https://cdn.example/mug.jpg" }
  state.calls = []
  vi.useFakeTimers({ now: new Date("2026-10-13T09:00:00+03:00"), toFake: ["Date"] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("parsePromoCodeBannerProps", () => {
  it("draws nothing without props: no code, and every word of its own chrome in Russian and English", () => {
    expect(parsePromoCodeBannerProps(undefined)).toEqual({
      ok: true,
      value: {
        code: null,
        headline: HEADLINE,
        text: {},
        badge: {},
        terms: {},
        expires: null,
        button: null,
        image: null,
        tone: "plain",
        layout: "card",
        copyLabel: COPY_LABEL,
        copiedLabel: COPIED_LABEL,
        selectedLabel: SELECTED_LABEL,
        codeLabel: CODE_LABEL,
        expiresLabel: EXPIRES_LABEL,
      },
    })
    for (const words of [HEADLINE, COPY_LABEL, COPIED_LABEL, SELECTED_LABEL, CODE_LABEL, EXPIRES_LABEL, BUTTON_LABEL]) {
      expect(words.ru).toBeTruthy()
      expect(words.en).toBeTruthy()
    }
    expect(COPY_LABEL.ru).toBe("Скопировать")
    expect(COPIED_LABEL.ru).toBe("Скопировано")
  })

  it("takes a code of 3 to 20 capitals and digits, and nothing else", () => {
    for (const code of ["MORNING10", "ABC", "SALE2026", "A".repeat(20), "123"]) {
      expect(errors({ code })).toEqual([])
    }
    const message = "code must be 3 to 20 characters of A–Z and 0–9, as the promotion in the panel has it"
    for (const code of ["AB", "A".repeat(21), "morning10", "SALE-10", "SALE 10", "СКИДКА", 1234]) {
      expect(errors({ code })).toEqual([message])
    }
    expect(parsePromoCodeBannerProps({ code: "" })).toMatchObject({ ok: true, value: { code: null } })
  })

  it("takes an expiry as an ISO date or a date and time with its offset", () => {
    for (const expires of ["2027-06-30", "2027-06-30T23:59:00+03:00", "2027-06-30T20:59Z", "2028-02-29"]) {
      expect(errors({ code: "ABC", expires })).toEqual([])
    }
    const message =
      "expires must be an ISO date, 2027-06-30, or a date and time with its offset, 2027-06-30T23:59:00+03:00"
    for (const expires of ["30.06.2027", "2027-06-31", "2027-02-29", "2027-06-30T23:59", "2027-6-30", "tomorrow", 20270630]) {
      expect(errors({ code: "ABC", expires })).toEqual([message])
    }
  })

  it("fills the button's words when it has none and asks for its link", () => {
    expect(parsePromoCodeBannerProps({ code: "ABC", button: { href: "/store" } })).toMatchObject({
      ok: true,
      value: { button: { label: BUTTON_LABEL, href: "/store" } },
    })
    expect(errors({ code: "ABC", button: { label: { ru: "В каталог" } } })).toEqual(["button.href is required"])
  })

  it("refuses a picture on the inline band, which draws none", () => {
    const image = { product: "mug", alt: {} }
    expect(errors({ code: "ABC", layout: "card", image })).toEqual([])
    expect(errors({ code: "ABC", layout: "inline", image })).toEqual([
      "image: the inline layout draws no picture; use layout card or leave the image out",
    ])
  })

  it("refuses bad props with the path of every field", () => {
    expect(
      errors({
        code: "ABC",
        headline: { ru: "х".repeat(91) },
        text: { ru: "х".repeat(241) },
        badge: { ru: "х".repeat(25) },
        terms: { ru: "х".repeat(161) },
        tone: "loud",
        layout: "wide",
        copyLabel: { ru: "х".repeat(21) },
        price: 10,
      })
    ).toEqual([
      "headline.ru is 91 characters, at most 90",
      "text.ru is 241 characters, at most 240",
      "badge.ru is 25 characters, at most 24",
      "terms.ru is 161 characters, at most 160",
      "tone must be one of: plain, accent, inverted",
      "layout must be one of: card, inline",
      "copyLabel.ru is 21 characters, at most 20",
      "price: not a prop of promo/code-banner",
    ])
  })
})

describe("expiresAt", () => {
  it("ends a date at midnight Moscow time, and a date and time at that moment", () => {
    expect(expiresAt("2027-06-30")).toBe(Date.parse("2027-07-01T00:00:00+03:00"))
    expect(expiresAt("2027-06-30T12:00:00Z")).toBe(Date.parse("2027-06-30T12:00:00Z"))
    expect(expiresAt(null)).toBe(Infinity)
  })
})

describe("copyCode", () => {
  it("copies through the Clipboard API and selects nothing", async () => {
    const writeText = vi.fn(async () => {})
    const select = vi.fn()
    await expect(copyCode("MORNING10", { writeText, select })).resolves.toBe("copied")
    expect(writeText).toHaveBeenCalledWith("MORNING10")
    expect(select).not.toHaveBeenCalled()
  })

  it("selects the code when the Clipboard API refuses or is missing", async () => {
    const select = vi.fn()
    await expect(copyCode("MORNING10", { writeText: async () => Promise.reject(new Error("denied")), select })).resolves.toBe("selected")
    expect(select).toHaveBeenCalledTimes(1)
    await expect(copyCode("MORNING10", { select })).resolves.toBe("selected")
    expect(select).toHaveBeenCalledTimes(2)
  })
})

describe("PromoCodeBanner", () => {
  it("draws nothing without a code, and the empty fixture draws nothing", async () => {
    expect(await render(banner({ code: null }))).toBeNull()
    expect(await render(codeBanner.fixtures!.empty)).toBeNull()
    expect(state.calls).toEqual([])
  })

  it("draws nothing once the expiry has passed, and draws on its last day", async () => {
    expect(await render(banner({ expires: "2026-10-12" }))).toBeNull()
    expect(await render(banner({ expires: "2026-10-13T08:59:00+03:00" }))).toBeNull()
    expect(await render(banner({ expires: "2026-10-13" }))).not.toBeNull()
    vi.setSystemTime(new Date("2026-10-13T23:59:00+03:00"))
    expect(await render(banner({ expires: "2026-10-13" }))).not.toBeNull()
    vi.setSystemTime(new Date("2026-10-14T00:00:01+03:00"))
    expect(await render(banner({ expires: "2026-10-13" }))).toBeNull()
  })

  it("draws the sample in its section shell with every role of its entry", async () => {
    const html = (await render(codeBanner.fixtures!.sample))!
    expect(html).toContain('data-block="promo/code-banner"')
    for (const role of codeBanner.roles) {
      expect(html).toContain(`data-role="${role}"`)
    }
    expect(html).toContain('value="MORNING10"')
    expect(html).toContain('<img src="https://cdn.example/tableware.jpg"')
  })

  it("draws the headline as the section's h2 in the section type, never an h1", async () => {
    const html = (await render(banner({ text: { ru: "Скидка на всю корзину" } })))!
    expect(html).not.toContain("<h1")
    expect(html).toMatch(/<h2 data-role="headline" class="[^"]*">−10 % на первый заказ<\/h2>/)
    expect(classOf(html, "headline")).toEqual(SECTION_TYPE.heading.split(" "))
    expect(classOf(html, "description")).toEqual(SECTION_TYPE.description.split(" "))
  })

  it("holds the code in a read-only field named for a screen reader, next to the copy button and a polite live region", async () => {
    const html = (await render(banner()))!
    expect(html).toMatch(/<input[^>]*data-role="promo-text"[^>]*>/)
    const input = html.match(/<input[^>]*data-role="promo-text"[^>]*>/)![0]
    expect(input).toContain('readOnly=""')
    expect(input).toContain('value="MORNING10"')
    expect(input).toContain('aria-label="Промокод"')
    expect(classOf(html, "promo-text")).toEqual(expect.arrayContaining(["font-mono", "min-h-11"]))
    expect(html).toMatch(/<button type="button" data-role="cta-primary"[^>]*>.*Скопировать.*<\/button>/)
    expect(html).toContain('aria-live="polite"')
    // Both words stand in the button from the first paint, one hidden, so it keeps its width when it says «Скопировано».
    expect(html).toMatch(/<button[^>]*>.*Скопировано.*<\/button>/)
  })

  it("draws the badge, the text, the terms with the expiry and the link only where the props have them", async () => {
    const bare = (await render(banner()))!
    for (const role of ["badge", "description", "legal", "cta-secondary", "media"]) {
      expect(bare).not.toContain(`data-role="${role}"`)
    }

    const full = (await render(
      banner({
        badge: { ru: "Новым покупателям" },
        text: { ru: "Введите код при оформлении." },
        terms: { ru: "Один раз на покупателя." },
        expires: "2027-06-30",
        button: { label: BUTTON_LABEL, href: "/store" },
      })
    ))!
    expect(full).toMatch(/data-role="badge"[^>]*>Новым покупателям</)
    expect(full).toMatch(/data-role="description"[^>]*>Введите код при оформлении.</)
    expect(full).toContain("Один раз на покупателя.")
    expect(full).toContain("Действует до 30 июня 2027 г.")
    expect(full).toMatch(/<a href="\/ru\/store" data-role="cta-secondary"[^>]*>В каталог<\/a>/)
  })

  it("puts the picture beside the words on a card, and centres the words when the shop has no such picture", async () => {
    const image: ImageRef = { category: "tableware", alt: { ru: "Тарелки" } }
    const html = (await render(banner({ image })))!
    expect(html).toMatch(/data-role="media"[^>]*><img src="https:\/\/cdn.example\/tableware.jpg" alt="Тарелки" data-fill="" sizes="\(min-width: 1024px\) 50vw, 100vw"/)
    expect(panelOf(html)).toEqual(expect.arrayContaining(["grid", "small:grid-cols-2"]))

    const missing = (await render(banner({ image: { product: "gone", index: 0, alt: {} } })))!
    expect(missing).not.toContain("<img")
    expect(missing).not.toContain('data-role="media"')
    expect(missing).toContain("text-center")
  })

  it("lays the inline band out as one row from 1024 px, the code and the buttons at its end", async () => {
    const html = (await render(banner({ layout: "inline", button: { label: BUTTON_LABEL, href: "/store" } })))!
    expect(panelOf(html)).toEqual(expect.arrayContaining(["flex", "flex-col", "small:flex-row", "small:items-center", "small:justify-between"]))
    expect(html).not.toContain("<img")
  })

  it("paints each tone with the palette's own pairs", async () => {
    const plain = (await render(banner({ tone: "plain" })))!
    expect(panelOf(plain)).toEqual(expect.arrayContaining(["border", "border-[var(--border)]"]))
    expect(classOf(plain, "cta-primary")).toEqual(
      expect.arrayContaining(["bg-[var(--layer-button-bg,var(--primary))]", "text-[var(--layer-button-fg,var(--primary-foreground))]"])
    )

    const accent = (await render(banner({ tone: "accent", text: { ru: "Текст" } })))!
    expect(panelOf(accent)).toContain("bg-[var(--primary)]")
    for (const role of ["headline", "description"]) {
      expect(classOf(accent, role)).toContain("text-[var(--primary-foreground)]")
      expect(classOf(accent, role)!.filter((c) => c.startsWith("text-ui-fg"))).toEqual([])
    }
    expect(classOf(accent, "cta-primary")).toEqual(expect.arrayContaining(["bg-[var(--primary-foreground)]", "text-[var(--primary)]"]))
    expect(classOf(accent, "promo-text")).toContain("border-[var(--primary-foreground)]")

    const inverted = (await render(banner({ tone: "inverted" })))!
    expect(panelOf(inverted)).toContain("bg-[var(--foreground)]")
    expect(classOf(inverted, "headline")).toContain("text-[var(--background)]")
    expect(classOf(inverted, "cta-primary")).toEqual(expect.arrayContaining(["bg-[var(--background)]", "text-[var(--foreground)]"]))
  })

  it("keeps every target 44 px high with a focus ring in the tone's own foreground", async () => {
    const html = (await render(banner({ tone: "accent", button: { label: BUTTON_LABEL, href: "/store" } })))!
    for (const role of ["cta-primary", "cta-secondary", "promo-text"]) {
      expect(classOf(html, role)).toEqual(expect.arrayContaining(["min-h-11", "focus-visible:outline-[var(--primary-foreground)]"]))
    }
    const plain = (await render(banner()))!
    expect(classOf(plain, "cta-primary")).toContain("focus-visible:outline-[var(--ring)]")
  })

  it("uses tokens only and keeps the text plain: markup in the props is shown, not run", async () => {
    const html = (await render(banner({ headline: { ru: "<b>Скидка</b>" }, text: { ru: "<script>alert(1)</script>" } })))!
    expect(html).not.toContain("<b>")
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;b&gt;Скидка&lt;/b&gt;")
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(|shadow-\[|(?:bg|text)-(?:white|black)\b/i)
  })

  it("speaks the visitor's language, else English, its own words included", async () => {
    state.locale = "de"
    const html = (await render(banner({ expires: "2027-06-30" })))!
    expect(html).toContain("10% off your first order")
    expect(html).toContain("Copy")
    expect(html).toContain('aria-label="Promo code"')
    expect(html).toContain("Valid until")
  })
})

describe("promo/code-banner in the registry", () => {
  it("is a lab home block of static data that tells the playground the code must exist in the panel", () => {
    expect(blockById("promo/code-banner")).toBe(codeBanner)
    expect(codeBanner).toMatchObject({ category: "promo", variant: "code-banner", data: ["static"], status: "lab", placement: "home" })
    expect(codeBanner.title).toMatch(/promotions? in the panel/)
    expect([...codeBanner.roles].sort()).toEqual(
      ["badge", "cta-primary", "cta-secondary", "description", "headline", "legal", "media", "promo-text"]
    )
    expect(CATEGORY_BLOCKS.promo.map((b) => b.id)).toContain("promo/code-banner")
    expect(BLOCKS.map((b) => b.id)).toContain("promo/code-banner")
  })

  it("has fixtures its own parser accepts, and a sample that never expires", () => {
    for (const fixture of [codeBanner.fixtures!.empty, codeBanner.fixtures!.sample]) {
      expect(parsePromoCodeBannerProps(fixture)).toEqual({ ok: true, value: fixture })
    }
    expect(codeBanner.fixtures!.empty.code).toBeNull()
    expect(codeBanner.fixtures!.sample.expires).toBeNull()
  })

  it("may stand in a template, and a lowercase code is refused with its path", () => {
    const manifest = structuredClone(getTemplate("long-morning")!.manifest)
    manifest.sections.push({ block: "promo/code-banner", props: codeBanner.fixtures!.sample })
    const result = validateTemplate(manifest, blockById)
    expect(result.ok ? [] : result.errors).toEqual([])

    manifest.sections[manifest.sections.length - 1] = { block: "promo/code-banner", props: { code: "morning10" } }
    const refused = validateTemplate(manifest, blockById)
    expect(refused.ok ? [] : refused.errors.map((e) => e.message)).toEqual([
      "code must be 3 to 20 characters of A–Z and 0–9, as the promotion in the panel has it",
    ])
  })
})
