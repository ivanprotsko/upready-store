import { expect, test } from "@playwright/test"

import { POINT_FIXTURES, mockCdek, mockYandexMaps } from "./fixtures"
import { openCdekPointSheet, reachShippingStep } from "./flow"

/** The stub script is requested when the map mounts, so a click waits for it. */
const waitForMapStub = (page: import("@playwright/test").Page) =>
  page.waitForFunction(
    () => typeof (window as never as { __ymapsClick?: unknown }).__ymapsClick === "function",
    undefined,
    { timeout: 20_000 }
  )

/**
 * The pickup-point map (i03-checkout-pvz-map-address-suggest, Ivan's order 3.2).
 *
 * The Yandex loader is stubbed (`fixtures.ts`), so what is measured here is our
 * own wiring: which points were handed to the map, that clustering was asked
 * for, that a marker click reaches the sheet, and that choosing a point sets the
 * shipping method. The map's own rendering is Yandex's business and is measured
 * on the stand by eye instead (report.md, screenshots).
 */
test.describe("checkout pickup map", () => {
  test("draws the city's points, clusters them, and a marker click previews one", async ({ page }) => {
    await mockCdek(page)
    const loader = await mockYandexMaps(page)
    await reachShippingStep(page)
    await openCdekPointSheet(page)
    await waitForMapStub(page)

    await expect(page.getByTestId("pickup-map")).toBeVisible()
    await expect(page.getByTestId("cdek-point-row")).toHaveCount(POINT_FIXTURES.length)

    const drawn = await page.evaluate(() => ({
      ids: (window as never as { __ymaps: { features: { id: string }[] } }).__ymaps.features.map(
        (feature) => feature.id
      ),
      // [latitude, longitude] in JS API 2.1 — the reverse of GeoJSON. A swap
      // would put every point in the Indian Ocean and no assertion above would
      // notice.
      first: (
        window as never as {
          __ymaps: { features: { geometry: { coordinates: number[] } }[] }
        }
      ).__ymaps.features[0].geometry.coordinates,
      clusterPreset: (window as never as { __ymaps: { clusterPreset?: string } }).__ymaps
        .clusterPreset,
    }))

    expect(drawn.ids).toEqual(POINT_FIXTURES.map((point) => point.code))
    expect(drawn.first).toEqual([POINT_FIXTURES[0].lat, POINT_FIXTURES[0].lng])
    expect(drawn.clusterPreset, "clustering was never configured").toContain("ClusterIcons")

    // A click on the second marker: the card appears and names that point.
    await page.evaluate(
      (code) => (window as never as { __ymapsClick: (id: string) => void }).__ymapsClick(code),
      POINT_FIXTURES[1].code
    )
    const pointCard = page.getByTestId("cdek-point-card")
    await expect(pointCard).toBeVisible()
    await expect(pointCard).toContainText(POINT_FIXTURES[1].name)
    await expect(pointCard).toContainText(POINT_FIXTURES[1].address)

    // The loader script is added once for the life of the page: choosing a
    // point, then reopening the picker through «Сменить пункт», rebuilds the map
    // from the API already in memory and never fetches it again.
    await page.getByTestId("cdek-point-card-choose").click()
    await expect(page.getByTestId("cdek-point-city")).toBeHidden({ timeout: 30_000 })

    const change = page.getByTestId("delivery-option-cdek-change")
    await expect(change, "no way back into the picker after a point was chosen").toBeVisible({
      timeout: 30_000,
    })
    await change.click()
    await expect(page.getByTestId("pickup-map")).toBeVisible()
    expect(loader.loads, "the Yandex loader was requested more than once").toBe(1)
  })

  test("choosing a point on the card sets the shipping method", async ({ page }) => {
    await mockCdek(page)
    await mockYandexMaps(page)
    await reachShippingStep(page)
    await openCdekPointSheet(page)
    await waitForMapStub(page)

    await page.evaluate(
      (code) => (window as never as { __ymapsClick: (id: string) => void }).__ymapsClick(code),
      POINT_FIXTURES[2].code
    )
    await page.getByTestId("cdek-point-card-choose").click()

    // The sheet closes on success, and the chosen point is on the page: the
    // shipping row names it (`checkout-info-rows` reads the cart's own method).
    await expect(page.getByTestId("cdek-point-city")).toBeHidden({ timeout: 30_000 })
    await expect(page.getByText(POINT_FIXTURES[2].name, { exact: false }).first()).toBeVisible({
      timeout: 30_000,
    })
  })

  test("@mobile the list is the default and the map is a tab; 390 px does not scroll sideways", async ({
    page,
  }) => {
    await mockCdek(page)
    await mockYandexMaps(page)
    await reachShippingStep(page)
    await openCdekPointSheet(page)

    await expect(page.getByTestId("cdek-point-list")).toBeVisible()
    await expect(page.getByTestId("pickup-map")).toBeHidden()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow, "the page scrolls sideways at 390 px").toBeLessThanOrEqual(0)

    await page.getByTestId("cdek-point-tab-map").click()
    await expect(page.getByTestId("pickup-map")).toBeVisible()
    await expect(page.getByTestId("cdek-point-list")).toBeHidden()
  })
})

/**
 * `prefers-reduced-motion`: the only animation the map has is the flight to a
 * chosen point, so honouring the setting means the map jumps instead of gliding.
 * Measured through the stub, which records the duration the component asked for.
 */
test.describe("checkout pickup map, reduced motion", () => {
  test.use({ reducedMotion: "reduce" })

  test("flies to the chosen point with no animation", async ({ page }) => {
    await mockCdek(page)
    await mockYandexMaps(page)
    await reachShippingStep(page)
    await openCdekPointSheet(page)
    await waitForMapStub(page)

    await page.evaluate(
      (code) => (window as never as { __ymapsClick: (id: string) => void }).__ymapsClick(code),
      POINT_FIXTURES[1].code
    )
    await expect(page.getByTestId("cdek-point-card")).toBeVisible()

    const flights = await page.evaluate(
      () =>
        (window as never as { __ymaps: { flights: { duration?: number }[] } }).__ymaps.flights
    )
    expect(flights.length, "the map never flew to the chosen point").toBeGreaterThan(0)
    expect(flights[flights.length - 1].duration).toBe(0)
  })
})
