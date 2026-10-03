import { describe, expect, it } from "vitest"

import { backendImagePattern } from "./next-image-hosts"

/**
 * next/image refuses (400) every host missing in `images.remotePatterns`, so the
 * instance's own API host has to come from the build arg, not from a hand-kept
 * list — cherkashino.ru lost every product picture on 04.10.2026 because
 * api.cherkashino.ru was in no list. These pin what the build arg turns into.
 */
describe("backendImagePattern", () => {
  it("allows the backend's own https host", () => {
    expect(backendImagePattern("https://api.cherkashino.ru")).toEqual([
      { protocol: "https", hostname: "api.cherkashino.ru" },
    ])
  })

  it("keeps the protocol of a plain-http local backend", () => {
    expect(backendImagePattern("http://localhost:9000")).toEqual([
      { protocol: "http", hostname: "localhost" },
    ])
  })

  it("ignores a path, port and trailing slash — only the origin matters to next/image", () => {
    expect(backendImagePattern("https://api.olavka.ru:8443/some/path/")).toEqual([
      { protocol: "https", hostname: "api.olavka.ru" },
    ])
  })

  it("adds nothing when the build arg is unset, empty or malformed", () => {
    expect(backendImagePattern(undefined)).toEqual([])
    expect(backendImagePattern("")).toEqual([])
    expect(backendImagePattern("not a url")).toEqual([])
    expect(backendImagePattern("ftp://files.example.com")).toEqual([])
  })
})
