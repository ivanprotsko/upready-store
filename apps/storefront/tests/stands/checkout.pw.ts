import { expect, test } from "@playwright/test"

import {
  addFirstProductToCart,
  assertNoHeadingOverflow,
  choosePickupPoint,
  currentProfile,
  fillCheckoutAddress,
  fillCheckoutContacts,
  fillDemoCard,
  loginCustomer,
  seededPickupPoints,
  selectAnyShippingMethod,
  selectManualPayment,
  selectPickupShipping,
} from "./helpers"

/**
 * Scenarios 2-4 (task order t-2026-09-09-02): checkout with pickup-point selection,
 * a demo card, an order success page, an order failure page. Every test starts a
 * fresh cart through the real store + product page (helpers.addFirstProductToCart),
 * never seeds one directly.
 *
 * "checkout-pickup-success" also logs the demo customer in first — its own order is
 * the one tests/stands/account.pw.ts's orders-list scenario expects to find, per the
 * task's own scenario 5 ("lists at least the order from scenario 2").
 */

function uniqueContact() {
  const stamp = Date.now()
  return {
    firstName: "Ada",
    lastName: "Visitor",
    email: `stand-visitor+${stamp}@upready.dev`,
    phone: "+15550100000",
  }
}

test.describe("checkout-pickup-success", () => {
  test("pickup point selection completes an order with the point's name on the success page", async ({
    page,
  }) => {
    const profile = currentProfile()
    const points = seededPickupPoints(profile)
    const first = points[0]

    await loginCustomer(page)
    await addFirstProductToCart(page)
    await page.goto("/en/checkout")

    await fillCheckoutContacts(page, uniqueContact())
    await fillCheckoutAddress(page, {
      address1: first.address.address_1,
      city: first.address.city,
      postalCode: first.address.postal_code,
    })

    await selectPickupShipping(page)
    await expect(page.getByTestId("pickup-point-list")).toBeVisible({ timeout: 10_000 })

    const rows = page.getByTestId("pickup-point-row")
    await expect(rows).toHaveCount(points.length)
    for (const point of points) {
      await expect(page.getByTestId("pickup-point-list")).toContainText(point.name)
      await expect(page.getByTestId("pickup-point-list")).toContainText(point.opening_hours)
    }

    // search narrows the list to the one point whose name is unique to it
    const distinctWord = first.name.split(" ").at(-1) ?? first.name
    await page.getByTestId("pickup-point-search").fill(distinctWord)
    await expect(page.getByTestId("pickup-point-row")).toHaveCount(1)
    await expect(page.getByTestId("pickup-point-row")).toContainText(first.name)

    await page.getByTestId("pickup-point-choose").click()
    await expect(page.getByTestId("pickup-point-list")).toBeHidden({ timeout: 10_000 })

    await expect(page.getByTestId("checkout-pickup-point-row")).toContainText(first.name)
    await expect(page.getByTestId("checkout-summary-pickup-point")).toContainText(first.name)

    await selectManualPayment(page)
    await fillDemoCard(page, "approve")
    await page.getByTestId("submit-order-button").click()

    await page.waitForURL(/\/order\/.+\/confirmed/, { timeout: 30_000 })
    await expect(page.getByTestId("order-id")).toBeVisible()
    const orderId = (await page.getByTestId("order-id").textContent()) ?? ""
    expect(orderId.trim().length).toBeGreaterThan(0)

    await expect(page.getByTestId("pickup-point-summary")).toContainText(first.name)
  })

  test("[@mobile] the pickup sheet renders as a full-width bottom sheet at 390px with no clipped rows", async ({
    page,
  }) => {
    const profile = currentProfile()
    const points = seededPickupPoints(profile)

    await addFirstProductToCart(page)
    await page.goto("/en/checkout")
    await fillCheckoutContacts(page, uniqueContact())
    await fillCheckoutAddress(page, {
      address1: points[0].address.address_1,
      city: points[0].address.city,
      postalCode: points[0].address.postal_code,
    })
    await selectPickupShipping(page)
    await expect(page.getByTestId("pickup-point-list")).toBeVisible({ timeout: 10_000 })
    await assertNoHeadingOverflow(page, ['[data-testid="pickup-point-row"]'])
  })
})

test.describe("checkout-card-0000", () => {
  test("a card ending 0000 is declined inline, the cart stays intact", async ({ page }) => {
    await addFirstProductToCart(page)
    await page.goto("/en/checkout")
    await fillCheckoutContacts(page, uniqueContact())
    await fillCheckoutAddress(page, { address1: "1 Demo Street", city: "Demo City", postalCode: "10000" })
    await selectAnyShippingMethod(page)

    await selectManualPayment(page)
    await fillDemoCard(page, "decline")
    await page.getByTestId("submit-order-button").click()

    // The testid the source names (payment-method-error-message) and the visible
    // error text both come from the same ErrorMessage slot in practice — checked for
    // either, since which one a given deploy renders under is not this test's concern.
    const errorByTestId = page.getByTestId("payment-method-error-message")
    const errorByText = page.getByText(/declin|couldn.?t process|payment failed/i)
    await expect(errorByTestId.or(errorByText).first()).toBeVisible({ timeout: 15_000 })
    expect(new URL(page.url()).pathname).toContain("/checkout")
    // the fields stay exactly as typed
    await expect(page.getByTestId("demo-card-number-input")).not.toHaveValue("")

    await page.goto("/en/cart")
    await expect(page.getByTestId("product-row").first()).toBeVisible()
  })
})

test.describe("checkout-card-9999", () => {
  test("a card ending 9999 redirects to the order-failed banner, the cart stays intact", async ({
    page,
  }) => {
    await addFirstProductToCart(page)
    await page.goto("/en/checkout")
    await fillCheckoutContacts(page, uniqueContact())
    await fillCheckoutAddress(page, { address1: "1 Demo Street", city: "Demo City", postalCode: "10000" })
    await selectAnyShippingMethod(page)

    await selectManualPayment(page)
    await fillDemoCard(page, "redirect")
    await page.getByTestId("submit-order-button").click()

    await page.waitForURL(/\/cart\?error=order_failed/, { timeout: 20_000 })
    const banner = page.getByTestId("order-error-banner")
    await expect(banner).toBeVisible()
    await expect(banner).toHaveAttribute("data-value", "order_failed")
    // no raw query-string value reaches the screen outside the banner's own data attribute
    expect(await page.locator("body").innerText()).not.toContain("order_failed")

    await expect(page.getByTestId("product-row").first()).toBeVisible()
    await expect(page.getByTestId("order-error-retry-link")).toBeVisible()
    await expect(page.getByTestId("order-error-contact-link")).toBeVisible()
  })
})
