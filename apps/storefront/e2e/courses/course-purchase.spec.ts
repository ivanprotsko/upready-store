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

// `pp_system_default`'s own `authorizePayment` returns AUTHORIZED, never
// CAPTURED (`@medusajs/payment`'s `SystemPaymentProvider`) — placing the
// order never fires `payment.captured`, so `grant-course-on-paid` never runs
// on its own (found live: the course stayed locked after a successful
// checkout). The tenant admin capturing the payment from the panel is what
// actually fires it; this calls the same API that panel button does
// (`POST /tenants/payments/:id/capture`), standing in for that click.
const BACKEND_URL = process.env.E2E_EXPECTED_BACKEND_URL ?? "http://localhost:9131"
const OWNER_EMAIL = "owner-cherkashino@example.test"
// Set by `apps/backend/scripts/fixtures/o24-reset-owner-password.ts`, which
// must have been run against this suite's own database beforehand — this
// suite does not run backend fixtures itself, same as it relies on
// `o24-seed-courses.ts` / `o24-seed-digital-shipping-option.ts` already
// having seeded the course and its shipping option.
const OWNER_PASSWORD = "o24-courses-manual-check"

const saveSheet = async (page: Page) => {
  await page
    .getByRole("button", { name: /Сохранить|Save/i })
    .last()
    .click()
}

const captureOrderPayment = async (page: Page, orderId: string) => {
  const login = await page.request.post(`${BACKEND_URL}/auth/tenant/emailpass`, {
    data: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
  })
  const { token } = (await login.json()) as { token: string }

  const orderResponse = await page.request.get(
    `${BACKEND_URL}/tenants/orders/${orderId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const { order } = (await orderResponse.json()) as {
    order: {
      payment_collections?: { payments?: { id: string }[] }[]
    }
  }
  const paymentId = order.payment_collections?.[0]?.payments?.[0]?.id
  if (!paymentId) {
    throw new Error(`captureOrderPayment: order ${orderId} has no payment to capture`)
  }

  const capture = await page.request.post(
    `${BACKEND_URL}/tenants/payments/${paymentId}/capture`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!capture.ok()) {
    throw new Error(
      `captureOrderPayment: capture failed with ${capture.status()}: ${await capture.text()}`
    )
  }
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
      locale: testInfo.project.use.locale,
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

    // Scoped to product-buy-card: the mobile sticky action bar
    // (`mobile-actions.tsx`) can mount its OWN add-product-button in the same
    // DOM depending on scroll/intersection state, and the unscoped locator
    // then hits Playwright's strict-mode violation (found live, flaky on
    // first run).
    const addToCartButton = page
      .getByTestId("product-buy-card")
      .locator("[data-testid=add-product-button]:not([disabled])")
    await addToCartButton.waitFor({ state: "visible" })
    await addToCartButton.click()
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
    // Waiting for the row to reflect the save (not just the button click) is
    // what actually waits out the sheet's closing transition — without it the
    // next click lands while headlessui's portal still intercepts pointer
    // events (found live: `cart-checkout.spec.ts` does the same after every
    // `saveSheet`).
    await expect(page.getByTestId("checkout-contacts-row")).toContainText(
      "Ирина"
    )

    // No billing address step: "Платежный адрес совпадает с адресом доставки"
    // is checked by default and stays that way here (same as
    // `cart-checkout.spec.ts`, which never touches billing either) — billing
    // ends up the same blanked-but-named address `ensureDigitalDelivery` put
    // on shipping, which is enough for `completeCartWorkflow`.
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

    // 04.10 checklist C1: the pay button waits for the personal-data consent.
    await page.locator("[data-testid=consent-personal-data]").click()
    const submit = page.locator("[data-testid=submit-order-button]")
    await expect(submit).toBeEnabled()
    await submit.click()

    await page.waitForURL(/\/order\/.+\/confirmed/, { timeout: 20_000 })
    await page
      .locator("[data-testid=order-complete-container]")
      .waitFor({ state: "visible" })

    const orderId = page.url().match(/\/order\/([^/]+)\/confirmed/)?.[1]
    if (!orderId) {
      throw new Error(`Could not read the order id from ${page.url()}`)
    }
    await captureOrderPayment(page, orderId)
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
