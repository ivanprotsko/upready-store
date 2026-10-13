import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { blockById } from "../../registry"
import ContactsStoreMap from "."
import { contactsStoreMap } from "./block"
import { MAX_LOCATIONS, parseContactsStoreMapProps, type ContactsStoreMapProps } from "./props"
import { pickLocations, telHref, watchNear, yandexMapsHref } from "./locations"

vi.mock("server-only", () => ({}))

const locale = vi.hoisted(() => ({ current: "ru" }))
vi.mock("next-intl/server", () => ({ getLocale: async () => locale.current }))
vi.mock("@i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={`/ru${href}`} {...rest}>
      {children}
    </a>
  ),
}))

const KEY = "NEXT_PUBLIC_YANDEX_MAPS_KEY"

const sample = () => {
  const parsed = parseContactsStoreMapProps(contactsStoreMap.fixtures!.sample)
  if (!parsed.ok) throw new Error(parsed.errors.join("; "))
  return parsed.value
}

const render = async (props: ContactsStoreMapProps) => {
  const tree = await ContactsStoreMap(props)
  return tree === null ? null : renderToStaticMarkup(tree)
}

const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0

beforeEach(() => {
  locale.current = "ru"
  vi.stubEnv(KEY, "")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("contacts/store-map entry", () => {
  it("is in the registry as a lab home block with the roles of the brief", () => {
    expect(blockById("contacts/store-map")).toBe(contactsStoreMap)
    expect(contactsStoreMap).toMatchObject({
      category: "contacts",
      variant: "store-map",
      status: "lab",
      placement: "home",
      data: ["static"],
    })
    expect([...contactsStoreMap.roles].sort()).toEqual(
      ["card", "contacts", "description", "map", "section-header", "social-link"].sort()
    )
  })

  it("parses both fixtures; the sample holds 1 to 8 points", () => {
    expect(parseContactsStoreMapProps(contactsStoreMap.fixtures!.empty).ok).toBe(true)
    expect(sample().locations.length).toBeGreaterThanOrEqual(1)
    expect(sample().locations.length).toBeLessThanOrEqual(MAX_LOCATIONS)
  })

  it("has no real person's data in the sample: «Примерная» streets, phones of the unused code 000", () => {
    for (const location of sample().locations) {
      expect(location.address.ru).toMatch(/Примерн/)
      expect(location.phone ?? "").toMatch(/\(000\)/)
      for (const link of location.links) expect(link.href).toMatch(/demo|example/)
    }
  })
})

describe("parseContactsStoreMapProps", () => {
  const point = { name: { ru: "Магазин" }, address: { ru: "ул. Примерная, 1" }, coordinates: { lat: 55.75, lon: 37.62 } }

  it("fills the block's words with Russian and English defaults", () => {
    const parsed = parseContactsStoreMapProps({ locations: [point] })
    expect(parsed.ok && parsed.value).toMatchObject({
      header: null,
      mapLinkLabel: { ru: "Открыть в Яндекс Картах", en: "Open in Yandex Maps" },
      showOnMapLabel: { ru: "Показать на карте", en: "Show on the map" },
      mapLabel: { ru: "Магазины на карте" },
      locations: [{ hours: {}, phone: null, note: {}, links: [] }],
    })
  })

  it("reads absent props as no points", () => {
    expect(parseContactsStoreMapProps(undefined)).toMatchObject({ ok: true, value: { locations: [] } })
  })

  it("refuses a ninth point", () => {
    const parsed = parseContactsStoreMapProps({ locations: Array.from({ length: 9 }, () => point) })
    expect(parsed).toEqual({ ok: false, errors: ["locations has 9 items, at most 8"] })
  })

  it("asks every point for a name, an address and its coordinates", () => {
    const parsed = parseContactsStoreMapProps({ locations: [{}] })
    expect(parsed.ok).toBe(false)
    expect(!parsed.ok && parsed.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("locations[0].name"),
        expect.stringContaining("locations[0].address"),
        "locations[0].coordinates is required",
      ])
    )
  })

  it("holds coordinates to degrees on the globe", () => {
    const parsed = parseContactsStoreMapProps({
      locations: [{ ...point, coordinates: { lat: 91, lon: "37.62" } }],
    })
    expect(!parsed.ok && parsed.errors).toEqual([
      "locations[0].coordinates.lat must be a number of degrees from -90 to 90",
      "locations[0].coordinates.lon must be a number of degrees from -180 to 180",
    ])
  })

  it("takes a phone as the shop writes it and refuses words in it", () => {
    const good = parseContactsStoreMapProps({ locations: [{ ...point, phone: " +7 (000) 000-00-01 " }] })
    expect(good.ok && good.value.locations[0].phone).toBe("+7 (000) 000-00-01")
    const bad = parseContactsStoreMapProps({ locations: [{ ...point, phone: "звоните +7 000" }] })
    expect(!bad.ok && bad.errors[0]).toMatch(/^locations\[0\]\.phone must be a phone number/)
    const short = parseContactsStoreMapProps({ locations: [{ ...point, phone: "12-34" }] })
    expect(short.ok).toBe(false)
  })

  it("takes at most three links of a point, each to the shop or https, with an icon of the closed list", () => {
    const link = { label: { ru: "Telegram" }, href: "https://t.me/primer_shop_demo" }
    const four = parseContactsStoreMapProps({ locations: [{ ...point, links: [link, link, link, link] }] })
    expect(!four.ok && four.errors).toEqual(["locations[0].links has 4 items, at most 3"])
    const unsafe = parseContactsStoreMapProps({ locations: [{ ...point, links: [{ ...link, href: "javascript:alert(1)" }] }] })
    expect(!unsafe.ok && unsafe.errors).toEqual(["locations[0].links[0].href must start with / or https://"])
    const icon = parseContactsStoreMapProps({ locations: [{ ...point, links: [{ ...link, icon: "telegram" }] }] })
    expect(!icon.ok && icon.errors[0]).toMatch(/^locations\[0\]\.links\[0\]\.icon must be an icon/)
    const parsed = parseContactsStoreMapProps({ locations: [{ ...point, links: [link] }] })
    expect(parsed.ok && parsed.value.locations[0].links[0].icon).toBe("message-circle")
  })

  it("refuses a prop the block does not have", () => {
    expect(parseContactsStoreMapProps({ map: "leaflet" })).toEqual({ ok: false, errors: ["map: not a prop of contacts/store-map"] })
  })
})

