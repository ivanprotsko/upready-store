import { expect, test } from "@playwright/test"

import fixture from "./fixtures/profiles/testshop/profile.json"

const treatment = fixture.layout.imageTreatment
const RATIO: Record<string, number> = { "1:1": 1, "4:5": 4 / 5, "3:4": 3 / 4 }

/**
 * The image treatment reaches the catalogue card — frames 14-16 of the mock-up.
 *
 * The aspect is asserted twice over: once as the attribute the frame carries, and once as the
 * shape the browser actually computed, because an attribute that no CSS consumes would pass
 * the first assertion and change nothing on screen.
 */
test.describe("image treatment", () => {
  test("the card image frame carries the profile's aspect", async ({ page }) => {
    await page.goto("/")
    const frame = page.locator("[data-image-frame]").first()
    await expect(frame).toHaveAttribute("data-image-aspect", treatment.aspect)
  })

  test("the browser computes the shape the profile asked for", async ({ page }) => {
    await page.goto("/")
    const frame = page.locator("[data-image-frame]").first()
    await frame.waitFor()
    const box = await frame.boundingBox()
    expect(box).not.toBeNull()
    const measured = (box as { width: number; height: number }).width /
      (box as { width: number; height: number }).height
    expect(measured).toBeCloseTo(RATIO[treatment.aspect], 2)
  })

  test("the image fills the frame with the profile's object-fit", async ({ page }) => {
    await page.goto("/")
    const img = page.locator("[data-image-frame] img").first()
    await expect(img).toHaveCSS("object-fit", treatment.fit)
  })
})
