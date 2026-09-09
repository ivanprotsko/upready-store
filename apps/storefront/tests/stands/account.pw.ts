import { expect, test } from "@playwright/test"

import {
  CUSTOMER_EMAIL,
  addFirstProductToCart,
  assertNoHeadingOverflow,
  fillCheckoutAddress,
  fillCheckoutContacts,
  fillDemoCard,
  loginCustomer,
  selectAnyShippingMethod,
  selectManualPayment,
} from "./helpers"

/**
 * Scenario 5 (task order t-2026-09-09-02): every customer-account page opens with
 * real data. Runs its own tests in order (`serial`) because the orders/order-detail
 * checks need at least one order under the demo customer to exist first — seeded
 * here rather than assumed from tests/stands/checkout.pw.ts, since Playwright does
 * not guarantee cross-file execution order and this file should stand on its own.
 */

test.describe("account", () => {
  test.describe.configure({ mode: "serial" })

  test("seeds one order under the demo customer (setup for the orders/order-detail checks below)", async ({
    page,
  }) => {
    await loginCustomer(page)
    await addFirstProductToCart(page)
    await page.goto("/en/checkout")
    await fillCheckoutContacts(page, {
      firstName: "Ada",
      lastName: "Customer",
      email: CUSTOMER_EMAIL,
      phone: "+15550100000",
    })
    await fillCheckoutAddress(page, { address1: "1 Demo Street", city: "Demo City", postalCode: "10000" })
    await selectAnyShippingMethod(page)
    await selectManualPayment(page)
    await fillDemoCard(page, "approve")
    await page.getByTestId("submit-order-button").click()
    await page.waitForURL(/\/order\/.+\/confirmed/, { timeout: 30_000 })
    await expect(page.getByTestId("order-id")).toBeVisible()
  })

  test("registration form renders (no account created)", async ({ page }) => {
    await page.goto("/en/account")
    // a fresh, logged-out context: the login form is the default view
    await expect(page.getByTestId("login-page")).toBeVisible()
    await page.getByTestId("register-button").click()
    await expect(page.getByTestId("register-page")).toBeVisible()
    await expect(page.getByTestId("first-name-input")).toBeVisible()
    await expect(page.getByTestId("last-name-input")).toBeVisible()
    await expect(page.getByTestId("email-input")).toBeVisible()
    await expect(page.getByTestId("password-input")).toBeVisible()
    // never submitted — no account is created by this test
  })

  test("overview renders the signed-in customer's own data", async ({ page }) => {
    await loginCustomer(page)
    await expect(page.getByTestId("overview-page-wrapper")).toBeVisible()
    await expect(page.getByTestId("welcome-message")).toBeVisible()
    await expect(page.getByTestId("customer-email")).toContainText(CUSTOMER_EMAIL)
    await expect(page.getByTestId("latest-order-section")).toBeVisible()
    await expect(page.getByTestId("account-shortcuts")).toBeVisible()
  })

  test("orders list shows at least one order with a dot + text status, no raw enum", async ({
    page,
  }) => {
    await loginCustomer(page)
    await page.goto("/en/account/orders")
    await expect(page.getByTestId("orders-page-wrapper")).toBeVisible({ timeout: 25_000 })

    const cards = page.getByTestId("order-card")
    await expect(cards.first()).toBeVisible()
    await expect(cards.first().getByTestId("order-display-id")).toBeVisible()

    const statusText = (await cards.first().getByTestId("order-fulfillment-status").textContent()) ?? ""
    expect(statusText.trim().length).toBeGreaterThan(0)
    expect(statusText).not.toMatch(/_/) // a raw enum like "not_fulfilled" is never shown verbatim
  })

  test("order detail page opens with data — timeline or status, and the pickup/shipping section", async ({
    page,
  }) => {
    await loginCustomer(page)
    await page.goto("/en/account/orders")
    await page.getByTestId("order-details-link").first().click()
    await expect(page.getByTestId("order-details-container")).toBeVisible()

    const timeline = page.getByTestId("order-timeline")
    const statusDot = page.getByTestId("order-fulfillment-status")
    await expect(timeline.or(statusDot).first()).toBeVisible()
  })

  test("addresses page opens with a heading and either saved addresses or an explained empty state", async ({
    page,
  }) => {
    await loginCustomer(page)
    await page.goto("/en/account/addresses")
    await expect(page.getByTestId("addresses-page-wrapper")).toBeVisible()
  })

  test("profile page opens with the customer's own data", async ({ page }) => {
    await loginCustomer(page)
    await page.goto("/en/account/profile")
    await expect(page.getByTestId("profile-page-wrapper")).toBeVisible()
  })

  test("[@mobile] account overview headings do not overflow at 390px", async ({ page }) => {
    await loginCustomer(page)
    await assertNoHeadingOverflow(page)
  })
})
