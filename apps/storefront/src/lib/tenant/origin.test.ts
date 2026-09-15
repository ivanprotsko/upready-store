import { describe, expect, it } from "vitest"

import {
  originForHost,
  publicHost,
  requestOrigin,
  requestPort,
} from "./origin"

describe("requestOrigin", () => {
  it("takes the scheme from the proxy and the host from the Host header", () => {
    const headers = new Headers({
      host: "acme.shipshift.dev",
      "x-forwarded-proto": "https",
    })
    expect(requestOrigin(headers, "http:")).toBe("https://acme.shipshift.dev")
  })

  it("falls back to the parsed URL's protocol when no proxy spoke", () => {
    const headers = new Headers({ host: "acme.localhost:8010" })
    expect(requestOrigin(headers, "http:")).toBe("http://acme.localhost:8010")
  })

  it("reads the first hop of a comma-joined x-forwarded-proto", () => {
    const headers = new Headers({
      host: "setpomo.com",
      "x-forwarded-proto": "https, http",
    })
    expect(requestOrigin(headers, "http:")).toBe("https://setpomo.com")
  })

  it("normalises the host the way the tenant resolver does", () => {
    const headers = new Headers({ host: " Globex.ShipShift.dev. " })
    expect(requestOrigin(headers, "https:")).toBe("https://globex.shipshift.dev")
  })

  it("answers an empty string for a request with no host, never a bare scheme", () => {
    expect(requestOrigin(new Headers(), "https:")).toBe("")
    expect(requestOrigin(new Headers({ host: "  " }), "https:")).toBe("")
  })
})

describe("originForHost", () => {
  const headers = (init: Record<string, string>) => new Headers(init)

  it("builds the main address's origin on this request's scheme", () => {
    expect(
      originForHost(
        headers({ host: "old.shipshift.dev", "x-forwarded-proto": "https" }),
        "http:",
        "acme.shipshift.dev"
      )
    ).toBe("https://acme.shipshift.dev")
  })

  it("carries the port over, so a stand does not link itself to port 80", () => {
    expect(
      originForHost(headers({ host: "oldacme.localhost:8013" }), "http:", "acme.localhost")
    ).toBe("http://acme.localhost:8013")
  })

  it("keeps a port the named host already carries", () => {
    expect(
      originForHost(headers({ host: "a.localhost:8013" }), "http:", "b.localhost:9000")
    ).toBe("http://b.localhost:9000")
  })

  it("is empty for an empty host, so the caller can fall back", () => {
    expect(originForHost(headers({ host: "acme.localhost" }), "http:", "")).toBe("")
  })
})

describe("publicHost", () => {
  it("prefers the address the proxy recorded", () => {
    const headers = new Headers({
      host: "localhost:3000",
      "x-forwarded-host": "cherkashino.shipshift.dev",
    })
    expect(publicHost(headers)).toBe("cherkashino.shipshift.dev")
  })

  it("falls back to the Host header when nothing forwarded one", () => {
    expect(publicHost(new Headers({ host: " Acme.ShipShift.dev. " }))).toBe(
      "acme.shipshift.dev"
    )
  })

  it("reads the first hop of a comma-joined x-forwarded-host", () => {
    const headers = new Headers({
      host: "localhost:3000",
      "x-forwarded-host": "acme.shipshift.dev, edge.internal",
    })
    expect(publicHost(headers)).toBe("acme.shipshift.dev")
  })

  it("answers an empty string when neither address is there", () => {
    expect(publicHost(new Headers())).toBe("")
  })
})

describe("requestPort", () => {
  it("takes the port from the public address, not from the socket", () => {
    // The Server Action self-fetch arrives on the process' own port while the
    // shop answers on the visitor's; a canonical URL built on :3000 names an
    // address nothing listens on.
    const headers = new Headers({
      host: "localhost:3000",
      "x-forwarded-host": "cherkashino.shipshift.dev",
    })
    expect(requestPort(headers)).toBe("")
    expect(
      originForHost(headers, "https:", "cherkashino.shipshift.dev")
    ).toBe("https://cherkashino.shipshift.dev")
  })

  it("carries a stand's port over", () => {
    const headers = new Headers({ host: "ssshop.localhost:8043" })
    expect(requestPort(headers)).toBe(":8043")
  })

  it("is empty for an address with no port", () => {
    expect(requestPort(new Headers({ host: "acme.shipshift.dev" }))).toBe("")
    expect(requestPort(new Headers())).toBe("")
  })
})
