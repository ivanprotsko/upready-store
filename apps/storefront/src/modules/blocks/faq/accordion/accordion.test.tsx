import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getTemplate } from "@lib/templates/catalog"
import { validateTemplate } from "@lib/templates/manifest"

import { blockById, CATEGORY_BLOCKS } from "../../registry"
import FaqAccordion from "."
import { faqAccordion } from "./block"
import { parseFaqAccordionProps, type FaqAccordionProps } from "./props"

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

const render = async (props: FaqAccordionProps) => {
  const tree = await FaqAccordion(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const blank: FaqAccordionProps = { header: null, items: [], image: null, layout: "single", openFirst: false }

const delivery = {
  question: { ru: "Сколько идёт доставка?", en: "How long does delivery take?" },
  answer: { ru: "По Москве — 1–2 дня.\nВ регионы — 3–7 дней.", en: "Moscow: 1–2 days.\nOther regions: 3–7 days." },
}
const payment = {
  question: { ru: "Как оплатить заказ?", en: "How can I pay?" },
  answer: { ru: "Картой или через СБП на сайте.", en: "By card or by SBP on the site." },
}
const filled: FaqAccordionProps = { ...blank, items: [delivery, payment] }

const picture = { product: "braiser", index: 0, alt: {} }

/** The JSON-LD graph the block put in the page. */
const graphOf = (html: string) => {
  const raw = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1]
  return raw ? (JSON.parse(raw) as { "@type": string; mainEntity: { name: string; acceptedAnswer: { text: string } }[] }) : null
}

/** The class list of the element carrying `data-role="<role>"`. */
const classOf = (html: string, role: string) => html.match(new RegExp(`data-role="${role}"[^>]*class="([^"]*)"`))?.[1] ?? ""

beforeEach(() => {
  locale.current = "ru"
  resolveImageRef.mockReset()
  resolveImageRef.mockResolvedValue({ url: "https://shipshift.dev/static/braiser.webp", alt: "Жаровня", width: null, height: null })
})

describe("parseFaqAccordionProps", () => {
  it("reads absent props as an empty single-column section, every answer closed", () => {
    expect(parseFaqAccordionProps(undefined)).toEqual({ ok: true, value: blank })
  })

  it("takes up to twenty questions, a picture and the two-column layout", () => {
    const items = Array.from({ length: 20 }, () => delivery)
    const result = parseFaqAccordionProps({ items, image: { product: "braiser" }, layout: "two-column", openFirst: true })
    expect(result).toEqual({ ok: true, value: { header: null, items, image: picture, layout: "two-column", openFirst: true } })
  })

  it("refuses bad props with the path of every field", () => {
    const result = parseFaqAccordionProps({
      items: [{ question: { ru: "я".repeat(161) }, answer: { ru: "а".repeat(1001) } }, { question: { ru: "Где вы?" } }],
      image: { src: "https://example.com/a.jpg" },
      layout: "columns",
      openFirst: "yes",
      open: true,
    })
    expect(result.ok ? [] : result.errors).toEqual([
      "items[0].question.ru is 161 characters, at most 160",
      "items[0].answer.ru is 1001 characters, at most 1000",
      "items[1].answer must be an object of language code to string",
      "image.src must be /templates/<template-id>/<file>.(avif|webp|jpg|png)",
      "layout must be one of: single, two-column",
      "openFirst must be true or false",
      "open: not a prop of faq/accordion",
    ])
  })

  it("refuses more than twenty questions", () => {
    const result = parseFaqAccordionProps({ items: Array.from({ length: 21 }, () => delivery) })
    expect(result.ok ? [] : result.errors).toEqual(["items has 21 items, at most 20"])
  })
})

describe("FaqAccordion", () => {
  it("draws nothing, and no JSON-LD, without one question that has an answer in some language", async () => {
    expect(await render(blank)).toBeNull()
    expect(
      await render({
        ...blank,
        header: { eyebrow: {}, heading: { ru: "Вопросы" }, description: {}, seeAll: null },
        items: [
          { question: { ru: "Сколько идёт доставка?" }, answer: { ru: "  " } },
          { question: {}, answer: { ru: "Три дня." } },
        ],
        image: picture,
        layout: "two-column",
      })
    ).toBeNull()
    expect(resolveImageRef).not.toHaveBeenCalled()
    expect(await render(faqAccordion.fixtures!.empty)).toBeNull()
  })

  it("draws every question as a native disclosure that works without JS, answers closed by default", async () => {
    const html = (await render(filled))!
    expect(html).toMatch(/^<section data-block="faq\/accordion" class="py-\[calc\(var\(--layer-section-gap,3rem\)\/2\)\]">/)
    expect(html.match(/<details/g)).toHaveLength(2)
    expect(html).not.toMatch(/<details[^>]* open=""/)
    expect(html).toMatch(/<summary data-role="trigger"[^>]*>.*Сколько идёт доставка\?.*<\/summary>/)
    expect(html).toMatch(/<p data-role="content"[^>]*>По Москве — 1–2 дня.\nВ регионы — 3–7 дней.<\/p>/)
    expect(classOf(html, "content")).toContain("whitespace-pre-line")
    // No script drives it: no button, no aria state to keep in sync.
    expect(html).not.toContain("<button")
    expect(html).not.toContain("aria-expanded")
  })

  it("opens the first answer, and only the first, on request", async () => {
    const html = (await render({ ...filled, openFirst: true }))!
    expect(html.match(/<details[^>]* open=""/g)).toHaveLength(1)
    expect(html.indexOf('open=""')).toBeLessThan(html.indexOf("Сколько идёт доставка?"))
    expect(html.indexOf('open=""')).toBeLessThan(html.indexOf("Как оплатить заказ?"))
  })

  it("marks the state with a lucide chevron that turns, hidden from screen readers, and a 44 px target with a focus ring", async () => {
    const html = (await render(filled))!
    const chevron = html.match(/<summary[^>]*>.*?(<svg[^>]*>)/)?.[1] ?? ""
    expect(chevron).toContain('aria-hidden="true"')
    expect(chevron).toMatch(/class="[^"]*lucide-chevron-down[^"]*group-open:rotate-180[^"]*motion-reduce:transition-none/)
    expect(classOf(html, "trigger")).toContain("min-h-11")
    expect(classOf(html, "trigger")).toContain("focus-visible:outline-[var(--ring)]")
    expect(classOf(html, "trigger")).toContain("[&amp;::-webkit-details-marker]:hidden")
  })

  it("puts an FAQPage JSON-LD of exactly the questions drawn, in the visitor's language", async () => {
    const items = [delivery, { question: { ru: "Без ответа" }, answer: {} }, payment]
    const ru = graphOf((await render({ ...blank, items }))!)
    expect(ru).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Сколько идёт доставка?",
          acceptedAnswer: { "@type": "Answer", text: "По Москве — 1–2 дня.\nВ регионы — 3–7 дней." },
        },
        { "@type": "Question", name: "Как оплатить заказ?", acceptedAnswer: { "@type": "Answer", text: "Картой или через СБП на сайте." } },
      ],
    })

    locale.current = "en"
    const html = (await render({ ...blank, items }))!
    expect(html).not.toContain("Без ответа")
    expect(graphOf(html)!.mainEntity.map((q) => q.name)).toEqual(["How long does delivery take?", "How can I pay?"])
  })

  it("falls back to English, then any language, as pickText does", async () => {
    locale.current = "de"
    const html = (await render({ ...blank, items: [{ question: { fr: "Livrez-vous ?" }, answer: { fr: "Oui." } }] }))!
    expect(html).toContain("Livrez-vous ?")
    expect(graphOf(html)!.mainEntity[0].name).toBe("Livrez-vous ?")
  })

  it("keeps the text plain on the page and closes no script early in the JSON-LD", async () => {
    const html = (await render({
      ...blank,
      items: [{ question: { ru: "<b>Доставка</b>?" }, answer: { ru: "</script><script>alert(1)</script>" } }],
    }))!
    expect(html).not.toContain("<b>")
    expect(html).toContain("&lt;b&gt;Доставка&lt;/b&gt;?")
    expect(html.match(/<script/g)).toHaveLength(1)
    expect(graphOf(html)!.mainEntity[0].acceptedAnswer.text).toBe("</script><script>alert(1)</script>")
  })

  it("keeps one column at a reading width, and reads no picture, unless the layout is two-column", async () => {
    const html = (await render({ ...filled, image: picture }))!
    expect(resolveImageRef).not.toHaveBeenCalled()
    expect(html).not.toContain('data-role="media"')
    expect(html).toContain("max-w-3xl")
    expect(classOf(html, "content")).toContain("max-w-prose")
  })

  it("stands the picture beside the questions from 1024 px, and shows the questions alone below it", async () => {
    const html = (await render({ ...filled, image: picture, layout: "two-column" }))!
    expect(resolveImageRef).toHaveBeenCalledWith(picture, "ru")
    expect(html).toContain("small:grid-cols-[2fr_3fr]")
    expect(classOf(html, "media")).toContain("hidden")
    expect(classOf(html, "media")).toContain("small:block")
    expect(html).toMatch(/<div data-role="media"[^>]*>.*<div aria-hidden="true" class="aspect-\[var\(--layer-photo-aspect,1\/1\)\]"><\/div><img src="https:\/\/shipshift\.dev\/static\/braiser\.webp" alt="Жаровня" data-fill="true"/)
    expect(html.indexOf('data-role="media"')).toBeLessThan(html.indexOf('data-role="trigger"'))
  })

  it("falls back to one column when the two-column picture is not there", async () => {
    resolveImageRef.mockResolvedValue(null)
    const html = (await render({ ...filled, image: picture, layout: "two-column" }))!
    expect(html).not.toContain('data-role="media"')
    expect(html).not.toContain("grid-cols")
    expect(html).toContain("max-w-3xl")
  })

  it("draws the sample in its shell, with the header, and in theme tokens only", async () => {
    const sample = faqAccordion.fixtures!.sample
    const html = (await render(sample))!
    expect(html).toContain('data-role="section-header"')
    expect(html).toMatch(/<h2 data-role="heading"[^>]*>[^<]+<\/h2>/)
    expect(html).toContain("border-[var(--border)]")
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(|shadow-\[/i)
  })
})

