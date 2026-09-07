import { expect, test } from "@playwright/test"

import fixture from "./fixtures/profiles/testshop/profile.json"

const promo = fixture.home.promoStrip

/**
 * The promo strip takes its copy from the profile — frames 10 and 11 of the mock-up. The
 * strip is site-wide (rendered by (main)/layout.tsx), so it is asserted on the home page and
 * on a second route to prove it is not a home-page block.
 */
test.describe("promo strip", () => {
  test("shows the profile's text rather than the starter copy", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("promo-banner-text")).toContainText(promo.text)
    await expect(page.getByTestId("promo-banner")).toHaveAttribute(
      "data-promo-source",
      "profile"
    )
  })

  test("appears on every page, not only on home", async ({ page }) => {
    await page.goto("/store")
    await expect(page.getByTestId("promo-banner-text")).toContainText(promo.text)
  })
})
