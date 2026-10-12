import type { Page, Route } from "@playwright/test"

/**
 * Canned answers and a Yandex stub, so this suite measures OUR code and never a
 * carrier's uptime or a map key's quota (i03-checkout-pvz-map-address-suggest).
 *
 * Shapes are copied from live answers measured on the stand 2026-09-16
 * (`/api/cdek/points?city=Москва` → 142 points, all with coordinates;
 * `/api/cdek/cities?q=Красно` → Краснодар, Красноярск, …), trimmed to what an
 * assertion needs.
 */

export const CITY_FIXTURES = [
  { code: 435, city: "Краснодар", region: "городской округ Краснодар, Краснодарский край, Россия", lat: null, lng: null },
  { code: 278, city: "Красноярск", region: "городской округ Красноярск, Красноярский край, Россия", lat: null, lng: null },
  { code: 1074, city: "Красногорск", region: "городской округ Красногорск, Московская область, Россия", lat: null, lng: null },
]

export const POINT_FIXTURES = [
  {
    code: "MSK65",
    name: "MSK65, Москва, ул. Динамовская",
    type: "PVZ",
    address: "109044, ул. Динамовская, 1А, 110а",
    city: "Москва",
    postal_code: "109044",
    lat: 55.732175,
    lng: 37.66371,
    work_time: "Пн-Пт 10:00-20:00, Сб 10:00-16:00",
    phone: "+79253578826",
    note: null,
    metro: "Пролетарская",
    have_cashless: true,
    is_dressing_room: true,
    weight_max: null,
  },
  {
    code: "MSK12",
    name: "MSK12, Москва, Ленинский проспект",
    type: "PVZ",
    address: "119049, Ленинский проспект, 4с1",
    city: "Москва",
    postal_code: "119049",
    lat: 55.72864,
    lng: 37.6053,
    work_time: "Пн-Вс 10:00-21:00",
    phone: "+79251112233",
    note: null,
    metro: "Октябрьская",
    have_cashless: true,
    is_dressing_room: false,
    weight_max: null,
  },
  {
    code: "MSK301",
    name: "MSK301, Москва, Тверская",
    type: "PVZ",
    address: "125009, Тверская улица, 12с1",
    city: "Москва",
    postal_code: "125009",
    lat: 55.76199,
    lng: 37.6079,
    work_time: "Пн-Пт 09:00-19:00",
    phone: null,
    note: null,
    metro: "Пушкинская",
    have_cashless: false,
    is_dressing_room: true,
    weight_max: null,
  },
]

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })

/** Counts the suggest calls, so a test can prove the debounce really debounces. */
export type SuggestCounter = { calls: string[] }

export async function mockCdek(page: Page): Promise<SuggestCounter> {
  const counter: SuggestCounter = { calls: [] }

  await page.route("**/api/cdek/cities**", (route) => {
    const term = (new URL(route.request().url()).searchParams.get("q") ?? "").toLowerCase()
    counter.calls.push(term)
    return json(route, {
      cities: CITY_FIXTURES.filter((city) => city.city.toLowerCase().startsWith(term)),
    })
  })

  await page.route("**/api/cdek/points**", (route) =>
    json(route, { configured: true, city: { code: 44, name: "Москва" }, points: POINT_FIXTURES })
  )

  return counter
}

/**
 * Replaces the Yandex loader with a stub that answers the same surface the map
 * component uses (`Map`, `ObjectManager`, `Placemark`, `ready`) and records every call, so a
 * test can assert what was drawn and can fire a marker click without a key, a
 * network or a canvas.
 */
export async function mockYandexMaps(page: Page): Promise<{ loads: number }> {
  const counter = { loads: 0 }
  await page.route("https://api-maps.yandex.ru/**", (route) => {
    counter.loads += 1
    return route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: YMAPS_STUB,
    })
  })
  return counter
}

const YMAPS_STUB = `
window.__ymaps = { features: [], selected: null, pins: [], clickHandlers: [], bounds: 0, flights: [] }
window.ymaps = {
  ready: function (cb) { cb() },
  Map: function (el, state) {
    el.setAttribute("data-ymaps-stub", "1")
    window.__ymaps.center = state.center
    return {
      behaviors: { disable: function () {} },
      geoObjects: {
        add: function (object) { if (object && object.__pin) window.__ymaps.pins.push(object) },
        remove: function (object) { window.__ymaps.pins = window.__ymaps.pins.filter(function (p) { return p !== object }) },
      },
      container: { fitToViewport: function () {} },
      setBounds: function () { window.__ymaps.bounds += 1 },
      setCenter: function (c, z, o) { window.__ymaps.flights.push({ center: c, zoom: z, duration: o && o.duration }) },
      getZoom: function () { return 10 },
      destroy: function () {},
    }
  },
  ObjectManager: function () {
    var options = {}
    return {
      add: function (collection) { window.__ymaps.features = collection.features },
      removeAll: function () { window.__ymaps.features = [] },
      getBounds: function () { return [[55, 37], [56, 38]] },
      // The component takes the selected point out of the clusters; the one it filters out is
      // the selected one.
      setFilter: function (keep) {
        var out = window.__ymaps.features.find(function (f) { return !keep(f) })
        window.__ymaps.selected = out ? out.id : null
      },
      clusters: { options: { set: function (k, v) { options[k] = v; window.__ymaps.clusterPreset = v } } },
      objects: {
        events: { add: function (name, handler) { if (name === "click") window.__ymaps.clickHandlers.push(handler) } },
      },
    }
  },
  /** The selected point's own marker, the red pin (t-2026-10-12-03, item 3.8). */
  Placemark: function (coordinates, properties, options) {
    return { __pin: true, coordinates: coordinates, options: options }
  },
}
/** Fires the component's own click handler for one point id. */
window.__ymapsClick = function (id) {
  window.__ymaps.clickHandlers.forEach(function (handler) {
    handler({ get: function () { return id } })
  })
}
`
