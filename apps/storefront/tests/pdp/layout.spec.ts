import { expect, test } from "@playwright/test"

/**
 * Where the blocks of the product page sit, checked against a running stand.
 *
 * The order is Ivan's Figma mockup's (t-2026-09-22-01-pdp-figma-layout): three cards
 * in a row — the photo on the left, the title, the rating, the first characteristics and
 * the description excerpt in the centre, the buy card to the right. All characteristics
 * and the whole description open in a drawer from the one button at the bottom of the
 * centre card (t-2026-09-23-01).
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

test("the gallery is left of the title, and both are above the description excerpt", async ({
  page,
}) => {
  const gallery = await box(page, "product-gallery")
  const title = await box(page, "product-title")
  const excerpt = await box(page, "product-description-excerpt")

  expect(gallery.x + gallery.width).toBeLessThanOrEqual(title.x + 1)
  expect(title.y).toBeLessThan(excerpt.y)
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

test("the centre card has one opener, under the excerpt, and no old links", async ({
  page,
}) => {
  const card = page.getByTestId("product-summary-card")
  await expect(card.getByTestId("product-details-opener")).toHaveCount(1)
  await expect(page.getByTestId("product-attributes-link")).toHaveCount(0)
  await expect(page.getByTestId("product-description-link")).toHaveCount(0)
  await expect(page.getByTestId("product-details")).toHaveCount(0)

  const excerpt = await box(page, "product-description-excerpt")
  const opener = await box(page, "product-details-opener")
  expect(opener.y).toBeGreaterThan(excerpt.y)
})

test("the opener shows the drawer; header and footer stay while the body scrolls; Esc closes it and focus returns", async ({
  page,
}) => {
  const opener = page
    .getByTestId("product-container")
    .getByTestId("product-details-opener")
  await opener.click()

  const drawer = page.getByTestId("product-details-drawer")
  await expect(drawer).toBeVisible()
  await expect(drawer.getByTestId("product-details-description")).toHaveCount(1)

  // Measure after the slide-in: mid-animation the footer is still moving.
  await drawer.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished))
  )
  const footer = drawer.getByTestId("product-details-drawer-footer")
  const before = await footer.boundingBox()
  await drawer
    .getByTestId("product-details-drawer-body")
    .evaluate((body) => body.scrollTo(0, body.scrollHeight))
  const after = await footer.boundingBox()
  expect(after?.y).toBe(before?.y)

  await page.keyboard.press("Escape")
  await expect(drawer).toHaveCount(0)
  await expect(opener).toBeFocused()
})

/**
 * t-2026-10-12-06, Ivan 12.10.2026: «4. панель с харектеристиками и описанием продукта нужно
 * показывать справа», «4.1. и похоже в этой панели не работает кнопка "в корзину"», «5. убери
 * кнопку "купить" везде».
 */
const openDrawer = async (page: import("@playwright/test").Page) => {
  await page
    .getByTestId("product-container")
    .getByTestId("product-details-opener")
    .click()
  const drawer = page.getByTestId("product-details-drawer")
  await expect(drawer).toBeVisible()
  await drawer.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished))
  )
  return drawer
}

test("the drawer is a card on the right edge, with the page dimmed on its left", async ({
  page,
}) => {
  const drawer = await openDrawer(page)
  const found = await drawer.boundingBox()
  const width = page.viewportSize()?.width ?? 0

  expect(found).not.toBeNull()
  const card = found as NonNullable<typeof found>
  // 8 px from the right edge, as from the top and the bottom.
  expect(Math.abs(card.x + card.width - (width - 8))).toBeLessThanOrEqual(1)
  expect(card.x).toBeGreaterThan(width / 2)
  expect(card.width).toBeLessThanOrEqual(640)
})

test("«В корзину» in the drawer closes it and opens the cart sidebar with the line", async ({
  page,
}) => {
  const drawer = await openDrawer(page)
  const add = drawer.getByTestId("product-details-add")
  await expect(add).toBeEnabled()
  await add.click()

  await expect(drawer).toHaveCount(0)
  const sidebar = page.getByTestId("cart-sidebar")
  await expect(sidebar).toBeVisible()
  await expect(sidebar.getByTestId("cart-sidebar-empty")).toHaveCount(0)
})

test("no «Купить» button on the page, nor in the drawer", async ({ page }) => {
  await expect(page.getByTestId("buy-now-button")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Купить", exact: true })).toHaveCount(0)

  const drawer = await openDrawer(page)
  await expect(drawer.getByTestId("product-details-buy-now")).toHaveCount(0)
  await expect(drawer.getByRole("button")).toHaveCount(2) // the X and «В корзину»
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("the drawer takes the whole screen", async ({ page }) => {
    const drawer = await openDrawer(page)
    const found = await drawer.boundingBox()

    expect(found).toEqual({ x: 0, y: 0, width: 390, height: 844 })
  })

  test("«В корзину» in the drawer closes it, so the page shows the line in the cart", async ({
    page,
  }) => {
    const drawer = await openDrawer(page)
    await drawer.getByTestId("product-details-add").click()

    await expect(drawer).toHaveCount(0)
    await expect(page.getByTestId("in-cart-stepper").first()).toBeVisible()
  })
})

test("the rating links to the reviews block", async ({ page }) => {
  await expect(
    page.getByTestId("product-container").getByTestId("product-rating")
  ).toHaveAttribute("href", "#product-reviews")
  await expect(page.getByTestId("product-reviews")).toHaveCount(1)
})
