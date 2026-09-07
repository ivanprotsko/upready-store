import { expect, test } from "@playwright/test"

import fixture from "./fixtures/profiles/testshop/profile.json"

const tiles = fixture.home.categoryTiles

/**
 * The tile grid — frames 5-9 of the mock-up. The count is read from the profile rather than
 * hardcoded, so adding a tile to the fixture changes the expectation with it.
 */
test.describe("category tiles", () => {
  test("renders exactly as many tiles as the profile declares", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("category-tile")).toHaveCount(tiles.length)
  })

  test("links each tile to its category handle and shows its label", async ({ page }) => {
    await page.goto("/")
    for (const tile of tiles) {
      const link = page.locator(`[data-category-handle="${tile.categoryHandle}"]`)
      await expect(link).toHaveAttribute("href", `/categories/${tile.categoryHandle}`)
      await expect(link).toContainText(tile.label)
    }
  })

  test("lays the grid out in two columns at 390 wide", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/")
    const columns = await page
      .getByTestId("category-tiles")
      .locator("ul")
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length)
    expect(columns).toBe(2)
  })

  test("lays the grid out in four columns at 1280 for a four-tile profile", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/")
    const columns = await page
      .getByTestId("category-tiles")
      .locator("ul")
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length)
    expect(columns).toBe(tiles.length === 4 ? 4 : 3)
  })
})
