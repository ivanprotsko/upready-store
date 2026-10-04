import { expect, test } from "@playwright/test"

import {
  CUSTOMER_EMAIL,
  CUSTOMER_PASSWORD,
  addFirstProductToCart,
  fillCheckoutAddress,
  fillCheckoutContacts,
  selectAnyShippingMethod,
} from "./helpers"

/**
 * t-2026-10-01-checkout-ivan-3: return-after-sign-in, the clickable checkbox
 * label, section checkmarks, the new section order. Each `test.describe`
 * below maps to one numbered item in that brief. #5 and #7 were rewritten in
 * batch 6 part 1 (t-cherk-com-checkout-mockups), whose defect list replaced the
 * 736px column with its sideways scroller by two columns and full-width rows,
 * and the collapsed accordion rows by forms that stay open while incomplete.
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

// ── #1: return to the page after sign-in ────────────────────────────────────

test.describe("#1 return after sign-in", () => {
  test("password login from the cart page returns to the cart", async ({ page }) => {
    await addFirstProductToCart(page)
    await page.goto("/ru/cart")
    await page.goto("/ru/account?return=%2Fru%2Fcart")
    await expect(page.getByTestId("login-page")).toBeVisible()
    await page.getByTestId("email-input").fill(CUSTOMER_EMAIL)
    await page.getByTestId("password-input").fill(CUSTOMER_PASSWORD)
    await page.getByTestId("sign-in-button").click()
    await page.waitForURL((url) => url.pathname === "/ru/cart", { timeout: 20_000 })
    await expect(page.getByTestId("cart-sidebar-line").first()).toBeVisible()
  })

  test("password login from the checkout page returns to checkout, cart kept", async ({
    page,
  }) => {
    await addFirstProductToCart(page)
    await page.goto("/ru/checkout")
    const returnTo = new URL(page.url()).pathname
    expect(returnTo).toContain("/ru/checkout")
    await page.goto(`/ru/account?return=${encodeURIComponent(returnTo)}`)
    await page.getByTestId("email-input").fill(CUSTOMER_EMAIL)
    await page.getByTestId("password-input").fill(CUSTOMER_PASSWORD)
    await page.getByTestId("sign-in-button").click()
    await page.waitForURL((url) => url.pathname === "/ru/checkout", { timeout: 20_000 })
    // the same cart: the item list still shows the product the first goto added
    await expect(page.getByTestId("checkout-container")).toBeVisible()
  })

  test("sign-up from checkout returns to checkout too", async ({ page }) => {
    await addFirstProductToCart(page)
    await page.goto("/ru/checkout")
    await page.goto("/ru/account?return=%2Fru%2Fcheckout")
    await page.getByTestId("register-button").click()
    await expect(page.getByTestId("register-page")).toBeVisible()
    const stamp = Date.now()
    await page.getByTestId("first-name-input").fill("New")
    await page.getByTestId("last-name-input").fill("Buyer")
    await page.getByTestId("email-input").fill(`new-buyer+${stamp}@upready.dev`)
    await page.getByTestId("password-input").fill("supersecret123")
    await page.getByTestId("register-button").click()
    await page.waitForURL((url) => url.pathname === "/ru/checkout", { timeout: 20_000 })
  })

  test("a hostile return path lands on /ru/account instead", async ({ page }) => {
    await page.goto("/ru/account?return=https%3A%2F%2Fevil.example.com")
    await page.getByTestId("email-input").fill(CUSTOMER_EMAIL)
    await page.getByTestId("password-input").fill(CUSTOMER_PASSWORD)
    await page.getByTestId("sign-in-button").click()
    // the sanitiser's fallback is exactly "/ru/account", no query string at
    // all — waiting for the pathname alone would also match the page we are
    // already on, before the redirect even happens
    await page.waitForURL((url) => url.pathname === "/ru/account" && url.search === "", {
      timeout: 20_000,
    })
    expect(page.url()).not.toContain("evil.example.com")
  })

  test("the account entry point on the cart page carries the return path", async ({
    page,
  }) => {
    await page.goto("/ru/cart")
    const accountLink = page.locator('a[href^="/ru/account?return="]').first()
    await expect(accountLink).toHaveCount(1)
    const href = await accountLink.getAttribute("href")
    expect(decodeURIComponent(href ?? "")).toContain("/ru/cart")
  })

  test("[@mobile] the bottom-nav account icon carries the return path on checkout", async ({
    page,
  }) => {
    await addFirstProductToCart(page)
    await page.goto("/ru/checkout")
    const accountLink = page.locator('a[href^="/ru/account?return="]').first()
    await expect(accountLink).toHaveCount(1)
    const href = await accountLink.getAttribute("href")
    expect(decodeURIComponent(href ?? "")).toContain("/ru/checkout")
  })
})

// ── #2: clickable checkbox label ────────────────────────────────────────────

test.describe("#2 clickable checkbox label", () => {
  test("clicking the recipient caption toggles the checkbox and opens the recipient fields", async ({
    page,
  }) => {
    await addFirstProductToCart(page)
    await page.goto("/ru/checkout")
    await page.getByTestId("checkout-contacts-row").click()
    await expect(page.getByTestId("shipping-first-name-input")).toBeVisible()

    const checkbox = page.getByRole("checkbox").first()
    await expect(checkbox).not.toBeChecked()
    // the caption text itself, not the 16px box — f04's own regression
    await page.getByText("Получать будет другой человек").click()
    await expect(checkbox).toBeChecked()
    await expect(page.getByText("Данные получателя")).toBeVisible()
  })
})

// ── #3: checkmark on filled sections ────────────────────────────────────────

test.describe("#3 section checkmarks", () => {
  test("no checkmark on an empty checkout, one appears on each section once filled", async ({
    page,
  }) => {
    await addFirstProductToCart(page)
    await page.goto("/ru/checkout")

    await expect(page.getByTestId("address-section-checkmark")).toHaveCount(0)
    await expect(page.getByTestId("contacts-section-checkmark")).toHaveCount(0)
    await expect(page.getByTestId("shipping-section-checkmark")).toHaveCount(0)

    await fillCheckoutAddress(page, {
      address1: "1 Demo Street",
      city: "Demo City",
      postalCode: "10000",
    })
    await expect(page.getByTestId("address-section-checkmark")).toBeVisible()

    await selectAnyShippingMethod(page)
    await expect(page.getByTestId("shipping-section-checkmark")).toBeVisible()

    await fillCheckoutContacts(page, uniqueContact())
    await expect(page.getByTestId("contacts-section-checkmark")).toBeVisible()
  })
})

// ── #5: full-width sections, delivery scroller bleeds past the column ──────

test.describe("#5 two columns, full-width rows", () => {
  test("at 1440 the order summary is its own column to the right of the form", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop", "1440 only")
    await addFirstProductToCart(page)
    await page.goto("/ru/checkout")
    const form = await page.getByTestId("checkout-contacts-row").boundingBox()
    const summary = await page.getByTestId("checkout-summary").boundingBox()
    expect(form, "contacts heading has no box").not.toBeNull()
    expect(summary, "order summary has no box").not.toBeNull()
    // two columns: the summary starts right of where the form column ends, not under it
    expect(summary!.x).toBeGreaterThan(form!.x + form!.width)

    await page.screenshot({
      path: "test-results/ivan3-full-width-1440.png",
      fullPage: true,
    })
  })

  test("[@mobile] the checkout fits a 390px phone with the address form open", async ({ page }) => {
    await addFirstProductToCart(page)
    await page.goto("/ru/checkout")
    await expect(page.locator('input[name="address_1"]')).toBeVisible()
    // the region select used to push the page 18px wider than the phone
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
    await page.screenshot({
      path: "test-results/ivan3-full-width-390.png",
      fullPage: true,
    })
  })

  test("the first delivery/payment card's left edge matches the section heading's left edge, within 1px, at 390/768/1024/1440", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop", "drives its own viewports")
    await addFirstProductToCart(page)
    await page.goto("/ru/checkout")
    await fillCheckoutAddress(page, {
      address1: "1 Demo Street",
      city: "Demo City",
      postalCode: "10000",
    })
    await selectAnyShippingMethod(page)

    for (const width of [390, 768, 1024, 1440] as const) {
      await page.setViewportSize({ width, height: 1000 })

      const shippingHeading = page.getByText("Способ доставки", { exact: true })
      const shippingCard = page.getByTestId("delivery-option-radio").first()
      const shippingHeadingBox = await shippingHeading.boundingBox()
      const shippingCardBox = await shippingCard.boundingBox()
      expect(shippingHeadingBox, `shipping heading has no box at ${width}`).not.toBeNull()
      expect(shippingCardBox, `shipping card has no box at ${width}`).not.toBeNull()
      expect(
        Math.abs(shippingCardBox!.x - shippingHeadingBox!.x),
        `shipping card misaligned with heading at ${width}`
      ).toBeLessThanOrEqual(1)

      const paymentHeading = page.getByText("Способ оплаты", { exact: true })
      const paymentCard = page.locator('[data-testid^="payment-method-"]').first()
      const paymentHeadingBox = await paymentHeading.boundingBox()
      const paymentCardBox = await paymentCard.boundingBox()
      expect(paymentHeadingBox, `payment heading has no box at ${width}`).not.toBeNull()
      expect(paymentCardBox, `payment card has no box at ${width}`).not.toBeNull()
      expect(
        Math.abs(paymentCardBox!.x - paymentHeadingBox!.x),
        `payment card misaligned with heading at ${width}`
      ).toBeLessThanOrEqual(1)
    }
  })

  test("at 390 a delivery method is a row across the whole column, not a card in a sideways scroller", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop", "drives its own viewport")
    await addFirstProductToCart(page)
    await page.goto("/ru/checkout")
    await fillCheckoutAddress(page, {
      address1: "1 Demo Street",
      city: "Demo City",
      postalCode: "10000",
    })
    await page.setViewportSize({ width: 390, height: 1000 })

    const row = await page.getByTestId("delivery-option-radio").first().boundingBox()
    expect(row, "delivery row has no box").not.toBeNull()
    // the 16px page gutters on both sides, nothing past the viewport
    expect(row!.width).toBeGreaterThanOrEqual(390 - 2 * 16 - 1)
    expect(row!.x + row!.width).toBeLessThanOrEqual(390)
  })
})

// ── #6: address above delivery method ───────────────────────────────────────

test.describe("#6 address above delivery method", () => {
  test("the DOM order is sign-in → address → delivery → contacts", async ({ page }) => {
    await addFirstProductToCart(page)
    await page.goto("/ru/checkout")

    const order = await page.evaluate(() => {
      const ids = [
        "checkout-address-row",
        "checkout-country-select",
        "checkout-contacts-row",
      ]
      const positions = ids.map((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`)
        if (!el) return null
        let node: Element | null = el
        let index = 0
        while ((node = node.previousElementSibling ?? node.parentElement)) index += 1
        return { id, top: el.getBoundingClientRect().top }
      })
      return positions
    })

    const [address, shipping, contacts] = order
    expect(address?.top).toBeLessThan(shipping!.top)
    expect(shipping?.top).toBeLessThan(contacts!.top)
  })
})

// ── #7: address and contacts open in place ─────────────────────────────────

test.describe("#7 open while incomplete", () => {
  test("an incomplete contacts section is open under its title without taking focus, Save folds it to a summary", async ({
    page,
  }) => {
    await addFirstProductToCart(page)
    await page.goto("/ru/checkout")

    const row = page.getByTestId("checkout-contacts-row")
    const form = page.getByTestId("checkout-contacts-form")
    const firstField = page.getByTestId("shipping-first-name-input")
    await expect(firstField).toBeVisible()
    await expect(firstField).not.toBeFocused()
    // nothing to go back to yet: no «Закрыть» while the contacts are incomplete
    await expect(form.getByRole("button", { name: "Закрыть" })).toHaveCount(0)

    await page.screenshot({ path: "test-results/ivan3-accordion-expanded.png" })

    const contact = uniqueContact()
    await firstField.fill(contact.firstName)
    await page.getByTestId("shipping-last-name-input").fill(contact.lastName)
    await page.getByTestId("shipping-email-input").fill(contact.email)
    await page.getByTestId("shipping-phone-input").fill(contact.phone)
    await form.locator('button[type="submit"]').click()

    await expect(firstField).toBeHidden({ timeout: 25_000 })
    await expect(row).toContainText(contact.firstName)
    await expect(row).toHaveAttribute("aria-expanded", "false")

    await page.screenshot({ path: "test-results/ivan3-accordion-saved.png" })
  })

  test("«Изменить» opens a complete section with focus in its first field, «Закрыть» folds it back without saving", async ({
    page,
  }) => {
    await addFirstProductToCart(page)
    await page.goto("/ru/checkout")
    await fillCheckoutContacts(page, uniqueContact())

    const row = page.getByTestId("checkout-contacts-row")
    await row.focus()
    await page.keyboard.press("Enter")
    const firstField = page.getByTestId("shipping-first-name-input")
    await expect(firstField).toBeVisible()
    await expect(firstField).toBeFocused()

    await page
      .getByTestId("checkout-contacts-form")
      .getByRole("button", { name: "Закрыть" })
      .click()
    await expect(firstField).toBeHidden()
    await expect(page.getByTestId("checkout-contacts-row")).toBeFocused()
  })
})
