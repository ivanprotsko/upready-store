import { describe, expect, it } from "vitest"

import {
  ATTRIBUTION_FALLBACK,
  parseAttributionHeader,
  readAttribution,
} from "./attribution"

const LINE = {
  anchor: "интернет-магазин под ключ",
  href: "https://upready.dev",
  brand: "upready",
  rel: "noopener",
}

describe("readAttribution", () => {
  it("takes a complete line as the shop's own", () => {
    expect(readAttribution(LINE)).toEqual(LINE)
  })

  it("defaults rel alone, because an empty rel is a valid link", () => {
    expect(readAttribution({ ...LINE, rel: "" })?.rel).toBe(
      ATTRIBUTION_FALLBACK.rel
    )
  })

  it("refuses a half-written line, so the caller falls back instead of rendering «— upready»", () => {
    expect(readAttribution({ ...LINE, anchor: "" })).toBeNull()
    expect(readAttribution({ ...LINE, href: "" })).toBeNull()
    expect(readAttribution(null)).toBeNull()
  })
})

describe("parseAttributionHeader", () => {
  it("reads the header the middleware wrote", () => {
    expect(parseAttributionHeader(JSON.stringify(LINE))).toEqual(LINE)
  })

  it("treats an unparsable header as no header at all", () => {
    expect(parseAttributionHeader("{not json")).toBeNull()
    expect(parseAttributionHeader(null)).toBeNull()
  })
})
