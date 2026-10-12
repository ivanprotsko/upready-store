import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveImageRef } from "./block-image"

const state = vi.hoisted(() => ({
  products: [] as Record<string, unknown>[],
  category: undefined as Record<string, unknown> | undefined,
  calls: [] as unknown[],
  fail: false,
}))

vi.mock("./cookies", () => ({ getCountryCode: async () => null }))
vi.mock("./products", () => ({
  listProducts: async (args: unknown) => {
    state.calls.push(args)
    if (state.fail) throw new Error("backend down")
    return { response: { products: state.products, count: state.products.length }, nextPage: null }
  },
}))
vi.mock("./categories", () => ({
  getCategoryByHandle: async (handle: string[]) => {
    state.calls.push(handle)
    return state.category
  },
}))

beforeEach(() => {
  state.products = []
  state.category = undefined
  state.calls = []
  state.fail = false
})

const kettle = {
  handle: "kettle",
  title: "Чайник",
  thumbnail: "https://cdn.test/thumb.jpg",
  images: [
    { url: "https://cdn.test/side.jpg", rank: 1 },
    { url: "https://cdn.test/front.jpg", rank: 0 },
  ],
}

describe("resolveImageRef", () => {
  it("reads a product picture by rank through listProducts, in the default region without a country", async () => {
    state.products = [kettle]
    expect(await resolveImageRef({ product: "kettle", index: 1, alt: {} }, "ru")).toEqual({
      url: "https://cdn.test/side.jpg",
      alt: "Чайник",
      width: null,
      height: null,
    })
    expect(state.calls[0]).toMatchObject({ countryCode: "ru", queryParams: { handle: "kettle", limit: 1 } })
  })

  it("prefers the template's alt in the visitor's language", async () => {
    state.products = [kettle]
    const image = await resolveImageRef({ product: "kettle", index: 0, alt: { ru: "Чайник спереди", en: "Kettle" } }, "en")
    expect(image).toMatchObject({ url: "https://cdn.test/front.jpg", alt: "Kettle" })
  })

  it("is null for a product the shop does not have, a picture it lacks, or a failed read", async () => {
    expect(await resolveImageRef({ product: "kettle", index: 0, alt: {} }, "ru")).toBeNull()
    state.products = [{ ...kettle, handle: "kettle-2" }]
    expect(await resolveImageRef({ product: "kettle", index: 0, alt: {} }, "ru")).toBeNull()
    state.products = [kettle]
    expect(await resolveImageRef({ product: "kettle", index: 5, alt: {} }, "ru")).toBeNull()
    state.fail = true
    expect(await resolveImageRef({ product: "kettle", index: 0, alt: {} }, "ru")).toBeNull()
  })

  it("falls back to the thumbnail for the first picture of a product with no gallery", async () => {
    state.products = [{ ...kettle, images: [] }]
    expect(await resolveImageRef({ product: "kettle", index: 0, alt: {} }, "ru")).toMatchObject({
      url: "https://cdn.test/thumb.jpg",
    })
  })

  it("reads a category's own picture, null without one", async () => {
    state.category = { name: "Кухня", metadata: { image_url: "https://cdn.test/kitchen.jpg", image_alt: "" } }
    expect(await resolveImageRef({ category: "kitchen", alt: {} }, "ru")).toEqual({
      url: "https://cdn.test/kitchen.jpg",
      alt: "Кухня",
      width: null,
      height: null,
    })
    state.category = { name: "Кухня", metadata: {} }
    expect(await resolveImageRef({ category: "kitchen", alt: {} }, "ru")).toBeNull()
    state.category = undefined
    expect(await resolveImageRef({ category: "kitchen", alt: {} }, "ru")).toBeNull()
  })

  it("passes a committed template file through, with an empty alt when none is given", async () => {
    expect(await resolveImageRef({ src: "/templates/long-morning/hero.webp", alt: {} }, "ru")).toEqual({
      url: "/templates/long-morning/hero.webp",
      alt: "",
      width: null,
      height: null,
    })
    expect(state.calls).toEqual([])
  })
})
