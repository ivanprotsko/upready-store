import { expect, test } from "@playwright/test"

/**
 * Where the blocks of the product page sit, checked against a running stand.
 *
 * The order is Ivan's Figma mockup's (t-2026-09-22-01-pdp-figma-layout): three cards
 * in a row — the photo on the left, the title, the rating and the first characteristics
 * in the centre, the buy card to the right — and the full description under the cards.
 * Positions are read from the boxes the browser actually laid out, so a change of grid
 * that happens to keep every class name still fails here.
 */

const PDP_URL = process.env.PDP_URL

test.skip(!PDP_URL, "PDP_URL is not set: point it at a product page on a stand")

/**
 * Boxes are read inside `product-container`. The related-products rail at the
 * bottom of the page reuses `product-title` on every card, so an unscoped
 * lookup matches a dozen elements and fails on strictness rather than on the
 * layout.
 */
const box = async (page: import("@playwright/test").Page, testId: string) => {
  const found = await page
    .getByTestId("product-container")
    .getByTestId(testId)
    .boundingBox()
  expect(found, `${testId} is laid out`).not.toBeNull()
  return found as NonNullable<typeof found>
}

test.beforeEach(async ({ page }) => {
  await page.goto(PDP_URL as string, { waitUntil: "domcontentloaded" })
  // `data-hydrated` appears when the gallery's effects have run. Server
  // markup looks finished long before it answers a click, and waiting on the
  // picture instead would time the suite to the network.
  await expect(
    page.locator('[data-testid="product-gallery"][data-hydrated="true"]')
  ).toBeVisible()
})

test("the gallery is left of the title, and both are above the description", async ({
  page,
}) => {
  const gallery = await box(page, "product-gallery")
  const title = await box(page, "product-title")
  const description = await box(page, "product-description-block")

  expect(gallery.x + gallery.width).toBeLessThanOrEqual(title.x + 1)
  expect(gallery.y).toBeLessThan(description.y)
  expect(title.y).toBeLessThan(description.y)
})

test("the characteristics sit under the rating, in the same column as the title", async ({
  page,
}) => {
  const title = await box(page, "product-title")
  const rating = await box(page, "product-rating")
  const attributes = await box(page, "product-attributes")

  expect(rating.y).toBeGreaterThan(title.y)
  expect(attributes.y).toBeGreaterThan(rating.y)
  // Same column: left edges within a few pixels of each other.
  expect(Math.abs(attributes.x - title.x)).toBeLessThan(4)
})

test("the description runs wider than the summary column", async ({ page }) => {
  const title = await box(page, "product-title")
  const description = await box(page, "product-description-block")

  expect(description.width).toBeGreaterThan(title.width)
})

test("the link next to the title scrolls to the description", async ({
  page,
}) => {
  await page
    .getByTestId("product-container")
    .getByTestId("product-description-link")
    .click()

  await expect
    .poll(async () => {
      const heading = await box(page, "product-description-heading")
      return heading.y
    })
    .toBeLessThan(400)
})

test("the rating links to the reviews block", async ({ page }) => {
  await expect(
    page.getByTestId("product-container").getByTestId("product-rating")
  ).toHaveAttribute("href", "#product-reviews")
  await expect(page.getByTestId("product-reviews")).toHaveCount(1)
})
