import { expect, test as base, type Page } from "@playwright/test"
import { mkdirSync } from "node:fs"

/**
 * Course purchase suite (o24-courses part (e)), tenant cherkashino, locale ru:
 * buy the liver course → checkout skips the delivery step entirely (digital
 * cart) → the lesson opens → «Отметить просмотренным» → progress shows on
 * «Мои курсы». Same shared-page structure as `e2e/cart/cart-checkout.spec.ts`
 * (read that file's header for why) — DATA SAFETY note there applies here too:
 * never point `E2E_BASE_URL` at a storefront backed by the shared stand
 * database.
 *
 * Also produces the screenshots owed from courses-1 (backend/panel PR #139's
 * own gap): the storefront course block and the lesson player, at both
 * projects' widths, written straight into the artifacts path Ivan named
 * rather than Playwright's own visual-diff snapshot folder — these are a
 * deliverable, not a baseline to compare future runs against.
 */

const PRODUCT_HANDLE = "course-ochishchenie-pecheni"
const COURSE_TOTAL_LESSONS = 20

const ARTIFACTS_DIR =
  "/Users/ivanprotsko/upready/projects/upready-store/artifacts/docs/o-20260921-01/night-20260924/w4"

const DEMO_CARD = { number: "4111111111111111", expiry: "1230", cvc: "123" }

const saveSheet = async (page: Page) => {
  await page
    .getByRole("button", { name: /Сохранить|Save/i })
    .last()
    .click()
}

let sharedPage: Page
let buyerEmail: string
const test = base.extend<{ page: Page }>({
  // eslint-disable-next-line no-empty-pattern
  page: async ({}, use) => {
    await use(sharedPage)
  },
})

test.describe.configure({ mode: "serial" })

