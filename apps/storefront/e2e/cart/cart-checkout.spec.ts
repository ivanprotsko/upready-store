import { expect, test as base, type Page } from "@playwright/test"

/**
 * Cart → checkout suite (t-2026-09-24-n1), tenant cherkashino, locale ru.
 *
 * Four tests share one PAGE (`sharedPage`, opened once in `beforeAll`) so the
 * cart built in test 1 is still there in test 4: the storefront keeps the cart
 * in a cookie, and the default `page` fixture is a fresh context — and so a
 * fresh cart — per test even under `test.describe.configure({ mode: "serial"
 * })`, which only orders tests and stops the file on a failure. The shared
 * page still needs the project's own viewport (`browser.newPage()` does not
 * inherit it from `playwright.config.ts`), read off `testInfo.project.use`.
 * Screenshot baselines live in `cart-checkout.spec.ts-snapshots/` next to this
 * file (Playwright's default), one pair per name for the `desktop-1440` and
 * `mobile-390` projects.
 *
 * The two products come from cherkashino's own catalog (svechi-asd… and
 * troychatka-plyus…), not invented handles — see `docs` in the PR body for how
 * they were found. Everything here runs against a backend the worker points at
 * its OWN database clone (`apps/backend/README.md#e2e`); never against the
 * shared stand.
 */

const PRODUCT_A = "svechi-asd-s-chesnokom-10-sht-cherkashino"
const PRODUCT_B = "troychatka-plyus-60-kapsul-cherkashino"

const productUrl = (handle: string) => `/ru/products/${handle}`

/** A fresh Luhn-valid demo card, far in the future, that `classifyDemoCard` treats as a real (non-decline, non-fail) payment — see `src/lib/demo-card.ts`. */
const DEMO_CARD = { number: "4111111111111111", expiry: "1230", cvc: "123" }

const saveSheet = async (page: Page) => {
  // The sheet has no data-testid of its own (headlessui's Dialog wrapper measures
  // as hidden to Playwright mid-transition); the save button's accessible name is
  // unique on the page while a sheet is open, in both locales the suite touches.
  await page.getByRole("button", { name: /Сохранить|Save/i }).last().click()
}

let sharedPage: Page
const test = base.extend<{ page: Page }>({
  // eslint-disable-next-line no-empty-pattern
  page: async ({}, use) => {
    await use(sharedPage)
  },
})

test.describe.configure({ mode: "serial" })

