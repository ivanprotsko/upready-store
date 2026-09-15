import { describe, expect, it } from "vitest"

import { parseMarkdown } from "./markdown"

/**
 * t10-blog: the journal's articles are markdown written outside this
 * storefront, so the reader has to survive the shapes they actually use. The
 * fixture below is the opening of one real article of the shop this feature
 * was built for (`detoks-i-kortizol`, ru), trimmed: a quoted summary box with
 * bullets inside it, a thematic break, then a section heading.
 */
const ARTICLE_OPENING = [
  "> **Кратко**",
  "> - Кортизол блокирует пути детоксикации.",
  "> - Сначала стресс, потом протокол.",
  "",
  "---",
  "",
  "## Почему детокс «не заходит»",
  "",
  "Вы уже в третий раз пробуете курс очищения.",
].join("\n")

describe("parseMarkdown", () => {
  it("reads a quoted summary box as one quote block, one line per point", () => {
    const [quote] = parseMarkdown(ARTICLE_OPENING)

    expect(quote.type).toBe("quote")
    expect(quote.type === "quote" && quote.content).toHaveLength(3)
    // The `- ` of a quoted bullet is markup, not text: it must not reach the page.
    expect(quote.type === "quote" && quote.content[1][0].value).toBe(
      "Кортизол блокирует пути детоксикации."
    )
    // `**Кратко**` inside the quote is still bold.
    expect(quote.type === "quote" && quote.content[0][0].type).toBe("strong")
  })

  it("reads `---` as a rule rather than a paragraph or a bullet", () => {
    const blocks = parseMarkdown(ARTICLE_OPENING)

    expect(blocks.map((block) => block.type)).toEqual([
      "quote",
      "rule",
      "heading",
      "paragraph",
    ])
  })

  it("keeps ***, ___ and long runs as rules too", () => {
    expect(parseMarkdown("***").map((b) => b.type)).toEqual(["rule"])
    expect(parseMarkdown("___").map((b) => b.type)).toEqual(["rule"])
    expect(parseMarkdown("------").map((b) => b.type)).toEqual(["rule"])
  })

  it("clamps a heading deeper than ### instead of dropping it", () => {
    const [block] = parseMarkdown("#### Дозировки")

    expect(block.type).toBe("heading")
    expect(block.type === "heading" && block.level).toBe(3)
    expect(block.type === "heading" && block.content[0].value).toBe("Дозировки")
  })

  it("still reads what a content page uses", () => {
    const blocks = parseMarkdown(
      ["# Доставка", "", "- СДЭК", "- Почта России", "", "Пишите на [почту](mailto:a@b.c)."].join(
        "\n"
      )
    )

    expect(blocks.map((block) => block.type)).toEqual(["heading", "list", "paragraph"])
    expect(blocks[1].type === "list" && blocks[1].items).toHaveLength(2)
  })

  it("does not let a blockquote swallow the paragraph after it", () => {
    const blocks = parseMarkdown(["> цитата", "обычный текст"].join("\n"))

    expect(blocks.map((block) => block.type)).toEqual(["quote", "paragraph"])
  })

  // f07-page-markdown-tables: a legal page (contact.ru.md) table, verbatim.
  it("reads a GFM table as a table block, not a raw-text paragraph", () => {
    const blocks = parseMarkdown(
      [
        "| | |",
        "|---|---|",
        "| ОГРНИП | {{ОГРНИП}} |",
        "| Адрес регистрации | {{ЮР_АДРЕС}} |",
      ].join("\n")
    )

    expect(blocks.map((block) => block.type)).toEqual(["table"])
    const [table] = blocks
    if (table.type !== "table") throw new Error("expected a table block")
    expect(table.header).toHaveLength(2)
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0][0][0].value).toBe("ОГРНИП")
    expect(table.rows[1][1][0].value).toBe("{{ЮР_АДРЕС}}")
  })

  it("keeps a table apart from the paragraph and heading around it", () => {
    const blocks = parseMarkdown(
      ["## Контакты", "", "| Способ | Данные |", "|---|---|", "| Email | a@b.c |", "", "Пишите нам."].join(
        "\n"
      )
    )

    expect(blocks.map((block) => block.type)).toEqual(["heading", "table", "paragraph"])
  })

  it("does not read a plain line with one `|` as a table without a separator row", () => {
    const blocks = parseMarkdown("цена | 500 ₽")

    expect(blocks.map((block) => block.type)).toEqual(["paragraph"])
  })

  it("does not italicise a token whose underscore has no matching word-boundary pair nearby", () => {
    const blocks = parseMarkdown(
      "Почтовый адрес: {{ЮР_АДРЕС}} (для ИП {{ФИО_ИП}})"
    )

    expect(blocks).toHaveLength(1)
    const [block] = blocks
    if (block.type !== "paragraph") throw new Error("expected a paragraph block")
    expect(block.content).toEqual([
      { type: "text", value: "Почтовый адрес: {{ЮР_АДРЕС}} (для ИП {{ФИО_ИП}})" },
    ])
  })

  it("still reads a real underscore emphasis at a word boundary", () => {
    const [block] = parseMarkdown("это _выделенное_ слово")

    if (block.type !== "paragraph") throw new Error("expected a paragraph block")
    expect(block.content).toEqual([
      { type: "text", value: "это " },
      { type: "em", value: "выделенное" },
      { type: "text", value: " слово" },
    ])
  })
})