describe("faq/accordion in the registry", () => {
  it("is a lab home block that reads products and categories through its picture", () => {
    expect(blockById("faq/accordion")).toBe(faqAccordion)
    expect(faqAccordion).toMatchObject({
      category: "faq",
      variant: "accordion",
      data: ["products", "categories", "static"],
      status: "lab",
      placement: "home",
    })
    expect([...faqAccordion.roles].sort()).toEqual(["content", "heading", "media", "section-header", "trigger"])
    expect(CATEGORY_BLOCKS.faq.map((b) => b.id)).toContain("faq/accordion")
  })

  it("has a sample of Russian delivery, payment and return questions, every one answered in Russian and English", () => {
    const { items } = faqAccordion.fixtures!.sample
    expect(items.length).toBeGreaterThanOrEqual(5)
    for (const item of items) {
      expect(item.question.ru && item.question.en && item.answer.ru && item.answer.en).toBeTruthy()
    }
    const questions = items.map((i) => i.question.ru).join(" ")
    for (const topic of [/доставк/i, /оплат/i, /вернуть|возврат/i]) expect(questions).toMatch(topic)
    // No personal data: no phone numbers, no e-mail addresses.
    expect(JSON.stringify(items)).not.toMatch(/\+7|8 ?\(?\d{3}|@[a-z]/i)
  })

  it("may stand in a template, and a template's bad props are refused with their path", () => {
    const manifest = structuredClone(getTemplate("long-morning")!.manifest)
    manifest.sections.splice(1, 0, { block: "faq/accordion", props: faqAccordion.fixtures!.sample })
    const result = validateTemplate(manifest, blockById)
    expect(result.ok ? [] : result.errors).toEqual([])

    manifest.sections[1] = { block: "faq/accordion", props: { layout: "split" } }
    const refused = validateTemplate(manifest, blockById)
    expect(refused.ok ? [] : refused.errors.map((e) => e.message)).toEqual(["layout must be one of: single, two-column"])
  })
})
