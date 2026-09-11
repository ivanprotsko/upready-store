import { describe, expect, it } from "vitest"

import { requestOrigin } from "./origin"

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
