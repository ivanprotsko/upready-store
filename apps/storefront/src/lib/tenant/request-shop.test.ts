import { describe, expect, it, vi } from "vitest"

import { resolveShopOfRequest } from "./request-shop"
import { EMPTY_BRANDING } from "./branding"
import { EMPTY_LOGIN_SETTINGS } from "./login-settings"
import { EMPTY_MANUAL_PAYMENT } from "./manual-payment"
import { EMPTY_TENANT_PAYMENT_METHODS } from "./payment-methods"
import { EMPTY_PAYMENT_PRE_NOTICE } from "../util/payment-pre-notice"
import type { ResolvedTenant } from "./resolve"

const tenant = (handle: string): ResolvedTenant => ({
  handle,
  name: handle,
  publishableKey: `pk_${handle}`,
  theme: "electronics",
  mode: "light",
  attribution: null,
  primaryHost: `${handle}.shipshift.dev`,
  locale: null,
  seoVerification: null,
  analytics: null,
  branding: EMPTY_BRANDING,
  login: EMPTY_LOGIN_SETTINGS,
  manualPayment: EMPTY_MANUAL_PAYMENT,
  paymentMethods: EMPTY_TENANT_PAYMENT_METHODS,
  paymentPreNotice: EMPTY_PAYMENT_PRE_NOTICE,
})

/** A backend that knows exactly the hosts it is given. */
const backend = (known: Record<string, string>) =>
  vi.fn(async (host: string) => {
    const handle = known[host.trim().toLowerCase().replace(/:\d+$/, "")]

    return handle ? tenant(handle) : null
  })

describe("resolveShopOfRequest", () => {
  it("answers from the Host header and never asks the forwarded name", async () => {
    const resolve = backend({ "acme.shipshift.dev": "acme" })
    const headers = new Headers({
      host: "acme.shipshift.dev",
      "x-forwarded-host": "globex.shipshift.dev",
    })

    const shop = await resolveShopOfRequest(headers, resolve)

    expect(shop.tenant?.handle).toBe("acme")
    expect(shop.host).toBe("acme.shipshift.dev")
    // The isolation guarantee: a request whose Host names a shop is answered by
    // that shop, so a forged `x-forwarded-host` cannot move it to another one.
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it("falls back to the forwarded name when the Host names no shop", async () => {
    // Next's Server Action redirect renders its target by fetching the server's
    // OWN origin and forwarding the visitor's address on this header alone.
    const resolve = backend({ "cherkashino.shipshift.dev": "cherkashino" })
    const headers = new Headers({
      host: "localhost:3000",
      "x-forwarded-host": "cherkashino.shipshift.dev",
    })

    const shop = await resolveShopOfRequest(headers, resolve)

    expect(shop.tenant?.handle).toBe("cherkashino")
    // The shop's own address, so the primary-host redirect and `x-tenant-origin`
    // are decided against it and not against the server's internal socket.
    expect(shop.host).toBe("cherkashino.shipshift.dev")
  })

  it("keeps the port of a stand's forwarded address", async () => {
    const resolve = backend({ "ssshop.localhost": "ssshop" })
    const headers = new Headers({
      host: "localhost:8043",
      "x-forwarded-host": "ssshop.localhost:8043",
    })

    const shop = await resolveShopOfRequest(headers, resolve)

    expect(shop.tenant?.handle).toBe("ssshop")
    expect(shop.host).toBe("ssshop.localhost:8043")
  })

  it("stays in single-store mode when neither address names a shop", async () => {
    const resolve = backend({})
    const headers = new Headers({
      host: "localhost:3000",
      "x-forwarded-host": "nobody.example",
    })

    const shop = await resolveShopOfRequest(headers, resolve)

    expect(shop.tenant).toBeNull()
    // The Host header, so nothing downstream starts building URLs on a name
    // that answered nothing.
    expect(shop.host).toBe("localhost:3000")
  })

  it("does not ask twice when the two addresses are the same", async () => {
    const resolve = backend({})
    const headers = new Headers({
      host: "unknown.shipshift.dev",
      "x-forwarded-host": "Unknown.ShipShift.dev.",
    })

    const shop = await resolveShopOfRequest(headers, resolve)

    expect(shop.tenant).toBeNull()
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it("works with no forwarded header at all", async () => {
    const resolve = backend({ "acme.shipshift.dev": "acme" })
    const headers = new Headers({ host: "acme.shipshift.dev" })

    const shop = await resolveShopOfRequest(headers, resolve)

    expect(shop.tenant?.handle).toBe("acme")
    expect(shop.host).toBe("acme.shipshift.dev")
  })
})