test.describe("course purchase", () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    mkdirSync(ARTIFACTS_DIR, { recursive: true })
    sharedPage = await browser.newPage({
      viewport:
        (testInfo.project.use.viewport as {
          width: number
          height: number
        } | null) ?? null,
      baseURL: testInfo.project.use.baseURL,
    })
    buyerEmail = `e2e-course-${
      testInfo.project.name
    }-${Date.now()}@example.test`
  })

  test.afterAll(async () => {
    await sharedPage.close()
  })

  test("registers a fresh customer and logs in", async ({ page }) => {
    await page.goto("/ru/account", { waitUntil: "domcontentloaded" })
    await page.getByTestId("login-page").waitFor({ state: "visible" })
    await page.getByTestId("register-button").click()
    await page.getByTestId("register-page").waitFor({ state: "visible" })

    await page.getByTestId("first-name-input").fill("Ирина")
    await page.getByTestId("last-name-input").fill("Курсова")
    await page.getByTestId("email-input").fill(buyerEmail)
    await page.getByTestId("phone-input").fill("+79995554433")
    await page.getByTestId("password-input").fill("Sup3rSecret!")
    await page.getByTestId("register-button").click()

    await page
      .getByTestId("overview-page-wrapper")
      .waitFor({ state: "visible", timeout: 20_000 })
  })

  test("product page: every lesson is locked before purchase, then adds the course to cart", async ({
    page,
  }, testInfo) => {
    await page.goto(`/ru/products/${PRODUCT_HANDLE}`, {
      waitUntil: "domcontentloaded",
    })
    await page.getByTestId("course-block").waitFor({ state: "visible" })

    const lessonRows = page.getByTestId("course-lesson-row")
    await expect(lessonRows).toHaveCount(COURSE_TOTAL_LESSONS)
    // Locked: rendered as a plain row, not a link — no lesson is clickable yet.
    await expect(page.getByTestId("course-block").locator("a")).toHaveCount(0)
    await expect(page.getByTestId("course-block-progress")).toHaveCount(0)

    await page.screenshot({
      path: `${ARTIFACTS_DIR}/storefront-course-page-${testInfo.project.name}.png`,
      fullPage: true,
    })

    await page
      .locator("[data-testid=add-product-button]:not([disabled])")
      .waitFor({ state: "visible" })
    await page
      .locator("[data-testid=add-product-button]:not([disabled])")
      .click()
    await expect(
      page.locator("[data-testid=cart-item-count]").first()
    ).toHaveText("1")
  })

  test("checkout: no delivery step for an all-digital cart, order places on the manual payment provider", async ({
    page,
  }, testInfo) => {
    await page.goto("/ru/checkout", { waitUntil: "domcontentloaded" })
    await page
      .getByTestId("checkout-contacts-row")
      .waitFor({ state: "visible" })

    // The whole point of o24-courses part (c): no address row, no pickup row,
    // no shipping-method picker at all for a cart of only digital products.
    await expect(
      page.locator("[data-testid=checkout-address-row]")
    ).toHaveCount(0)
    await expect(
      page.locator("[data-testid=checkout-pickup-point-row]")
    ).toHaveCount(0)
    await expect(
      page.locator("[data-testid=delivery-option-radio]")
    ).toHaveCount(0)

    await page.getByTestId("checkout-contacts-row").click()
    await page
      .getByTestId("shipping-first-name-input")
      .waitFor({ state: "visible" })
    await page.getByTestId("shipping-first-name-input").fill("Ирина")
    await page.getByTestId("shipping-last-name-input").fill("Курсова")
    await page.getByTestId("shipping-email-input").fill(buyerEmail)
    await page.getByTestId("shipping-phone-input").fill("+79995554433")
    await saveSheet(page)

    // Billing has nothing to copy "same as shipping" from (the digital cart's
    // shipping address carries no street), so this fills it directly rather
    // than toggling that checkbox.
    await page.getByRole("button", { name: /Изменить|Edit/i }).click()
    await page.locator('input[name="address_1"]').waitFor({ state: "visible" })
    await page.locator('input[name="address_1"]').fill("ул. Тестовая, д. 10")
    await page.locator('input[name="postal_code"]').fill("101000")
    await page.locator('input[name="city"]').fill("Москва")
    const provinceSelect = page.locator("[data-testid=address-province-select]")
    if (await provinceSelect.count()) {
      const value = await provinceSelect
        .locator("option")
        .nth(1)
        .getAttribute("value")
      await provinceSelect.selectOption(value ?? "")
    }
    await saveSheet(page)

    await page.locator("[data-testid=payment-method-pp_system_default]").click()
    await page
      .locator("[data-testid=demo-card-fields]")
      .waitFor({ state: "visible" })
    await page
      .locator("[data-testid=demo-card-number-input]")
      .fill(DEMO_CARD.number)
    await page
      .locator("[data-testid=demo-card-expiry-input]")
      .fill(DEMO_CARD.expiry)
    await page.locator("[data-testid=demo-card-cvc-input]").fill(DEMO_CARD.cvc)

    await page.screenshot({
      path: `${ARTIFACTS_DIR}/storefront-checkout-digital-${testInfo.project.name}.png`,
      fullPage: true,
    })

    const submit = page.locator("[data-testid=submit-order-button]")
    await expect(submit).toBeEnabled()
    await submit.click()

    await page.waitForURL(/\/order\/.+\/confirmed/, { timeout: 20_000 })
    await page
      .locator("[data-testid=order-complete-container]")
      .waitFor({ state: "visible" })
  })

  test("product page: the course is unlocked and the lesson player marks progress", async ({
    page,
  }, testInfo) => {
    await page.goto(`/ru/products/${PRODUCT_HANDLE}`, {
      waitUntil: "domcontentloaded",
    })
    await page
      .getByTestId("course-block-progress")
      .waitFor({ state: "visible" })

    const firstLesson = page
      .getByTestId("course-lesson-row")
      .first()
      .locator("a")
    await firstLesson.waitFor({ state: "visible" })
    await firstLesson.click()

    await page.getByTestId("lesson-viewed-button").waitFor({ state: "visible" })
    await expect(page.locator("p.whitespace-pre-line")).not.toHaveText("")

    await page.screenshot({
      path: `${ARTIFACTS_DIR}/storefront-lesson-player-${testInfo.project.name}.png`,
      fullPage: true,
    })

    await page.getByTestId("lesson-viewed-button").click()
    await expect(page.getByTestId("lesson-viewed-button")).toBeDisabled({
      timeout: 10_000,
    })

    await page.goto("/ru/account/courses", { waitUntil: "domcontentloaded" })
    await page.getByTestId("my-courses-list").waitFor({ state: "visible" })
    await expect(page.getByTestId("my-course-card")).toContainText(
      `1/${COURSE_TOTAL_LESSONS}`
    )

    await page.screenshot({
      path: `${ARTIFACTS_DIR}/storefront-my-courses-${testInfo.project.name}.png`,
      fullPage: true,
    })
  })
})
