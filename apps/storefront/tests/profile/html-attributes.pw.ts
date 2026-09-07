import { expect, test } from "@playwright/test"

import fixture from "./fixtures/profiles/testshop/profile.json"

const ASPECT_ATTR: Record<string, string> = { "1:1": "1-1", "4:5": "4-5", "3:4": "3-4" }
const treatment = fixture.layout.imageTreatment

/**
 * The pre-paint half of the image treatment. Setting these attributes on <html> before first
 * paint is the theme agent's script (S1b), not S1c's: this file states the contract the
 * storefront's CSS already consumes (src/lib/profile/image-frame.module.css) so the run turns
 * green the moment that script lands. Until then it is skipped rather than asserted, because
 * a test that cannot pass is not evidence.
 */
test.describe("pre-paint <html> attributes", () => {
  test.skip(
    true,
    "S1b owns the pre-paint script; unskip at S7 once data-image-* is set on <html>"
  )

  test("html carries the profile's image treatment", async ({ page }) => {
    await page.goto("/")
    const html = page.locator("html")
    await expect(html).toHaveAttribute("data-image-aspect", ASPECT_ATTR[treatment.aspect])
    await expect(html).toHaveAttribute("data-image-fit", treatment.fit)
    await expect(html).toHaveAttribute("data-image-radius", treatment.radius)
    await expect(html).toHaveAttribute("data-image-hover", treatment.hover)
  })
})
