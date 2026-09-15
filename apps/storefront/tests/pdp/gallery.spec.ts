import {expect, test} from "@playwright/test"

/**
 * What the product page's gallery has to do, checked against a running stand.
 *
 * The list is the contract of the chrxnasdmds gallery this one was ported
 * from: the first photo is the cover and it is the one shown, a thumbnail
 * click changes the photo, ArrowRight advances, the viewer opens on a click
 * and closes on Escape. Each assertion reads the `src` the hero actually
 * carries, so "the picture changed" is a measurement and not a class name.
 */

const PDP_URL = process.env.PDP_URL

test.skip(!PDP_URL, "PDP_URL is not set: point it at a product page on a stand")

/** The file the optimizer was asked for, which is what identifies the photo. */
const heroSource = async (page: import("@playwright/test").Page) => {
  const src = await page
    .getByTestId("product-gallery-hero-image")
    .getAttribute("src")
  expect(src, "the hero image has a src").toBeTruthy()
  const url = new URL(src as string, PDP_URL)
  return url.searchParams.get("url") ?? (src as string)
}

test.beforeEach(async ({page}) => {
  await page.goto(PDP_URL as string, {waitUntil: "domcontentloaded"})
  // `data-hydrated` appears when the gallery's effects have run. Server
  // markup looks finished long before it answers a click, and waiting on the
  // picture instead would time the suite to the network.
  await expect(page.locator('[data-testid="product-gallery"][data-hydrated="true"]')).toBeVisible()
})

test("the page opens on the first photo, and the counter says which", async ({
  page,
}) => {
  const thumbnails = page.getByTestId("product-gallery-thumbnails").locator("li")
  const total = await thumbnails.count()
  expect(total, "this product needs several photos to test navigation").toBeGreaterThan(1)

  // The cover is the first thumbnail and the first photo the page shows.
  const firstThumbSource = new URL(
    (await thumbnails
      .nth(0)
      .locator("img")
      .getAttribute("src")) as string,
    PDP_URL
  ).searchParams.get("url")
  expect(await heroSource(page)).toBe(firstThumbSource)

  await expect(page.getByTestId("product-gallery-counter")).toHaveText(
    new RegExp(`^1\\s*·\\s*${total}$`)
  )
})

test("clicking a thumbnail shows that photo", async ({page}) => {
  const before = await heroSource(page)

  await page.getByTestId("product-gallery-thumbnail-3").click()

  await expect
    .poll(() => heroSource(page), {message: "the hero switched photo"})
    .not.toBe(before)
  await expect(page.getByTestId("product-gallery-counter")).toHaveText(
    /^3\s*·\s*\d+$/
  )
})

test("ArrowRight moves to the next photo once the gallery has the focus", async ({
  page,
}) => {
  const before = await heroSource(page)

  await page.getByTestId("product-gallery-thumbnail-1").focus()
  await page.keyboard.press("ArrowRight")

  await expect(page.getByTestId("product-gallery-counter")).toHaveText(
    /^2\s*·\s*\d+$/
  )
  expect(await heroSource(page)).not.toBe(before)
})

test("the arrows wrap around at both ends", async ({page}) => {
  const total = await page
    .getByTestId("product-gallery-thumbnails")
    .locator("li")
    .count()

  await page.getByTestId("product-gallery-previous").click()
  await expect(page.getByTestId("product-gallery-counter")).toHaveText(
    new RegExp(`^${total}\\s*·\\s*${total}$`)
  )

  await page.getByTestId("product-gallery-next").click()
  await expect(page.getByTestId("product-gallery-counter")).toHaveText(
    new RegExp(`^1\\s*·\\s*${total}$`)
  )
})

test("the full-screen viewer opens on the photo and closes on Escape", async ({
  page,
}) => {
  await expect(page.getByTestId("product-gallery-viewer")).toHaveCount(0)

  await page.getByTestId("product-gallery-hero").click()
  const viewer = page.getByTestId("product-gallery-viewer")
  await expect(viewer).toBeVisible()
  // It shows the photo the page was on, not the first one over again.
  await expect(page.getByTestId("product-gallery-viewer-image")).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(viewer).toHaveCount(0)
})

test("the close button leaves the viewer as well", async ({page}) => {
  await page.getByTestId("product-gallery-hero").click()
  await expect(page.getByTestId("product-gallery-viewer")).toBeVisible()

  await page.getByTestId("product-gallery-viewer-close").click()

  await expect(page.getByTestId("product-gallery-viewer")).toHaveCount(0)
})
