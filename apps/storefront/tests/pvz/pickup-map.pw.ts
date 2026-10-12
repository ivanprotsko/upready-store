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
/** The list row of one point. */
const rowOf = (page: import("@playwright/test").Page, code: string) =>
  page.locator(`[data-testid="cdek-point-row"][data-point-id="${code}"]`)

/** What the stub was last asked to mark as selected: the red pin and the point it stands for. */
const pinOf = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const ymaps = (window as never as {
      __ymaps: { selected: string | null; pins: { options: { iconImageHref?: string } }[] }
    }).__ymaps
    return { selected: ymaps.selected, pins: ymaps.pins.length, href: ymaps.pins[0]?.options.iconImageHref ?? "" }
  })

test.describe("checkout pickup map", () => {
  test("draws the city's points, clusters them, and a marker click expands its row", async ({ page }) => {
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

    // A click on the second marker (t-2026-10-12-03, item 3.6.2): the list on the left
    // expands that point's row in view, the pin turns red, and no card appears on the map.
    await page.evaluate(
      (code) => (window as never as { __ymapsClick: (id: string) => void }).__ymapsClick(code),
      POINT_FIXTURES[1].code
    )
    const row = rowOf(page, POINT_FIXTURES[1].code)
    await expect(row).toHaveAttribute("data-selected", "true")
    await expect(row).toBeInViewport()
    await expect(row).toContainText(POINT_FIXTURES[1].phone as string)
    await expect(page.getByTestId("cdek-point-map-card")).toBeHidden()
    const pin = await pinOf(page)
    expect(pin.selected).toBe(POINT_FIXTURES[1].code)
    expect(pin.pins).toBe(1)
    expect(decodeURIComponent(pin.href)).toContain("#EA4335")

    // The loader script is added once for the life of the page: choosing a
    // point, then reopening the picker through «Сменить пункт», rebuilds the map
    // from the API already in memory and never fetches it again.
    await row.getByTestId("cdek-point-choose").click()
    await expect(page.getByTestId("cdek-point-city")).toBeHidden({ timeout: 30_000 })

    const change = page.getByTestId("delivery-option-cdek-change")
    await expect(change, "no way back into the picker after a point was chosen").toBeVisible({
      timeout: 30_000,
    })
    await change.click()
    await expect(page.getByTestId("pickup-map")).toBeVisible()
    expect(loader.loads, "the Yandex loader was requested more than once").toBe(1)

    // Decision D9: the point on the cart opens selected, its row expanded and in view.
    const reopened = rowOf(page, POINT_FIXTURES[1].code)
    await expect(reopened).toHaveAttribute("data-selected", "true")
    await expect(reopened).toBeInViewport()
  })

  test("choosing a point in its expanded row sets the shipping method", async ({ page }) => {
    await mockCdek(page)
    await mockYandexMaps(page)
    await reachShippingStep(page)
    await openCdekPointSheet(page)
    await waitForMapStub(page)

    // A tap on the row (item 3.4): it expands with «Выбрать»; collapsed rows carry none.
    await expect(page.getByTestId("cdek-point-choose")).toHaveCount(0)
    await rowOf(page, POINT_FIXTURES[2].code).click()
    await page.getByTestId("cdek-point-choose").click()

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

  test("@mobile a tap on the map opens a card with an xmark; back on the list the row is in view", async ({
    page,
  }) => {
    await mockCdek(page)
    await mockYandexMaps(page)
    await reachShippingStep(page)
    await openCdekPointSheet(page)
    await page.getByTestId("cdek-point-tab-map").click()
    await waitForMapStub(page)

    const tap = (code: string) =>
      page.evaluate(
        (id) => (window as never as { __ymapsClick: (id: string) => void }).__ymapsClick(id),
        code
      )

    // Item 3.6: the card at the bottom of the map, «Выбрать» without leaving the tab.
    await tap(POINT_FIXTURES[2].code)
    const card = page.getByTestId("cdek-point-map-card")
    await expect(card).toBeVisible()
    await expect(card).toContainText(POINT_FIXTURES[2].name)
    await expect(card.getByTestId("cdek-point-map-card-choose")).toBeVisible()
    expect((await pinOf(page)).selected).toBe(POINT_FIXTURES[2].code)

    // The xmark closes the card and clears the selection: no red pin is left.
    await page.getByTestId("cdek-point-map-card-close").click()
    await expect(card).toBeHidden()
    expect(await pinOf(page)).toMatchObject({ selected: null, pins: 0 })

    // Item 3.6.1: a point picked on the map is already in view, expanded, on «Список».
    await tap(POINT_FIXTURES[2].code)
    await page.getByTestId("cdek-point-tab-list").click()
    const row = rowOf(page, POINT_FIXTURES[2].code)
    await expect(row).toHaveAttribute("data-selected", "true")
    await expect(row).toBeInViewport()
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
    await expect(rowOf(page, POINT_FIXTURES[1].code)).toHaveAttribute("data-selected", "true")

    const flights = await page.evaluate(
      () =>
        (window as never as { __ymaps: { flights: { duration?: number }[] } }).__ymaps.flights
    )
    expect(flights.length, "the map never flew to the chosen point").toBeGreaterThan(0)
    expect(flights[flights.length - 1].duration).toBe(0)
  })
})
