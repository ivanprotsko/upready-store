import { describe, expect, it } from "vitest"

import { variantIdForUrl } from "./index"

/**
 * t-2026-09-25-18 (2.1, Ivan verbatim: «что это такое и зачем
 * "?v_id=variant_..."»): a one-variant product (the course) got the parameter
 * too, pure noise since the URL already resolves to its only variant. A
 * product with a real choice keeps it, so a shared link opens on the same
 * size or option.
 */
describe("variantIdForUrl", () => {
  it("never writes v_id for a one-variant product, even once a variant is selected", () => {
    expect(variantIdForUrl(1, "variant_01M39WW8VSE17W0S0EN4YNFHKV")).toBeNull()
  })

  it("writes nothing for a one-variant product before selection either", () => {
    expect(variantIdForUrl(1, undefined)).toBeNull()
  })

  it("writes v_id for a multi-variant product once a variant is selected", () => {
    expect(variantIdForUrl(3, "variant_01ABC")).toBe("variant_01ABC")
  })

  it("writes nothing for a multi-variant product before a variant is selected", () => {
    expect(variantIdForUrl(3, undefined)).toBeNull()
  })
})
