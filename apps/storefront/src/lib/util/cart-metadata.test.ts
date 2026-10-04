import { describe, expect, it } from "vitest"

import { mergeCartMetadata } from "./cart-metadata"

describe("mergeCartMetadata (t-2026-10-04-48)", () => {
  const stored = {
    contact_first_name: "Иван",
    contact_last_name: "Тестов",
    contact_phone: "+70000000000",
    has_different_recipient: "true",
  }

  it("keeps every stored contact_* key under a consent patch", () => {
    expect(mergeCartMetadata(stored, { checkout_consent: { given: true } })).toEqual({
      ...stored,
      checkout_consent: { given: true },
    })
  })

  it("replaces only the keys the patch names", () => {
    expect(mergeCartMetadata(stored, { contact_phone: "+71111111111" })).toEqual({
      ...stored,
      contact_phone: "+71111111111",
    })
  })

  it("leaves a stored key alone when the patch has it undefined", () => {
    expect(mergeCartMetadata(stored, { contact_phone: undefined })).toEqual(stored)
  })

  it("starts from nothing when the cart has no metadata yet", () => {
    expect(mergeCartMetadata(null, { a: 1 })).toEqual({ a: 1 })
    expect(mergeCartMetadata(undefined, { a: 1 })).toEqual({ a: 1 })
  })

  it("does not mutate the stored object", () => {
    const before = { ...stored }
    mergeCartMetadata(stored, { contact_phone: "x" })
    expect(stored).toEqual(before)
  })
})
