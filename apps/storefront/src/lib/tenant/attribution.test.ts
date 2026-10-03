import { describe, expect, it } from "vitest"

import {
  ATTRIBUTION_FALLBACK,
  ATTRIBUTION_HIDDEN_HEADER,
  attributionFromHeader,
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

describe("attributionFromHeader", () => {
  it("shows nothing for a shop switched off (Ivan 04.10: no upready credit on a client's site)", () => {
    expect(attributionFromHeader(ATTRIBUTION_HIDDEN_HEADER)).toBeNull()
  })

  it("shows the shop's own line, and the platform's when there is no usable header", () => {
    expect(attributionFromHeader(JSON.stringify(LINE))).toEqual(LINE)
    expect(attributionFromHeader(null)).toEqual(ATTRIBUTION_FALLBACK)
    expect(attributionFromHeader("{not json")).toEqual(ATTRIBUTION_FALLBACK)
  })
})