test.describe("cart and checkout", () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    sharedPage = await browser.newPage({
      viewport: (testInfo.project.use.viewport as { width: number; height: number } | null) ?? null,
      baseURL: testInfo.project.use.baseURL,
    })
  })

  test.afterAll(async () => {
    await sharedPage.close()
  })

  test("product page: adding to cart updates the cart counter", async ({ page }) => {
    await page.goto(productUrl(PRODUCT_A), { waitUntil: "domcontentloaded" })
    await page.locator("[data-testid=add-product-button]:not([disabled])").waitFor({ state: "visible" })
    // The counter badge only exists once the cart is non-empty, so absence here
    // is the baseline the rest of the test asserts a change against.
    await expect(page.locator("[data-testid=cart-item-count]")).toHaveCount(0)

    await expect(page).toHaveScreenshot("product-page.png", { fullPage: true })

    await page.locator("[data-testid=add-product-button]:not([disabled])").click()
    await expect(page.locator("[data-testid=cart-item-count]").first()).toHaveText("1")
  })

  test("cart page: the line is shown, quantity moves it and the remove button clears an added line", async ({
    page,
  }) => {
    await page.goto("/ru/cart", { waitUntil: "domcontentloaded" })
    await page.locator("[data-testid=cart-container]").waitFor({ state: "visible" })
    await expect(page.locator("[data-testid=product-row]")).toHaveCount(1)

    await expect(page).toHaveScreenshot("cart-page.png", { fullPage: true })

    const subtotalBefore = Number(
      await page.locator("[data-testid=cart-subtotal]").getAttribute("data-value")
    )

    // Quantity +/-: same line, its own unit price times the new quantity.
    await page.locator("[data-testid=increase-qty-button]").click()
    await expect(page.locator("[data-testid=product-unit-price]")).toContainText("2 x")
    await expect
      .poll(async () =>
        Number(await page.locator("[data-testid=cart-subtotal]").getAttribute("data-value"))
      )
      .toBe(subtotalBefore * 2)

    await page.locator("[data-testid=decrease-qty-button]").click()
    await expect
      .poll(async () =>
        Number(await page.locator("[data-testid=cart-subtotal]").getAttribute("data-value"))
      )
      .toBe(subtotalBefore)

    // Remove: add a second, different line, then remove it — this line stays,
    // so the checkout test below still has something to buy.
    await page.goto(productUrl(PRODUCT_B), { waitUntil: "domcontentloaded" })
    await page.locator("[data-testid=add-product-button]:not([disabled])").waitFor({ state: "visible" })
    await page.locator("[data-testid=add-product-button]:not([disabled])").click()
    await expect(page.locator("[data-testid=cart-item-count]").first()).toHaveText("2")

    await page.goto("/ru/cart", { waitUntil: "domcontentloaded" })
    await expect(page.locator("[data-testid=product-row]")).toHaveCount(2)

    const secondRow = page.locator("[data-testid=product-row]").filter({ hasText: "Тройчатка" })
    await secondRow.locator("[data-testid=product-delete-button]").click()

    await expect(page.locator("[data-testid=product-row]")).toHaveCount(1)
    await expect
      .poll(async () =>
        Number(await page.locator("[data-testid=cart-subtotal]").getAttribute("data-value"))
      )
      .toBe(subtotalBefore)
  })

  test("checkout: address, delivery and payment are reachable, and the order places with the local manual payment provider", async ({
    page,
  }) => {
    await page.goto("/ru/checkout?step=address", { waitUntil: "domcontentloaded" })
    await page.locator("[data-testid=checkout-address-row]").waitFor({ state: "visible" })

    // Address sheet.
    await page.locator("[data-testid=checkout-address-row]").click()
    await page.locator('input[name="address_1"]').waitFor({ state: "visible" })
    await page.locator('input[name="address_1"]').fill("ул. Тестовая, д. 10")
    await page.locator('input[name="postal_code"]').fill("101000")
    await page.locator("[data-testid=address-city-suggest]").fill("Москва")
    const provinceSelect = page.locator("[data-testid=address-province-select]")
    if (await provinceSelect.count()) {
      const value = await provinceSelect.locator("option").nth(1).getAttribute("value")
      await provinceSelect.selectOption(value ?? "")
    }
    await saveSheet(page)
    await expect(page.locator("[data-testid=checkout-address-row]")).toContainText("Тестовая")

    // Contacts sheet.
    await page.locator("[data-testid=checkout-contacts-row]").click()
    await page.locator("[data-testid=shipping-first-name-input]").waitFor({ state: "visible" })
    await page.locator("[data-testid=shipping-first-name-input]").fill("Иван")
    await page.locator("[data-testid=shipping-last-name-input]").fill("Тестов")
    await page.locator("[data-testid=shipping-email-input]").fill("e2e-cart-checkout@example.test")
    await page.locator("[data-testid=shipping-phone-input]").fill("+79991234567")
    await saveSheet(page)
    await expect(page.locator("[data-testid=checkout-contacts-row]")).toContainText("Иван")

    await expect(page).toHaveScreenshot("checkout-step-address.png", { fullPage: true })

    // Delivery: whichever method the tenant lists first — the suite does not
    // assume a specific one, only that picking it is reachable and it applies.
    const firstDelivery = page.locator("[data-testid=delivery-option-radio]").first()
    await firstDelivery.click()
    await expect(firstDelivery.getByRole("radio")).toHaveAttribute("aria-checked", "true")

    await expect(page).toHaveScreenshot("checkout-step-delivery.png", { fullPage: true })

    // Payment: the local manual provider (`pp_system_default`, the only one
    // configured on this stand — DATA SAFETY note at the top of this file).
    await page.locator("[data-testid=payment-method-pp_system_default]").click()
    await page.locator("[data-testid=demo-card-fields]").waitFor({ state: "visible" })
    await page.locator("[data-testid=demo-card-number-input]").fill(DEMO_CARD.number)
    await page.locator("[data-testid=demo-card-expiry-input]").fill(DEMO_CARD.expiry)
    await page.locator("[data-testid=demo-card-cvc-input]").fill(DEMO_CARD.cvc)

    await expect(page).toHaveScreenshot("checkout-step-payment.png", { fullPage: true })

    const submit = page.locator("[data-testid=submit-order-button]")
    await expect(submit).toBeEnabled()
    await submit.click()

    await page.waitForURL(/\/order\/.+\/confirmed/, { timeout: 20_000 })
    await page.locator("[data-testid=order-complete-container]").waitFor({ state: "visible" })

    await expect(page).toHaveScreenshot("checkout-order-confirmed.png", {
      fullPage: true,
      mask: [
        page.locator("[data-testid=order-date]"),
        page.locator("[data-testid=order-id]"),
        page.locator("[data-testid=payment-amount]"),
      ],
    })
  })

  test("cart: placing the order leaves the cart empty", async ({ page }) => {
    await page.goto("/ru/cart", { waitUntil: "domcontentloaded" })
    await page.locator("[data-testid=empty-cart-message]").waitFor({ state: "visible" })
    await expect(page.locator("[data-testid=product-row]")).toHaveCount(0)

    await expect(page).toHaveScreenshot("cart-empty.png", { fullPage: true })
  })
})
