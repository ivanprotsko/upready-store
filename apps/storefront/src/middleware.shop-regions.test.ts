import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NextRequest } from "next/server"

/**
 * N9 (t-2026-10-04-19): on the live cherkashino.ru «Смена региона» listed every
 * country the backend has a region for, and «Германия → Применить» priced the
 * course in euros and left the pastes with no price. The middleware now narrows
 * the regions to the shop's own and resolves the country against them only.
 * The two shops below are the live pair as the stand holds them: cherkashino.ru
 * with no locale settings of its own on a `ru:ru` deployment pinned to `ru`, and
 * cherkashino.com with `en` priced in `us` and `ru` enabled beside it.
 */

const BACKEND = "http://backend.test"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const REGIONS = [
  { id: "reg_ru", countries: [{ iso_2: "ru" }] },
  { id: "reg_us", countries: [{ iso_2: "us" }] },
  { id: "reg_de", countries: [{ iso_2: "de" }] },
]

const SHOPS: Record<string, unknown> = {
  "cherkashino.test": {
    tenant: { id: "ten_ru", handle: "olavka", name: "Черкашино" },
    publishable_key: "pk_ru",
    primary_host: "cherkashino.test",
    locale: null,
  },
  "cherkashino-com.test": {
    tenant: { id: "ten_com", handle: "cherkashino-com", name: "Черкашино" },
    publishable_key: "pk_com",
    primary_host: "cherkashino-com.test",
    locale: { default_locale: "en", enabled_locales: ["en", "ru"], default_country: "us" },
  },
}

const loadMiddleware = async (env: Record<string, string>) => {
  vi.resetModules()
  vi.stubEnv("NEXT_PUBLIC_MEDUSA_BACKEND_URL", BACKEND)
  vi.stubEnv("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY", "pk_single")
  vi.stubEnv("DEMO_HOSTS", "")
  vi.stubEnv("REGION_PIN", "true")
  for (const [name, value] of Object.entries(env)) {
    vi.stubEnv(name, value)
  }

  const { middleware } = await import("./middleware")

  return middleware
}

const get = (url: string, cookie = "") =>
  new NextRequest(url, {
    headers: {
      host: new URL(url).host,
      cookie: `_medusa_cache_id=cache_1${cookie ? `; ${cookie}` : ""}`,
    },
  })

/** The country cookie the response writes, and the two headers the pages read. */
const outcome = (response: Response) => ({
  cookie:
    response.headers
      .getSetCookie()
      .find((c) => c.startsWith("_medusa_country="))
      ?.split(";")[0]
      .split("=")[1] ?? null,
  country: response.headers.get("x-middleware-request-x-storefront-country"),
  regions:
    response.headers.get("x-middleware-request-x-storefront-regions")?.split(",").sort() ?? null,
})

const STALE_GERMANY = "_medusa_country=de; _medusa_country_choice=1"

describe("middleware: the shop's own regions", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.includes("/storefront/by-host")) {
          const host = new URL(url).searchParams.get("host") ?? ""
          return host in SHOPS ? json(SHOPS[host]) : json({}, 404)
        }
        if (url.includes("/store/regions")) {
          return json({ regions: REGIONS })
        }
        return json({}, 404)
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const RU_DEPLOYMENT = { LOCALE_COUNTRY_MAP: "ru:ru", NEXT_PUBLIC_DEFAULT_REGION: "ru" }

  it("narrows cherkashino.ru to Russia alone", async () => {
    const middleware = await loadMiddleware(RU_DEPLOYMENT)

    const response = await middleware(get("http://cherkashino.test/ru/store"))

    expect(outcome(response)).toEqual({ cookie: "ru", country: "ru", regions: ["reg_ru"] })
  })

  it("sends a visitor who picked Germany with the old switcher back to Russia", async () => {
    const middleware = await loadMiddleware(RU_DEPLOYMENT)

    const response = await middleware(get("http://cherkashino.test/ru/store", STALE_GERMANY))

    expect(outcome(response)).toEqual({ cookie: "ru", country: "ru", regions: ["reg_ru"] })
  })

  it("keeps two regions on cherkashino.com, whose two languages price in two countries", async () => {
    const middleware = await loadMiddleware({
      LOCALE_COUNTRY_MAP: "ru:ru,en:us",
      NEXT_PUBLIC_DEFAULT_REGION: "us",
    })

    const en = outcome(await middleware(get("http://cherkashino-com.test/en/store", STALE_GERMANY)))
    const ru = outcome(await middleware(get("http://cherkashino-com.test/ru/store")))

    expect(en).toEqual({ cookie: "us", country: "us", regions: ["reg_ru", "reg_us"] })
    expect(ru).toEqual({ cookie: "ru", country: "ru", regions: ["reg_ru", "reg_us"] })
  })

  it("keeps the dollar alone on cherkashino.com when the deployment maps no locale", async () => {
    const middleware = await loadMiddleware({ LOCALE_COUNTRY_MAP: "", NEXT_PUBLIC_DEFAULT_REGION: "us" })

    const response = await middleware(get("http://cherkashino-com.test/ru/store"))

    expect(outcome(response)).toEqual({ cookie: "us", country: "us", regions: ["reg_us"] })
  })

  it("narrows nothing on a host with no shop: single-store mode keeps the visitor's pick", async () => {
    const middleware = await loadMiddleware(RU_DEPLOYMENT)

    const response = await middleware(get("http://single.test/ru/store", STALE_GERMANY))

    expect(outcome(response)).toEqual({ cookie: "de", country: "de", regions: null })
  })

  it("drops a forged region list a visitor sends", async () => {
    const middleware = await loadMiddleware(RU_DEPLOYMENT)
    const request = get("http://single.test/ru/store")
    request.headers.set("x-storefront-regions", "reg_de")

    const response = await middleware(request)

    expect(outcome(response).regions).toBeNull()
  })
})
