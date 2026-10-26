import { describe, expect, it } from "vitest"

import { parseMarkdown } from "@lib/util/markdown"
import { buildToc, headingAnchors, slugifyHeading } from "@lib/util/markdown-toc"

/**
 * t-2026-10-05-03. The table of contents of a journal article and the anchors of its
 * headings come from one block list, so a TOC entry always lands on a heading.
 */

describe("slugifyHeading", () => {
  it("keeps Cyrillic and joins words with one hyphen", () => {
    expect(slugifyHeading("Что делает кортизол?")).toBe("что-делает-кортизол")
  })

  it("trims stray separators and folds case", () => {
    expect(slugifyHeading("  — Detox & Cortisol: 101 — ")).toBe("detox-cortisol-101")
  })

  it("falls back to `section` for a heading with no letter or digit", () => {
    expect(slugifyHeading("— · —")).toBe("section")
  })
})

describe("buildToc", () => {
  const body = [
    "> **Кратко**",
    "> - первое",
    "",
    "# Вступление",
    "",
    "Текст.",
    "",
    "## Почему *детокс* не заходит",
    "",
    "### Шаг первый",
    "",
    "## Почему детокс не заходит",
  ].join("\n")
  const blocks = parseMarkdown(body)

  it("lists the section headings in order, `###` as sub-entries", () => {
    expect(buildToc(blocks)).toEqual([
      { id: "вступление", title: "Вступление", level: 2 },
      { id: "почему-детокс-не-заходит", title: "Почему детокс не заходит", level: 2 },
      { id: "шаг-первый", title: "Шаг первый", level: 3 },
      { id: "почему-детокс-не-заходит-2", title: "Почему детокс не заходит", level: 2 },
    ])
  })

  it("gives the anchors by block index, null for anything but a heading", () => {
    const anchors = headingAnchors(blocks)
    expect(anchors.length).toBe(blocks.length)
    blocks.forEach((block, index) => {
      expect(anchors[index] === null).toBe(block.type !== "heading")
    })
  })

  it("is empty for a body without headings (state article-no-toc)", () => {
    expect(buildToc(parseMarkdown("Один абзац.\n\nИ второй."))).toEqual([])
  })
})