describe("the links of a point", () => {
  it("opens Yandex Maps at the point, longitude first", () => {
    expect(yandexMapsHref({ lat: 55.7601, lon: 37.6186 })).toBe("https://yandex.ru/maps/?pt=37.6186,55.7601&z=16&l=map")
  })

  it("dials the phone's digits and its leading +", () => {
    expect(telHref("+7 (000) 000-00-01")).toBe("tel:+70000000001")
    expect(telHref("8 000 000-00-02")).toBe("tel:80000000002")
  })
})

describe("pickLocations", () => {
  it("drops a point without a name or an address in any language, and keeps the ids of the rest", () => {
    const value = sample()
    const [first, second, third] = value.locations
    const picked = pickLocations([first, { ...second, name: {} }, { ...third, address: { de: "" } }, first], "ru")
    expect(picked.map((location) => location.id)).toEqual(["location-0", "location-3"])
  })

  it("reads the visitor's language, then English", () => {
    const [first] = sample().locations
    expect(pickLocations([first], "en")[0]).toMatchObject({ name: first.name.en, address: first.address.en })
    expect(pickLocations([{ ...first, hours: { en: "Daily" } }], "ru")[0].hours).toBe("Daily")
  })

  it("drops a link with no words", () => {
    const [first] = sample().locations
    const picked = pickLocations([{ ...first, links: [{ label: {}, href: "https://t.me/x", icon: "send" }] }], "ru")
    expect(picked[0].links).toEqual([])
  })
})

