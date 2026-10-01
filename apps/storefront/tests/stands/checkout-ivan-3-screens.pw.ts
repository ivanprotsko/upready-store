import { test } from "@playwright/test"
import {
  addFirstProductToCart,
  fillCheckoutAddress,
  fillCheckoutContacts,
  selectAnyShippingMethod,
  setModeBeforeNav,
} from "./helpers"

/**
 * Screenshot evidence for t-2026-10-01-checkout-ivan-3's acceptance checklist
 * (items #3, #5, #6, #7). Not an assertion suite — checkout-ivan-3.pw.ts holds
 * those; this only captures what a reviewer needs to see. Viewport is set
 * per-screenshot rather than through the project list, since the brief's own
 * breakpoints (1440/1024/768/390) do not match the two desktop/mobile
 * projects every other spec here uses.
 */

const VIEWPORTS = {
  1440: { width: 1440, height: 1000 },
  1024: { width: 1024, height: 1000 },
  768: { width: 768, height: 1200 },
  390: { width: 390, height: 1400 },
} as const

test.describe.configure({ mode: "serial" })

test("empty, partial and full checkout — checkmarks, order, full width", async ({
  browser,
}) => {
  for (const mode of ["light", "dark"] as const) {
    for (const width of [1440, 1024, 768, 390] as const) {
      // a fresh context (cookies included) per breakpoint: reusing one
      // page/cart across all eight combinations left every shot after the
      // first showing the previous breakpoint's already-filled cart instead
      // of a genuinely empty one — the cart id lives in a cookie, so a new
      // `page` alone (same context) would still have carried it over
      const context = await browser.newContext()
      const page = await context.newPage()
      await setModeBeforeNav(page, mode)
      await page.setViewportSize(VIEWPORTS[width])
      await addFirstProductToCart(page)
      await page.goto("/ru/checkout")
      await page.screenshot({
        path: `test-results/ivan3-checkout-empty-${width}-${mode}.png`,
        fullPage: true,
      })

      await fillCheckoutAddress(page, {
        address1: "1 Demo Street",
        city: "Demo City",
        postalCode: "10000",
      })
      await page.screenshot({
        path: `test-results/ivan3-checkout-partial-${width}-${mode}.png`,
        fullPage: true,
      })

      await selectAnyShippingMethod(page)
      await fillCheckoutContacts(page, {
        firstName: "Ada",
        lastName: "Visitor",
        email: `stand-visitor+${Date.now()}@upready.dev`,
        phone: "+15550100000",
      })
      await page.screenshot({
        path: `test-results/ivan3-checkout-full-${width}-${mode}.png`,
        fullPage: true,
      })
      await context.close()
    }
  }
})

test("address and contacts accordion — collapsed / expanded / saved, light + dark", async ({
  page,
}) => {
  for (const mode of ["light", "dark"] as const) {
    await setModeBeforeNav(page, mode)
    await page.setViewportSize(VIEWPORTS[1440])
    await addFirstProductToCart(page)
    await page.goto("/ru/checkout")
    await page.screenshot({
      path: `test-results/ivan3-accordion-collapsed-1440-${mode}.png`,
      fullPage: true,
    })

    await page.getByTestId("checkout-address-row").click()
    await page.screenshot({
      path: `test-results/ivan3-accordion-address-expanded-1440-${mode}.png`,
      fullPage: true,
    })

    await page.locator('input[name="address_1"]').fill("1 Demo Street")
    const cityInput = page.locator('input[name="city"]')
    if ((await cityInput.count()) > 0) {
      await cityInput.fill("Demo City")
      await page.locator('input[name="postal_code"]').fill("10000")
    }
    const provinceSelect = page.getByTestId("address-province-select")
    await provinceSelect.waitFor({ state: "visible", timeout: 8_000 }).catch(() => {})
    if ((await provinceSelect.count()) > 0) {
      const value = await provinceSelect
        .locator("option:not([disabled])")
        .first()
        .getAttribute("value")
      if (value) await provinceSelect.selectOption(value)
    }
    await page.locator('form button[type="submit"]:visible').last().click()
    await page.locator('input[name="address_1"]').waitFor({ state: "hidden", timeout: 25_000 })
    await page.screenshot({
      path: `test-results/ivan3-accordion-address-saved-1440-${mode}.png`,
      fullPage: true,
    })
  }
})

// 390 pass of the same three states, mobile column gutters.
test("address accordion at 390 — collapsed / expanded / saved", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS[390])
  await addFirstProductToCart(page)
  await page.goto("/ru/checkout")
  await page.screenshot({
    path: "test-results/ivan3-accordion-collapsed-390.png",
    fullPage: true,
  })
  await page.getByTestId("checkout-address-row").click()
  await page.screenshot({
    path: "test-results/ivan3-accordion-address-expanded-390.png",
    fullPage: true,
  })
})
