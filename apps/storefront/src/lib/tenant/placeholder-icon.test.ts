import { describe, expect, it } from "vitest"

import { placeholderIconLetter, placeholderIconSvg } from "./placeholder-icon"

describe("placeholderIconLetter", () => {
  it("takes the first letter or digit of the shop's name, upper-cased", () => {
    expect(placeholderIconLetter("Черкашино")).toBe("Ч")
    expect(placeholderIconLetter("olavka")).toBe("O")
    expect(placeholderIconLetter(" «Лавка» 7")).toBe("Л")
    expect(placeholderIconLetter("7 days")).toBe("7")
    expect(placeholderIconLetter("東京ストア")).toBe("東")
    expect(placeholderIconLetter("<b>&")).toBe("B")
    expect(placeholderIconLetter("—")).toBe("")
    expect(placeholderIconLetter(null)).toBe("")
  })
})

describe("placeholderIconSvg", () => {
  // The panel's tab carries the same drawing (`apps/tenant-panel/src/lib/shop-favicon.ts`); its
  // own test pins the same string, so the two cannot drift apart.
  it("is one fixed drawing: the shop's letter on its primary colour", () => {
    expect(placeholderIconSvg({ name: "Черкашино", color: "#2f6b3a", ink: "#ffffff" })).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="#2f6b3a"/><text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif" font-size="38" font-weight="700" fill="#ffffff">Ч</text></svg>`
    )
  })

  it("falls back to near-black with white text without a primary colour", () => {
    expect(placeholderIconSvg({ name: "Лавка" })).toMatch(/fill="#18181B"\/><text [^>]*fill="#ffffff">Л<\/text>/)
  })

  it("keeps the backend's dark text on a light primary colour", () => {
    expect(placeholderIconSvg({ name: "olavka", color: "#f5e6a8", ink: "#000000" })).toMatch(
      /fill="#f5e6a8"\/><text [^>]*fill="#000000">O<\/text>/
    )
  })

  it("ignores a colour that is not a six-digit hex, and its text colour with it", () => {
    const svg = placeholderIconSvg({ name: "Лавка", color: 'red"/><script>', ink: "#000000" })

    expect(svg).toMatch(/fill="#18181B"\/><text [^>]*fill="#ffffff">Л<\/text>/)
    expect(svg).not.toContain("script")
  })

  it("draws a storefront mark for a name with no letter", () => {
    expect(placeholderIconSvg({ name: "—" })).toBe(placeholderIconSvg())
    expect(placeholderIconSvg()).toMatch(/<path fill-rule="evenodd" d="[^"]+" fill="#ffffff"\/><\/svg>$/)
  })

  it("draws different icons for two shops with nothing uploaded", () => {
    expect(placeholderIconSvg({ name: "Черкашино" })).not.toBe(placeholderIconSvg({ name: "Olavka" }))
  })
})