describe("watchNear: the map loads when the block comes near the screen", () => {
  type Callback = (entries: { isIntersecting: boolean }[]) => void
  const observers: { callback: Callback; options: unknown; observed: unknown[]; disconnected: boolean }[] = []
  class FakeObserver {
    record: (typeof observers)[number]
    constructor(callback: Callback, options: unknown) {
      this.record = { callback, options, observed: [], disconnected: false }
      observers.push(this.record)
    }
    observe(el: unknown) {
      this.record.observed.push(el)
    }
    disconnect() {
      this.record.disconnected = true
    }
  }

  beforeEach(() => {
    observers.length = 0
  })

  it("waits until the block intersects a margin around the screen, then calls once and stops watching", () => {
    const near = vi.fn()
    const el = {} as Element
    watchNear(el, near, FakeObserver as unknown as typeof IntersectionObserver)
    expect(observers).toHaveLength(1)
    expect(observers[0].observed).toEqual([el])
    expect(observers[0].options).toMatchObject({ rootMargin: expect.stringMatching(/px/) })
    observers[0].callback([{ isIntersecting: false }])
    expect(near).not.toHaveBeenCalled()
    observers[0].callback([{ isIntersecting: true }])
    expect(near).toHaveBeenCalledTimes(1)
    expect(observers[0].disconnected).toBe(true)
  })

  it("calls at once where the browser has no IntersectionObserver", () => {
    const near = vi.fn()
    watchNear({} as Element, near, undefined)
    expect(near).toHaveBeenCalledTimes(1)
  })

  it("stops watching when the block goes away first", () => {
    const stop = watchNear({} as Element, vi.fn(), FakeObserver as unknown as typeof IntersectionObserver)
    stop()
    expect(observers[0].disconnected).toBe(true)
  })
})

describe("ContactsStoreMap", () => {
  it("draws nothing without points", async () => {
    expect(await render(parseEmpty())).toBeNull()
  })

  it("draws nothing when no point has a name and an address in any language", async () => {
    const value = sample()
    expect(await render({ ...value, locations: value.locations.map((location) => ({ ...location, name: {} })) })).toBeNull()
  })

  it("without a map key: the list alone, each point with the Yandex Maps link, no map and no «show on the map»", async () => {
    const html = (await render(sample()))!
    const points = sample().locations
    expect(html).toContain('data-block="contacts/store-map"')
    expect(count(html, /data-role="card"/g)).toBe(points.length)
    expect(html).not.toContain('data-role="map"')
    expect(html).not.toContain("Показать на карте")
    expect(html).not.toContain("api-maps.yandex.ru")
    for (const point of points) {
      const href = yandexMapsHref(point.coordinates).replace(/&/g, "&amp;")
      expect(html).toContain(`href="${href}"`)
    }
    expect(count(html, />Открыть в Яндекс Картах</g)).toBe(points.length)
    expect(html).toMatch(/target="_blank" rel="noopener noreferrer"/)
  })

  it("draws the contacts: address, hours, a tel: phone, the note and the point's links", async () => {
    const html = (await render(sample()))!
    const [first] = sample().locations
    expect(html).toContain(first.address.ru)
    expect(html).toContain(first.hours.ru)
    expect(html).toContain(`href="${telHref(first.phone!)}"`)
    expect(html).toContain('data-role="contacts"')
    expect(html).toContain('data-role="description"')
    expect(html).toContain('data-role="social-link"')
    expect(html).toContain(`href="${first.links[0].href}"`)
  })

  it("with a map key: the map's box beside the list and a «show on the map» button per point, nothing chosen yet", async () => {
    vi.stubEnv(KEY, "test-key")
    const html = (await render(sample()))!
    const points = sample().locations
    expect(html).toContain('data-role="map"')
    expect(html).toMatch(/aria-label="Магазины на карте"/)
    expect(count(html, /aria-pressed="false"/g)).toBe(points.length)
    expect(count(html, /aria-pressed="true"/g)).toBe(0)
    expect(html).toContain("small:grid-cols-")
    // The loader is the map component's, mounted only when the block comes near: none on the server.
    expect(html).not.toContain("api-maps.yandex.ru")
    expect(html).not.toContain('data-testid="pickup-map"')
    // The link stays: a route is built in the Yandex Maps app, not on this map.
    expect(count(html, />Открыть в Яндекс Картах</g)).toBe(points.length)
  })

  it("speaks the visitor's language", async () => {
    locale.current = "en"
    const html = (await render(sample()))!
    expect(html).toContain(sample().locations[0].name.en)
    expect(html).toContain(">Open in Yandex Maps<")
  })

  it("uses the theme's tokens, no colour literal", async () => {
    vi.stubEnv(KEY, "test-key")
    const html = (await render(sample()))!
    expect(html).toContain("rounded-[var(--radius)]")
    expect(html).toContain("border-[var(--border)]")
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(|hsl\(/i)
  })
})

function parseEmpty() {
  const parsed = parseContactsStoreMapProps(contactsStoreMap.fixtures!.empty)
  if (!parsed.ok) throw new Error(parsed.errors.join("; "))
  return parsed.value
}
