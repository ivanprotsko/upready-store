import { describe, expect, it } from "vitest"

import {
  formatFileSize,
  lessonFileHrefs,
  parseLessonBody,
  type LessonBlock,
  type LessonInline,
} from "./lesson-body"

const FILES = "https://api.cherkashino.ru/static/tenants/ten_01/courses/ochishchenie-pecheni"

/** Everything a reader would see on the page, addresses excluded. */
const visibleText = (blocks: LessonBlock[]): string => {
  const inline = (nodes: LessonInline[]) =>
    nodes
      .map((node) => {
        switch (node.type) {
          case "break":
            return "\n"
          case "file":
            return node.name ?? node.label ?? ""
          case "page":
            return node.label ?? node.host
          case "link":
            return node.value
          default:
            return "value" in node ? node.value : ""
        }
      })
      .join("")
  return blocks
    .map((block) => {
      if (block.type === "list") return block.items.map(inline).join("\n")
      if (block.type === "quote") return block.lines.map(inline).join("\n")
      return inline(block.content)
    })
    .join("\n\n")
}

describe("parseLessonBody", () => {
  it("names the files of lesson 9 by the words in front of them, never by their address", () => {
    const body = [
      "Меню можно распечатать или сделать скрин экрана на телефон и держать при себе.",
      "",
      `Файл «Меню курса «Очищение печени»»: ${FILES}/menu.pdf`,
      "",
      `Файл «Рецепты»: ${FILES}/recipes.pdf`,
    ].join("\n")

    const blocks = parseLessonBody(body)

    expect(blocks).toEqual([
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            value: "Меню можно распечатать или сделать скрин экрана на телефон и держать при себе.",
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "file",
            href: `${FILES}/menu.pdf`,
            ext: "PDF",
            name: "«Меню курса «Очищение печени»»",
            label: null,
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "file", href: `${FILES}/recipes.pdf`, ext: "PDF", name: "«Рецепты»", label: null },
        ],
      },
    ])
    expect(visibleText(blocks)).not.toMatch(/https?:\/\/|\/static\//)
  })

  it("reads lesson 11: a bold line is a heading, `- [ ]` is a plain list, numbered items with blank lines are one list", () => {
    const body = [
      "6 ключей к здоровой жизни без лекарств.",
      "",
      "**6 ключей к естественному оздоровлению**",
      "",
      "- [ ] Питание",
      "- [ ] Очищение",
      "- [x] Дыхание",
      "",
      "Давайте напомню, что же это за ключи:",
      "",
      "1. Питание. Мы составили для вас меню на 12 дней.",
      "",
      "2. Очищение. Ребята, все эти дни мы помогаем организму очищаться.",
      "",
      "3. Дыхание. Действительно заслуживает внимания.",
    ].join("\n")

    const blocks = parseLessonBody(body)

    expect(blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "heading",
      "list",
      "paragraph",
      "list",
    ])
    expect(blocks[1]).toEqual({
      type: "heading",
      level: 4,
      content: [{ type: "text", value: "6 ключей к естественному оздоровлению" }],
    })
    expect(blocks[2]).toEqual({
      type: "list",
      ordered: false,
      start: 1,
      items: [
        [{ type: "text", value: "Питание" }],
        [{ type: "text", value: "Очищение" }],
        [{ type: "text", value: "Дыхание" }],
      ],
    })
    expect(blocks[4]).toMatchObject({ type: "list", ordered: true, start: 1 })
    expect((blocks[4] as { items: unknown[] }).items).toHaveLength(3)
    expect(visibleText(blocks)).not.toMatch(/\*\*|\[ \]|\[x\]|^#/m)
  })

  it("turns «—» and «•» lines into one list even with blank lines between them (lessons 12 and 1)", () => {
    const dashes = parseLessonBody(
      [
        "В этом уроке мы разберём:",
        "",
        "— каким образом дыхательные практики влияют на иммунитет;",
        "",
        "— в чём польза гимнастики Стрельниковой;",
        "",
        "– какой комплекс упражнений выполнять каждый день.",
        "",
        "",
        "",
        "В этом уроке предлагаю вам ознакомиться с практикой дыхания.",
      ].join("\n")
    )
    expect(dashes.map((block) => block.type)).toEqual(["paragraph", "list", "paragraph"])
    expect((dashes[1] as { items: unknown[] }).items).toHaveLength(3)

    const bullets = parseLessonBody("• Первое.\n\n• Второе.")
    expect(bullets).toEqual([
      {
        type: "list",
        ordered: false,
        start: 1,
        items: [[{ type: "text", value: "Первое." }], [{ type: "text", value: "Второе." }]],
      },
    ])
  })

  it("keeps a numbered list's own first number", () => {
    const [list] = parseLessonBody("3) Третий\n4) Четвёртый")
    expect(list).toMatchObject({ type: "list", ordered: true, start: 3 })
  })

  it("does not read a year at the start of a sentence as a list item", () => {
    const [block] = parseLessonBody("2026. Год, когда всё началось.")
    expect(block.type).toBe("paragraph")
  })

  it("continues a list item with the line right under it", () => {
    const [list] = parseLessonBody("1. Питание.\nМы составили для вас меню.\n2. Очищение.")
    expect(list).toEqual({
      type: "list",
      ordered: true,
      start: 1,
      items: [
        [
          { type: "text", value: "Питание." },
          { type: "break" },
          { type: "text", value: "Мы составили для вас меню." },
        ],
        [{ type: "text", value: "Очищение." }],
      ],
    })
  })

  it("collapses many blank lines into one break and keeps a single newline as a line break", () => {
    const blocks = parseLessonBody("Первая строка\nвторая строка\n\n\n\nНовый абзац")
    expect(blocks).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", value: "Первая строка" },
          { type: "break" },
          { type: "text", value: "вторая строка" },
        ],
      },
      { type: "paragraph", content: [{ type: "text", value: "Новый абзац" }] },
    ])
  })

  it("reads `#` headings one level under the lesson's own title and leaves no `#`", () => {
    const blocks = parseLessonBody("# Раздел\n## Подраздел\n#### Глубже")
    expect(blocks.map((block) => (block.type === "heading" ? block.level : null))).toEqual([
      2, 3, 4,
    ])
    expect(visibleText(blocks)).toBe("Раздел\n\nПодраздел\n\nГлубже")
  })

  it("reads a `>` note as a quote without its empty lines (lesson 2)", () => {
    const blocks = parseLessonBody(
      "> **Будьте в курсе важных новостей**\n>\n> Приглашаем вас в канал.\n\nКак скачать Telegram"
    )
    expect(blocks).toEqual([
      {
        type: "quote",
        lines: [
          [{ type: "strong", value: "Будьте в курсе важных новостей" }],
          [{ type: "text", value: "Приглашаем вас в канал." }],
        ],
      },
      { type: "paragraph", content: [{ type: "text", value: "Как скачать Telegram" }] },
    ])
  })

  it("keeps a `[label](url)` link with its label", () => {
    const [block] = parseLessonBody("Смотрите [эфир с Оксаной](https://t.me/cherkashino/12).")
    expect(block).toEqual({
      type: "paragraph",
      content: [
        { type: "text", value: "Смотрите " },
        { type: "link", value: "эфир с Оксаной", href: "https://t.me/cherkashino/12" },
        { type: "text", value: "." },
      ],
    })
  })

  it("names a page by the words in front of it and keeps the punctuation after it as text", () => {
    const [block] = parseLessonBody(
      "Видео готово. Подробнее на сайте https://www.cherkashino.ru/ru/blog/liver."
    )
    expect(block).toEqual({
      type: "paragraph",
      content: [
        { type: "text", value: "Видео готово. " },
        {
          type: "page",
          href: "https://www.cherkashino.ru/ru/blog/liver",
          host: "cherkashino.ru",
          label: "Подробнее на сайте",
        },
        { type: "text", value: "." },
      ],
    })
  })

  it("leaves a bare page or file with nothing in front of it to the renderer's own words", () => {
    const blocks = parseLessonBody(`https://t.me/cherkashino\n\n${FILES}/tracker.xlsx`)
    expect(blocks).toEqual([
      {
        type: "paragraph",
        content: [{ type: "page", href: "https://t.me/cherkashino", host: "t.me", label: null }],
      },
      {
        type: "paragraph",
        content: [
          { type: "file", href: `${FILES}/tracker.xlsx`, ext: "XLSX", name: null, label: null },
        ],
      },
    ])
  })

  it("keeps the owner's own words for a file that is not introduced as «Файл …»", () => {
    const [block] = parseLessonBody(`Скачайте меню: ${FILES}/menu.pdf`)
    expect(block).toMatchObject({
      content: [{ type: "file", ext: "PDF", name: null, label: "Скачайте меню" }],
    })
  })

  it("takes the name from the line above when the address stands alone under it", () => {
    const [block] = parseLessonBody(`Файл «Трекер полезных привычек»:\n${FILES}/tracker.pdf`)
    expect(block).toEqual({
      type: "paragraph",
      content: [
        {
          type: "file",
          href: `${FILES}/tracker.pdf`,
          ext: "PDF",
          name: "«Трекер полезных привычек»",
          label: null,
        },
      ],
    })
  })

  it("names an address by a bold run right in front of it", () => {
    const [block] = parseLessonBody(`**Меню:** ${FILES}/menu.pdf`)
    expect(block).toMatchObject({ content: [{ type: "file", label: "Меню" }] })
  })

  it("resolves a bare `/static/…` upload path against the shop's API", () => {
    const [block] = parseLessonBody("Файл «Меню»: /static/tenants/ten_01/menu.pdf", {
      apiOrigin: "https://api.cherkashino.ru",
    })
    expect(block).toMatchObject({
      content: [
        {
          type: "file",
          href: "https://api.cherkashino.ru/static/tenants/ten_01/menu.pdf",
          name: "«Меню»",
        },
      ],
    })
  })

  it("drops a stray `**` with no partner", () => {
    const blocks = parseLessonBody("**Важно: пейте воду")
    expect(visibleText(blocks)).toBe("Важно: пейте воду")
  })

  it("never makes a `javascript:` link, the words stay", () => {
    const blocks = parseLessonBody("[нажми](javascript:alert(1))")
    expect(JSON.stringify(blocks)).not.toContain("javascript:")
  })

  it("is no blocks for an empty lesson", () => {
    expect(parseLessonBody("")).toEqual([])
    expect(parseLessonBody(null)).toEqual([])
    expect(parseLessonBody("\n\n  \n")).toEqual([])
  })
})

describe("lessonFileHrefs", () => {
  it("lists every file once, wherever it stands", () => {
    const blocks = parseLessonBody(
      `Файл «Меню»: ${FILES}/menu.pdf\n\n- Рецепты: ${FILES}/recipes.pdf\n\n> ${FILES}/menu.pdf\n\nhttps://t.me/cherkashino`
    )
    expect(lessonFileHrefs(blocks)).toEqual([`${FILES}/menu.pdf`, `${FILES}/recipes.pdf`])
  })
})

describe("formatFileSize", () => {
  it("writes megabytes with one decimal in the shop's language", () => {
    expect(formatFileSize(1.2 * 1024 * 1024, "ru")).toBe("1,2 МБ")
    expect(formatFileSize(1.2 * 1024 * 1024, "en")).toBe("1.2 MB")
  })

  it("writes a smaller file in whole kilobytes", () => {
    expect(formatFileSize(340 * 1024, "en")).toBe("340 kB")
  })

  it("is null for an unknown or empty size, never zero", () => {
    expect(formatFileSize(null, "ru")).toBeNull()
    expect(formatFileSize(0, "ru")).toBeNull()
    expect(formatFileSize(Number.NaN, "ru")).toBeNull()
  })
})
