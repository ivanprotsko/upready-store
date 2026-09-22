import { describe, expect, it } from "vitest"

import { descriptionParagraphs, stripHtml } from "./strip-html"

describe("stripHtml", () => {
  it("keeps the line structure the tags carried and decodes entities", () => {
    expect(stripHtml("<p>Масло &amp; уход</p><p>Второй<br>абзац&nbsp;тут</p>")).toBe(
      "Масло & уход\nВторой\nабзац тут"
    )
  })

  it("collapses generous spacing to one blank line", () => {
    expect(stripHtml("<div>Один</div>\n\n\n\n<div>Два</div>")).toBe("Один\n\n\nДва".replace("\n\n\n", "\n\n"))
  })

  it("splits paragraphs on blank lines and drops empties", () => {
    expect(descriptionParagraphs("a\n\nb\n\n\n\nc")).toEqual(["a", "b", "c"])
  })
})
