import { expect, test } from "@playwright/test"

/**
 * The category strip under the H5/H6 header (task order t-2026-09-10-02): it travels
 * with the sticky header, so once the visitor scrolls it must be as opaque as the
 * header itself — on 2026-09-10 kerbstone's rode transparent over the product grid.
 * Measured on the LIVE stand as the browser paints it: the band's computed background
 * after a scroll, compared with the header's, never a class name.
 */

const TRANSPARENT = /^rgba\(\d+, \d+, \d+, 0\)$|^transparent$/

test.describe("header-category-strip", () => {
  test("the sticky category strip keeps the header's background while scrolled", async ({
    page,
  }) => {
    await page.goto("/")
    await page.locator("html[lang]").waitFor()

    const band = page.getByTestId("nav-category-band")
    if ((await band.count()) === 0) {
      test.skip(true, "this stand's header variant carries no category strip (h1–h4)")
    }

    await page.mouse.wheel(0, 900)
    await page.waitForFunction(() => window.scrollY > 600)

    const header = page.locator("header").first()
    const bandBackground = await band.evaluate((el) => getComputedStyle(el).backgroundColor)
    const headerBackground = await header.evaluate((el) => getComputedStyle(el).backgroundColor)

    expect(bandBackground).not.toMatch(TRANSPARENT)
    expect(bandBackground).toBe(headerBackground)

    // Still on screen after the scroll — the band belongs to the sticky wrapper.
    const box = await band.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeLessThan(200)
  })
})
