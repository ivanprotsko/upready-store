import { describe, expect, it } from "vitest"

import { markdownText } from "./markdown-text"
import { metaDescription } from "./meta-description"

/**
 * t-2026-10-08-13, part A5. The four legal pages of a live shop had an empty `seo_description`,
 * and their description for search engines opened with the page's raw markup. The bodies below
 * repeat the shape of those four openings; the seller in them is made up.
 */
const MARKS = /[#*|`]|---|\]\(/

describe("markdownText: the description of a page is its words, not its markup", () => {
  it("contacts: a heading, a bold line and a table of requisites", () => {
    const body = [
      "## Продавец",
      "",
      "**Индивидуальный предприниматель Иванова Мария Петровна**",
      "",
      "| | |",
      "|---|---|",
      "| ИНН | 000000000001 |",
      "| Телефон | [+7 000 000-00-00](tel:+70000000000) |",
    ].join("\n")

    const text = markdownText(body)

    expect(text).toBe(
      "Продавец Индивидуальный предприниматель Иванова Мария Петровна ИНН 000000000001 Телефон +7 000 000-00-00"
    )
    expect(text).not.toMatch(MARKS)
  })

  it("offer: a numbered heading and the clause under it", () => {
    const body = [
      "## 1. Общие положения и термины",
      "",
      "1.1. Настоящая оферта — предложение продавца заключить договор купли-продажи.",
    ].join("\n")

    const text = markdownText(body)

    expect(text).toBe(
      "1. Общие положения и термины 1.1. Настоящая оферта — предложение продавца заключить договор купли-продажи."
    )
    expect(text).not.toMatch(MARKS)
  })

  it("policy: a bold date line, a rule and a heading", () => {
    const body = [
      "**Дата редакции: 08.10.2026**",
      "",
      "---",
      "",
      "## 1. Общие положения",
      "",
      "1.1. Политика описывает, какие данные собирает магазин.",
    ].join("\n")

    const text = markdownText(body)

    expect(text).toBe(
      "Дата редакции: 08.10.2026 1. Общие положения 1.1. Политика описывает, какие данные собирает магазин."
    )
    expect(text).not.toMatch(MARKS)
  })

  it("consent: a bold date line, a rule, italic inside a sentence and a list", () => {
    const body = [
      "**Дата редакции: 08.10.2026**",
      "",
      "---",
      "",
      "Я даю согласие *продавцу* на обработку данных:",
      "",
      "- имени;",
      "- телефона и адреса доставки.",
    ].join("\n")

    const text = markdownText(body)

    expect(text).toBe(
      "Дата редакции: 08.10.2026 Я даю согласие продавцу на обработку данных: имени; телефона и адреса доставки."
    )
    expect(text).not.toMatch(MARKS)
  })

  it("a picture gives no words, an empty source gives no description", () => {
    expect(markdownText("![фото пасеки](/static/tenants/a/b.jpg)\n\nТекст страницы.")).toBe(
      "Текст страницы."
    )
    expect(markdownText("")).toBeUndefined()
    expect(markdownText(null)).toBeUndefined()
    expect(markdownText("---")).toBeUndefined()
  })
})

describe("a page's description: `seo_description` first, the body's words second", () => {
  const body = "## Продавец\n\n**Индивидуальный предприниматель**\n\n| | |\n|---|---|\n| ИНН | 000000000001 |"

  it("a filled seo_description is used as the owner wrote it", () => {
    expect(metaDescription("Контакты магазина: телефон и адрес", markdownText(body))).toBe(
      "Контакты магазина: телефон и адрес"
    )
  })

  it("an empty seo_description falls to the body's words, cut at a word boundary", () => {
    const long = `## Оферта\n\n${"**слово** ".repeat(60).trim()}`

    const description = metaDescription(null, markdownText(long))

    expect(description).toBeDefined()
    expect(description!.startsWith("Оферта слово слово")).toBe(true)
    expect(description!.length).toBeLessThanOrEqual(160)
    expect(description!.endsWith("слово…")).toBe(true)
    expect(description).not.toMatch(MARKS)
    expect(metaDescription("", markdownText(body))).toBe(
      "Продавец Индивидуальный предприниматель ИНН 000000000001"
    )
  })
})
