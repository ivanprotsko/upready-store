import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SECTION_TYPE } from "@modules/blocks/shared/section-type"
import { getTemplate } from "@lib/templates/catalog"
import { validateTemplate } from "@lib/templates/manifest"

import { BLOCKS, CATEGORY_BLOCKS, blockById } from "../../registry"
import Steps from "."
import { LIST_SAMPLE, steps } from "./block"
import { BUTTON_LABEL, parseStepsProps, type Step, type StepsProps } from "./props"

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

const render = async (props: StepsProps) => {
  const tree = await Steps(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const blank: StepsProps = { header: null, steps: [], button: null, layout: "row", tone: "plain" }

const step = (title: Step["title"], extra: Partial<Step> = {}): Step => ({
  title,
  text: { ru: "Добавьте в корзину всё, что понравилось." },
  icon: null,
  ...extra,
})

const count = (html: string, needle: string) => html.split(needle).length - 1

/** The number of a step, as drawn: aria-hidden, the `<ol>` reads the order out already. */
const numbers = (html: string) => Array.from(html.matchAll(/data-step-number=""[^>]*>(\d+)</g), (m) => Number(m[1]))

beforeEach(() => {
  locale.current = "ru"
})

describe("parseStepsProps", () => {
  it("reads absent props as an empty row, plain, with no button", () => {
    expect(parseStepsProps(undefined)).toEqual({ ok: true, value: blank })
  })

  it("gives a button without a label the block's own Russian and English words", () => {
    const result = parseStepsProps({ button: { href: "/store" } })
    expect(result).toEqual({ ok: true, value: { ...blank, button: { label: BUTTON_LABEL, href: "/store" } } })
    expect(BUTTON_LABEL).toEqual({ ru: "Перейти в каталог", en: "Go to the catalogue" })
  })

  it("refuses bad props with the path of every field", () => {
    const result = parseStepsProps({
      steps: [
        { title: { ru: "я".repeat(61) }, icon: "rocket" },
        { title: { ru: "Оформите заказ" }, text: { ru: "т".repeat(181) } },
        { title: { xx: "Receive" } },
      ],
      button: { href: "//evil.example", label: { ru: "к".repeat(31) } },
      layout: "grid",
      tone: "loud",
      footer: {},
    })
    expect(result.ok ? [] : result.errors).toEqual([
      "steps[0].title.ru is 61 characters, at most 60",
      "steps[0].icon must be an icon of shared/icon-name.ts, e.g. truck, credit-card, shield-check",
      "steps[1].text.ru is 181 characters, at most 180",
      "steps[2].title.xx: not a language of i18n/config.ts",
      "button.label.ru is 31 characters, at most 30",
      "button.href: // leads to another site; write https://",
      "layout must be one of: row, list",
      "tone must be one of: plain, muted",
      "footer: not a prop of columns/steps",
    ])
  })

  it("holds two to five steps and needs a title object on each", () => {
    const one = parseStepsProps({ steps: [{ title: { ru: "Выберите" } }] })
    expect(one.ok ? [] : one.errors).toEqual(["steps has 1 items, at least 2"])
    const six = parseStepsProps({ steps: Array.from({ length: 6 }, () => ({ title: { ru: "Шаг" } })) })
    expect(six.ok ? [] : six.errors).toEqual(["steps has 6 items, at most 5"])
    const untitled = parseStepsProps({ steps: [{ icon: "phone" }, { title: { ru: "Оформите" } }] })
    expect(untitled.ok ? [] : untitled.errors).toEqual(["steps[0].title must be an object of language code to string"])
    const noHref = parseStepsProps({ steps: [{ title: { ru: "А" } }, { title: { ru: "Б" } }], button: { label: { ru: "Купить" } } })
    expect(noHref.ok ? [] : noHref.errors).toEqual(["button.href is required"])
  })

  it("accepts both samples and the empty fixture", () => {
    expect(parseStepsProps(steps.fixtures!.sample)).toEqual({ ok: true, value: steps.fixtures!.sample })
    expect(parseStepsProps(steps.fixtures!.empty)).toEqual({ ok: true, value: steps.fixtures!.empty })
    expect(parseStepsProps(LIST_SAMPLE)).toEqual({ ok: true, value: LIST_SAMPLE })
  })
})

describe("Steps", () => {
  it("draws nothing with fewer than two steps that have a title in any language", async () => {
    expect(await render(blank)).toBeNull()
    expect(await render(steps.fixtures!.empty as StepsProps)).toBeNull()
    expect(await render({ ...blank, steps: [step({ ru: "Выберите" }), step({})] })).toBeNull()
  })

  it("skips a step with no title and numbers the rest in order", async () => {
    const html = (await render({ ...blank, steps: [step({ ru: "Выберите" }), step({}), step({ ru: "Оформите" }), step({ ru: "Получите" })] }))!
    expect(count(html, 'data-role="step"')).toBe(3)
    expect(numbers(html)).toEqual([1, 2, 3])
    expect(html).toContain("small:grid-cols-3")
  })

  it("falls back to English, then any language, as pickText does", async () => {
    locale.current = "de"
    const html = (await render({ ...blank, steps: [step({ ru: "Выберите", en: "Choose" }), step({ fr: "Recevez" })] }))!
    expect(html).toMatch(/<h3 data-role="card-title"[^>]*>Choose<\/h3>/)
    expect(html).toMatch(/<h3 data-role="card-title"[^>]*>Recevez<\/h3>/)
  })

  it("draws the sample as an ordered list in its section shell: header, numbers, titles, texts and one button", async () => {
    const sample = steps.fixtures!.sample as StepsProps
    const html = (await render(sample))!
    expect(html).toMatch(/^<section data-block="columns\/steps" class="py-\[calc\(var\(--layer-section-gap,3rem\)\/2\)\]">/)
    expect(html).toContain('data-role="section-header"')
    expect(html).toMatch(/<h2 data-role="heading"[^>]*>Как сделать заказ<\/h2>/)
    expect(count(html, "<ol")).toBe(1)
    expect(count(html, 'data-role="step"')).toBe(4)
    expect(count(html, "<li ")).toBe(4)
    expect(numbers(html)).toEqual([1, 2, 3, 4])
    expect(html).toMatch(/<h3 data-role="card-title"[^>]*>Выберите товар<\/h3>/)
    expect(html).toMatch(/<h3 data-role="card-title"[^>]*>Получите заказ<\/h3>/)
    expect(count(html, 'data-role="description"')).toBe(5)
    // One section scale: the step's text is the header's description.
    expect(count(html, `<p data-role="description" class="${SECTION_TYPE.description}">`)).toBe(5)
    expect(html).toContain("text-xl font-semibold tracking-[-0.02em] text-ui-fg-base small:text-2xl")
    expect(html).not.toContain('data-role="icon"')
    expect(count(html, 'data-role="cta-primary"')).toBe(1)
    expect(html).toMatch(/<a href="\/ru\/store" data-role="cta-primary"[^>]*>Перейти в каталог<\/a>/)
  })

  it("puts the steps in a row from 1024px, joined by a line that stops at the last step", async () => {
    const html = (await render(steps.fixtures!.sample as StepsProps))!
    expect(html).toMatch(/<ol class="[^"]* small:grid [^"]*small:grid-cols-4[^"]*">/)
    // Three joins between four steps; the last step has none.
    expect(count(html, 'data-step-line=""')).toBe(3)
    expect(html).toContain("small:h-px")
  })

  it("draws the big number in the template's display font, hidden from a screen reader", async () => {
    const html = (await render(steps.fixtures!.sample as StepsProps))!
    expect(count(html, "font-[family-name:var(--font-display,inherit)]")).toBe(4)
    expect(count(html, 'aria-hidden="true" data-step-marker=""')).toBe(4)
    expect(html).toContain("text-4xl")
    expect(html).toContain("small:text-5xl")
  })

  it("keeps a list a list at every width, in a reading column, and puts muted steps on one panel", async () => {
    const html = (await render(LIST_SAMPLE))!
    expect(html).not.toContain("small:grid-cols-")
    expect(html).toContain("max-w-2xl")
    expect(html).not.toContain("small:h-px")
    expect(count(html, 'data-step-line=""')).toBe(2)
    expect(count(html, "bg-[var(--muted)]")).toBe(1)
    expect(html).toContain("rounded-[var(--radius)]")
    expect(html).not.toContain('data-role="cta-primary"')
  })

  it("draws a step's icon before its title, and no hex or colour function anywhere", async () => {
    const html = (await render(LIST_SAMPLE))!
    expect(count(html, 'data-role="icon"')).toBe(3)
    expect(count(html, "<svg")).toBe(3)
    expect(html).toMatch(/data-role="icon"[^>]*><svg[^]*?<\/svg><\/span><h3 data-role="card-title"/)
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|oklch\(/i)
  })

  it("draws an https button as a plain anchor, a target at least 44px high in the template's button layer", async () => {
    const html = (await render({
      ...blank,
      steps: [step({ ru: "Выберите" }), step({ ru: "Напишите" })],
      button: { label: { ru: "Написать" }, href: "https://example.com/chat" },
    }))!
    expect(html).toMatch(/<a href="https:\/\/example\.com\/chat" data-role="cta-primary" class="[^"]*min-h-11[^"]*">Написать<\/a>/)
    expect(html).toContain("bg-[var(--layer-button-bg,var(--primary))]")
  })
})

describe("columns/steps in the registry", () => {
  it("is a lab home block with the roles the brief names", () => {
    expect(blockById("columns/steps")).toBe(steps)
    expect(steps).toMatchObject({ category: "columns", variant: "steps", status: "lab", placement: "home" })
    expect(steps.data).toEqual(["static"])
    expect([...steps.roles].sort()).toEqual(["section-header", "step", "card-title", "description", "icon", "cta-primary"].sort())
    expect(CATEGORY_BLOCKS.columns.map((b) => b.id)).toEqual(["columns/multicolumn", "columns/steps"])
    const ids = BLOCKS.map((b) => b.id)
    expect(ids.indexOf("columns/steps")).toBe(ids.indexOf("columns/multicolumn") + 1)
  })

  it("may stand in a template, and a template's bad props are refused with their path", () => {
    const manifest = structuredClone(getTemplate("long-morning")!.manifest)
    manifest.sections.splice(1, 0, { block: "columns/steps", props: steps.fixtures!.sample })
    const result = validateTemplate(manifest, blockById)
    expect(result.ok ? [] : result.errors).toEqual([])

    manifest.sections[1] = { block: "columns/steps", props: { steps: [{ title: { ru: "Выберите" } }], layout: "grid" } }
    const refused = validateTemplate(manifest, blockById)
    expect(refused.ok ? [] : refused.errors.map((e) => e.message)).toEqual([
      "steps has 1 items, at least 2",
      "layout must be one of: row, list",
    ])
  })
})
