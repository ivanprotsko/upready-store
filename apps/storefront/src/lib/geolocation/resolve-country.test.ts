import type { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { RegionMap } from "./index"

/**
 * The order in which a country is decided — an explicit pick, then the locale
 * map, then a cookie detection wrote, then the pinned default — is read at module
 * load from the environment, so every case re-imports the module with its own
 * env. Nothing here reaches detection: that would make a unit test call an IP
 * lookup service over the network.
 */
const region = {} as RegionMap extends Map<string, infer V> ? V : never

const regionMap: RegionMap = new Map([
  ["ru", region],
  ["us", region],
  ["de", region],
])

const request = (cookies: Record<string, string>) =>
  ({
    cookies: {
      get: (name: string) =>
        name in cookies ? { value: cookies[name] } : undefined,
    },
    headers: { get: () => null },
  }) as unknown as NextRequest

const load = async () => {
  vi.resetModules()
  return await import("./index")
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEFAULT_REGION", "us")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("resolveCountry", () => {
  it("keeps the country the visitor picked, whatever the page's language says", async () => {
    vi.stubEnv("LOCALE_COUNTRY_MAP", "ru:ru,en:us")
    const { resolveCountry } = await load()

    const { countryCode } = await resolveCountry(
      request({ _medusa_country: "de", _medusa_country_choice: "1" }),
      regionMap,
      "ru"
    )

    expect(countryCode).toBe("de")
  })

  it("takes the country of the locale over the deployment's pinned default", async () => {
    vi.stubEnv("LOCALE_COUNTRY_MAP", "ru:ru,en:us")
    vi.stubEnv("REGION_PIN", "true")
    const { resolveCountry } = await load()

    const { countryCode } = await resolveCountry(request({}), regionMap, "ru")

    expect(countryCode).toBe("ru")
  })

  it("takes the country of the locale over a cookie detection wrote earlier", async () => {
    vi.stubEnv("LOCALE_COUNTRY_MAP", "ru:ru,en:us")
    vi.stubEnv("REGION_PIN", "false")
    const { resolveCountry } = await load()

    const { countryCode } = await resolveCountry(
      request({ _medusa_country: "de" }),
      regionMap,
      "en"
    )

    expect(countryCode).toBe("us")
  })

  it("falls back to the pinned default for a locale the deployment does not map", async () => {
    vi.stubEnv("LOCALE_COUNTRY_MAP", "ru:ru")
    vi.stubEnv("REGION_PIN", "true")
    const { resolveCountry } = await load()

    const { countryCode } = await resolveCountry(request({}), regionMap, "de")

    expect(countryCode).toBe("us")
  })

  it("with no map configured behaves exactly as before: the cookie stands", async () => {
    vi.stubEnv("LOCALE_COUNTRY_MAP", "")
    vi.stubEnv("REGION_PIN", "false")
    const { resolveCountry } = await load()

    const { countryCode } = await resolveCountry(
      request({ _medusa_country: "de" }),
      regionMap,
      "ru"
    )

    expect(countryCode).toBe("de")
  })
})
