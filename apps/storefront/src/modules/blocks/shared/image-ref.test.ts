import { describe, expect, it } from "vitest"

import { parseImageRef } from "./image-ref"

const errorsOf = (result: { ok: boolean; errors?: string[] }) => (result.ok ? [] : (result.errors ?? []))

describe("parseImageRef", () => {
  it("takes a product picture, index 0 by default", () => {
    expect(parseImageRef({ product: "chainik-1-7l" }, "image")).toEqual({
      ok: true,
      value: { product: "chainik-1-7l", index: 0, alt: {} },
    })
    expect(parseImageRef({ product: "чайник", index: 2, alt: { ru: "Чайник" } }, "image")).toEqual({
      ok: true,
      value: { product: "чайник", index: 2, alt: { ru: "Чайник" } },
    })
  })

  it("takes a category picture, nested handles included", () => {
    expect(parseImageRef({ category: "kitchen/kettles" }, "image")).toEqual({
      ok: true,
      value: { category: "kitchen/kettles", alt: {} },
    })
  })

  it("takes a file committed under public/templates/<template-id>/", () => {
    expect(parseImageRef({ src: "/templates/long-morning/hero-1.webp", alt: { en: "A kitchen" } }, "image")).toEqual({
      ok: true,
      value: { src: "/templates/long-morning/hero-1.webp", alt: { en: "A kitchen" } },
    })
  })

  it("refuses an address outside public/templates, a path out of it, and other file types", () => {
    for (const src of [
      "https://images.unsplash.com/photo.jpg",
      "/templates/../secrets.png",
      "/templates/long-morning/../../x.png",
      "/images/hero.webp",
      "/templates/Long_Morning/hero.webp",
      "/templates/long-morning/hero.svg",
    ]) {
      expect(errorsOf(parseImageRef({ src }, "image")), src).toEqual([
        "image.src must be /templates/<template-id>/<file>.(avif|webp|jpg|png)",
      ])
    }
  })

  it("takes exactly one source", () => {
    expect(errorsOf(parseImageRef({ product: "a", src: "/templates/a/b.png" }, "image"))).toEqual([
      "image must name exactly one of: product, category, src",
    ])
    expect(errorsOf(parseImageRef({ alt: { ru: "?" } }, "image"))).toEqual([
      "image must name exactly one of: product, category, src",
    ])
    expect(errorsOf(parseImageRef("hero.png", "items[0].image"))).toEqual([
      "items[0].image must name exactly one of: product, category, src",
    ])
  })

  it("refuses a bad handle, an index out of range, an index without a product, a long alt", () => {
    expect(errorsOf(parseImageRef({ product: "a b?" }, "image"))).toEqual([
      "image.product must be a handle of the shop (letters, digits, - and _)",
    ])
    expect(errorsOf(parseImageRef({ product: "a", index: 20 }, "image"))).toEqual([
      "image.index must be a whole number from 0 to 19",
    ])
    expect(errorsOf(parseImageRef({ category: "a", index: 1 }, "image"))).toEqual(["image.index: not a field of image"])
    expect(errorsOf(parseImageRef({ category: "a", alt: { ru: "x".repeat(201) } }, "image"))).toEqual([
      "image.alt.ru is 201 characters, at most 200",
    ])
  })

  it("is required unless optional", () => {
    expect(errorsOf(parseImageRef(undefined, "image"))).toEqual(["image is required"])
    expect(parseImageRef(undefined, "image", { optional: true })).toEqual({ ok: true, value: null })
  })
})
