import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  hasPair,
  isMainImage,
  metadataImage,
  metadataImageAlt,
  metadataImageDark,
  productImageDark,
  productMainImage,
} from "./mode-image"

describe("mode-image · the pair convention", () => {
  it("reads the three metadata keys and treats blank as absent", () => {
    const meta = {
      image_url: " /light.webp ",
      image_url_dark: "/dark.webp",
      image_alt: "Boots on a pale ground",
    }
    expect(metadataImage(meta)).toBe("/light.webp")
    expect(metadataImageDark(meta)).toBe("/dark.webp")
    expect(metadataImageAlt(meta)).toBe("Boots on a pale ground")

    // A blank string is what a form leaves behind when the owner clears the field. It must
    // read as "no image" and never reach an <img> as a src.
    expect(metadataImage({ image_url: "   " })).toBeNull()
    expect(metadataImageDark({ image_url_dark: "" })).toBeNull()
    expect(metadataImageAlt({})).toBe("")
    expect(metadataImage(null)).toBeNull()
    expect(metadataImageDark(undefined)).toBeNull()
  })

  it("takes the product's main image from the thumbnail, then the first gallery frame", () => {
    expect(
      productMainImage({ thumbnail: "/thumb.webp", images: [{ url: "/first.webp" }] })
    ).toBe("/thumb.webp")
    expect(productMainImage({ thumbnail: null, images: [{ url: "/first.webp" }] })).toBe(
      "/first.webp"
    )
    expect(productMainImage({ thumbnail: null, images: [] })).toBeNull()
    expect(productMainImage({})).toBeNull()
  })

  it("reads the product's dark version off metadata, not off images[]", () => {
    // The twin never joins `images[]`: the storefront draws every entry of that list as its
    // own gallery slide (`specs/store-profiles/MODE-IMAGE-PAIRS.md` §5).
    expect(productImageDark({ metadata: { image_url_dark: "/dark.webp" } })).toBe(
      "/dark.webp"
    )
    expect(productImageDark({ metadata: {} })).toBeNull()
    expect(productImageDark({})).toBeNull()
  })

  it("calls a pair real only when the dark version exists and differs", () => {
    expect(hasPair("/light.webp", "/dark.webp")).toBe(true)
    expect(hasPair("/light.webp", null)).toBe(false)
    expect(hasPair("/light.webp", "")).toBe(false)
    expect(hasPair("/light.webp", undefined)).toBe(false)
    // Same address twice is not a pair: it would put a second identical layer in the DOM
    // and cost a second request on every flip.
    expect(hasPair("/light.webp", "/light.webp")).toBe(false)
    expect(hasPair("/light.webp", " /light.webp ")).toBe(false)
    // A dark version with no base is not a pair either — there is nothing to pair with.
    expect(hasPair(null, "/dark.webp")).toBe(true)
  })

  it("finds the gallery frame the pair belongs to", () => {
    expect(isMainImage("/thumb.webp", "/thumb.webp", 3)).toBe(true)
    expect(isMainImage("/thumb.webp", "/other.webp", 0)).toBe(false)
    // No thumbnail: the first frame IS the product's image, which is what the card shows.
    expect(isMainImage(null, "/first.webp", 0)).toBe(true)
    expect(isMainImage(null, "/second.webp", 1)).toBe(false)
  })
})

describe("mode-image · the CSS contract the swap rests on", () => {
  /**
   * `ModeImage` hides the inactive layer with Tailwind's `dark:` variant, and the whole
   * mechanism is correct only because that variant is pointed at the SAME attribute the
   * mode toggle writes (`data-mode` on `<html>`, `lib/theme/attributes.ts`). Repointing it
   * at `prefers-color-scheme` or at a `.dark` class would break every paired image on the
   * storefront and break it SILENTLY — the markup stays valid, the page still renders, and
   * only the wrong picture shows. Hence a test on the config line itself.
   */
  it("points Tailwind's dark variant at [data-mode=\"dark\"]", () => {
    const config = readFileSync(join(process.cwd(), "tailwind.config.js"), "utf8")
    expect(config).toContain(`darkMode: ["selector", '[data-mode="dark"]']`)
  })
})
