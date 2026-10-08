import { beforeEach, describe, expect, it, vi } from "vitest"
import { COUNTRY_HEADER, SHOP_REGIONS_HEADER } from "@lib/geolocation"
import { encodeTenantHeaderValue } from "@lib/tenant/headers"

/**
 * t-2026-10-08-13, part A7b: the 404 of `/humans.txt` and of
 * `/ru/products/abc.html` of a live shop carried the engine's whole list of
 * regions in its code, 241 countries and their currencies, while `/ru/abc.html`
 * carried none. The middleware hands a path with a dot on as a file: the
 * request reaches the shop's header with the shop's name and key, and with
 * neither the country nor the narrowed regions, which it writes further down.
 * `listShopRegions` read «no narrowing» there as «every region».
 *
 * The headers below are the ones the middleware writes, under their real
 * names, and `./cookies` is the real module.
 */

const request = { headers: new Headers() }

vi.mock("server-only", () => ({}))

vi.mock("next/headers", () => ({
  headers: async () => request.headers,
  cookies: async () => ({ get: () => undefined }),
}))

const region = (id: string, currency: string, country: string) => ({
  id,
  currency_code: currency,
  countries: [{ iso_2: country }],
})

const ENGINE = [
  region("reg_au", "aud", "au"),
  region("reg_us", "usd", "us"),
  region("reg_de", "eur", "de"),
  region("reg_ru", "rub", "ru"),
]

vi.mock("@lib/config", () => ({
  sdk: {
    client: {
      fetch: async (path: string) => {
        if (path !== "/store/regions") throw new Error(`unexpected path ${path}`)
        return { regions: ENGINE }
      },
    },
  },
}))

vi.mock("./site-wide", () => ({
  siteWideRead: async (_label: string, run: () => unknown) => run(),
}))

/** What `tenantRequestHeaders` writes for a host with a shop, whatever the path. */
const shop = () => {
  request.headers.set("x-tenant-handle", encodeTenantHeaderValue("acme"))
  request.headers.set("x-tenant-name", encodeTenantHeaderValue("Лавка Акме"))
}

/** What the middleware adds past its dot check, for a path it treats as a page. */
const page = (regions: string | null) => {
  request.headers.set(COUNTRY_HEADER, "ru")
  if (regions) request.headers.set(SHOP_REGIONS_HEADER, regions)
}

const ids = async () => {
  const { listShopRegions } = await import("./regions")
  return (await listShopRegions()).map((each) => each.id)
}

beforeEach(() => {
  request.headers = new Headers()
})

describe("listShopRegions of a host with a shop", () => {
  it("gives a page the regions the middleware narrowed the shop to", async () => {
    shop()
    page("reg_ru")

    expect(await ids()).toEqual(["reg_ru"])
  })

  it("gives a path with a dot no region at all, not the engine's list", async () => {
    shop()

    const { listShopRegions } = await import("./regions")
    const regions = await listShopRegions()

    expect(regions).toEqual([])
    expect(JSON.stringify(regions)).not.toMatch(/iso_2|usd|eur|aud/)
  })

  it("keeps every region for a shop whose country is left to detection", async () => {
    shop()
    page(null)

    expect(await ids()).toEqual(["reg_au", "reg_us", "reg_de", "reg_ru"])
  })
})

describe("listShopRegions of a host with no shop", () => {
  it("gives a page every region, as before", async () => {
    page(null)

    expect(await ids()).toEqual(["reg_au", "reg_us", "reg_de", "reg_ru"])
  })

  it("gives a path with a dot every region, as before", async () => {
    expect(await ids()).toEqual(["reg_au", "reg_us", "reg_de", "reg_ru"])
  })
})

describe("hasResolvedCountry", () => {
  it("is true only for a request the middleware wrote a country on", async () => {
    const { hasResolvedCountry } = await import("./cookies")

    expect(await hasResolvedCountry()).toBe(false)
    page(null)
    expect(await hasResolvedCountry()).toBe(true)
  })
})
