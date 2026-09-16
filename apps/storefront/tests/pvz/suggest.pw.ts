import { expect, test } from "@playwright/test"

import { mockCdek } from "./fixtures"
import { reachShippingStep } from "./flow"

/**
 * The address suggest (i03-checkout-pvz-map-address-suggest, Ivan's order 3.2).
 *
 * What it suggests is CDEK's own city directory, the one directory this shop
 * holds credentials for — no key for a street-level provider exists anywhere
 * (report.md, `key missing:`). The mechanics under test are the ones the order
 * asked for and are provider-independent: a debounce, a floor on the term
 * length, keyboard navigation, and a manual entry that still works.
 */
test.describe("checkout address suggest", () => {
  test("suggests cities from three characters, debounced, and fills the field", async ({ page }) => {
    const counter = await mockCdek(page)
    await reachShippingStep(page)

    // The address the flow itself typed already asked the provider once; this
    // test is about what happens from here on.
    counter.calls.length = 0

    // Back into the address sheet: the suggest lives on its city field.
    await page.getByTestId("checkout-address-row").click()
    const city = page.getByTestId("address-city-suggest")
    await expect(city).toBeVisible()

    // Two characters are below the floor — nothing is asked of the provider.
    await city.fill("Кр")
    await page.waitForTimeout(700)
    expect(counter.calls, "a two-character term must not reach the provider").toHaveLength(0)

    // Typing three characters letter by letter is still ONE request: the term
    // is debounced, not sent per keystroke.
    await city.press("End")
    await city.pressSequentially("асно", { delay: 60 })
    const options = page.getByTestId("address-city-suggest-option")
    await expect(options).toHaveCount(3)
    expect(
      counter.calls.length,
      `five keystrokes produced ${counter.calls.length} requests: ${counter.calls.join(", ")}`
    ).toBeLessThanOrEqual(2)

    // Keyboard alone: down, down, enter picks the second row.
    await city.press("ArrowDown")
    await city.press("ArrowDown")
    await city.press("Enter")
    await expect(city).toHaveValue("Красноярск")
    await expect(options).toHaveCount(0)
  })

  test("manual entry survives: a term with no match stays exactly as typed", async ({ page }) => {
    await mockCdek(page)
    await reachShippingStep(page)

    await page.getByTestId("checkout-address-row").click()
    const city = page.getByTestId("address-city-suggest")
    await city.fill("Зеленоградск")
    await page.waitForTimeout(700)
    await expect(page.getByTestId("address-city-suggest-option")).toHaveCount(0)
    await expect(city).toHaveValue("Зеленоградск")

    // And the popup never covers the sheet's own Save button: the field's
    // answer closes when the buyer moves on (the address form's submit is the
    // control this would otherwise hide).
    await page.locator('input[name="postal_code"]').fill("238530")
    const submit = page.locator('form button[type="submit"]:visible').last()
    await expect(submit).toBeVisible()
    await submit.click({ trial: true })
  })
})
