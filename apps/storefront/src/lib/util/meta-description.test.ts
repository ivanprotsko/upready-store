import { describe, expect, it } from "vitest"

import { metaDescription } from "./meta-description"

describe("metaDescription", () => {
  it("strips HTML tags and collapses whitespace", () => {
    expect(metaDescription("<p>Привет   мир</p>")).toBe("Привет мир")
  })

  // b09-storefront-render, accept-t12-legal-requisites-3 nit 1: the backend
  // wraps an unfilled `{{ТОКЕН}}` in backticks so the body's markdown reader
  // shows it as a code span (tenant-legal/requisites.ts). A <meta> tag has no
  // markdown reader behind it, so the backtick must not reach it literally.
  it("strips backticks left over from an unfilled requisites token", () => {
    expect(metaDescription("адрес `{{ЮР_АДРЕС}}`, возврат СДЭК")).toBe(
      "адрес {{ЮР_АДРЕС}}, возврат СДЭК"
    )
  })

  it("falls through to the next candidate when the first is empty", () => {
    expect(metaDescription(null, "запасной текст")).toBe("запасной текст")
  })

  it("clips a long candidate at the word boundary under the limit and adds an ellipsis", () => {
    const long = "слово ".repeat(40).trim()
    const result = metaDescription(long)
    expect(result).toBeDefined()
    expect(result!.length).toBeLessThanOrEqual(160)
    expect(result!.endsWith("…")).toBe(true)
  })

  it("returns undefined when every candidate is empty", () => {
    expect(metaDescription(null, undefined, "   ")).toBeUndefined()
  })
})
