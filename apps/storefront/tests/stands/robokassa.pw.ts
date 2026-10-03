import { createHash } from "node:crypto"

import { expect, test } from "@playwright/test"

import type { Page } from "@playwright/test"

import {
  addFirstProductToCart,
  fillCheckoutContacts,
  selectAnyShippingMethod,
} from "./helpers"

/**
 * Robokassa checkout (i01-robokassa-checkout), the leg a stand can measure on
 * its own: the shop's saved account makes Robokassa an offered method, picking
 * it builds a signed payment URL on the payment session, and pressing «Pay»
 * leaves for `auth.robokassa.ru`.
 *
 * The second leg is Robokassa's own two calls — the Result webhook to the
 * backend and the browser redirect to `SuccessUrl2`. Robokassa cannot reach a
 * stand that is not public, and the Result URL is a field of the MERCHANT's
 * dashboard, so this suite plays both calls itself, byte-for-byte as Robokassa
 * builds them, which is exactly what the backend verifies. That needs the
 * shop's password #2, which no test may carry: without
 * `ROBOKASSA_TEST_PASSWORD_2` in the environment the webhook leg is skipped and
 * says so, and the redirect leg still runs (it proves the return route reads an
 * order rather than inventing one).
 *
 * Runner (local stand, no Docker — the storefront is on this machine):
 *   STAND_URL=http://cherkashino.localhost:8061 \
 *   BACKEND_URL=http://localhost:9061 \
 *   ROBOKASSA_TEST_PASSWORD_2=… \
 *   npx playwright test --config tests/stands/playwright.config.ts robokassa.pw.ts
 */

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:9061"
const TEST_PASSWORD_2 = process.env.ROBOKASSA_TEST_PASSWORD_2 ?? ""
const HASH_ALGORITHM = process.env.ROBOKASSA_HASH_ALGORITHM ?? "sha256"

/** Robokassa's signature: the values joined with `:`, empty ones dropped. */
const signature = (parts: Array<string | null | undefined>) =>
  createHash(HASH_ALGORITHM)
    .update(parts.filter((part) => part !== undefined && part !== null && part !== "").join(":"))
    .digest("hex")

/**
 * Fills the shipping address inside the sheet itself. `helpers.fillCheckoutAddress`
 * looks for the «enter manually» checkbox page-wide, and on a stand with no
 * address-suggest provider the structured fields are already there while a
 * checkbox from the page BEHIND the sheet is what the page-wide lookup finds —
 * its click is then intercepted by the sheet's own backdrop. Scoped to the
 * dialog and driven by what is actually rendered.
 */
async function fillShippingAddress(
  page: Page,
  address: { address1: string; city: string; postalCode: string }
) {
  await page.getByTestId("checkout-address-row").click()
  const addNew = page.getByRole("button", { name: /add a new address|add new address/i })
  if ((await addNew.count()) > 0 && (await addNew.isVisible())) await addNew.click()

  const address1 = page.locator('input[name="address_1"]')
  if ((await address1.count()) === 0) {
    // A stand WITH an address-suggest provider shows the suggest box and an
    // «enter manually» checkbox; without one the structured fields are already
    // there and no checkbox exists.
    await page.getByRole("checkbox").first().check()
  }
  await expect(address1).toBeVisible({ timeout: 15_000 })
  await address1.fill(address.address1)
  const city = page.locator('input[name="city"]')
  if ((await city.count()) > 0) {
    await city.fill(address.city)
    await page.locator('input[name="postal_code"]').fill(address.postalCode)
  }
  // The province control swaps shape: `ManualAddressFields` renders a free-text
  // input until `listShippingRegions` answers and a `<select>` afterwards, and
  // for a country with a list the field is REQUIRED — filled with the empty
  // placeholder the sheet simply refuses to close, with the checkout's own
  // «fill in the required address fields» line as the only clue (measured on
  // the stand 2026-09-16). Wait for the list, fall back to the text field for a
  // country that has none.
  const provinceSelect = page.getByTestId("address-province-select")
  const gotSelect = await provinceSelect
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  if (gotSelect) {
    await provinceSelect.selectOption({ index: 1 })
  } else {
    const provinceInput = page.getByTestId("address-province-input")
    if ((await provinceInput.count()) > 0) await provinceInput.fill("Москва")
  }
  await page.locator('form:has(input[name="address_1"]) button[type="submit"]').click()
  await expect(address1).toBeHidden({ timeout: 25_000 })
}

function uniqueContact() {
  const stamp = Date.now()
  return {
    firstName: "Rk",
    lastName: "Visitor",
    email: `robokassa-visitor+${stamp}@upready.dev`,
    phone: "+15550100000",
  }
}

test.describe("robokassa-checkout", () => {
  test("the shop's Robokassa account turns into a signed payment URL and a paid order", async ({
    page,
  }) => {
    await addFirstProductToCart(page)
    await page.goto("/en/checkout")
    await fillCheckoutContacts(page, uniqueContact())
    await fillShippingAddress(page, {
      address1: "Ленина 1",
      city: "Москва",
      postalCode: "101000",
    })
    await selectAnyShippingMethod(page)

    // The shop saved its account in the panel, so the backend offers the method.
    const chip = page.getByTestId("payment-method-pp_robokassa_robokassa")
    await expect(
      chip,
      "Robokassa is not offered: either the shop has no enabled account, or the region does not list pp_robokassa_robokassa (src/scripts/link-robokassa-regions.ts)"
    ).toBeVisible({ timeout: 20_000 })
    await chip.click()

    // Pressing «Pay» navigates off-site; catch the URL instead of following it.
    let paymentUrl: string | null = null
    await page.route("https://auth.robokassa.ru/**", async (route) => {
      paymentUrl = route.request().url()
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>robokassa stub</body></html>",
      })
    })

    // 04.10 checklist C1: the pay button waits for the personal-data consent.
    await page.getByTestId("consent-personal-data").click()
    const submit = page.getByTestId("submit-order-button")
    await expect(submit).toBeEnabled({ timeout: 20_000 })
    await submit.click()
    await expect
      .poll(() => paymentUrl, { timeout: 30_000, message: "no navigation to auth.robokassa.ru" })
      .not.toBeNull()

    const url = new URL(paymentUrl!)
    expect(url.pathname).toBe("/Merchant/Index.aspx")
    const params = url.searchParams
    expect(params.get("MerchantLogin")).toBeTruthy()
    expect(params.get("SignatureValue")).toMatch(/^[0-9a-f]{32,128}$/i)
    expect(params.get("IsTest")).toBe("1")
    const invoiceId = params.get("InvId")!
    const outSum = params.get("OutSum")!
    const sessionId = params.get("Shp_SessionID")!
    const successUrl = params.get("SuccessUrl2")!
    expect(invoiceId).toMatch(/^[1-9][0-9]*$/)
    expect(Number(invoiceId)).toBeLessThan(2 ** 31)
    expect(outSum).toMatch(/^\d+\.\d{2}$/)
    expect(successUrl).toContain("/api/payment-return")
    expect(successUrl).toContain("provider=robokassa")

    test.skip(
      !TEST_PASSWORD_2,
      "ROBOKASSA_TEST_PASSWORD_2 is not set: the webhook leg needs the shop's password #2"
    )

    // Leg 2a — the Result webhook, the only thing that marks a payment paid.
    const resultBody = new URLSearchParams({
      OutSum: outSum,
      InvId: invoiceId,
      Shp_SessionID: sessionId,
      SignatureValue: signature([outSum, invoiceId, TEST_PASSWORD_2, `Shp_SessionID=${sessionId}`]),
    })
    const result = await page.request.post(`${BACKEND_URL}/robokassa/result`, {
      form: Object.fromEntries(resultBody),
    })
    expect(result.status(), await result.text()).toBe(200)
    expect(await result.text()).toBe(`OK${invoiceId}`)

    // Idempotent: Robokassa retries until it reads OK, and a replay must not
    // create a second order or answer differently.
    const replay = await page.request.post(`${BACKEND_URL}/robokassa/result`, {
      form: Object.fromEntries(resultBody),
    })
    expect(replay.status()).toBe(200)
    expect(await replay.text()).toBe(`OK${invoiceId}`)

    // A forged signature is refused, so the webhook is proof and not a pipe.
    const forged = await page.request.post(`${BACKEND_URL}/robokassa/result`, {
      form: { OutSum: outSum, InvId: invoiceId, Shp_SessionID: sessionId, SignatureValue: "deadbeef" },
    })
    expect(forged.status()).toBe(400)

    // Leg 2b — the browser comes back through SuccessUrl2 and lands on the
    // order the webhook produced.
    await page.goto(successUrl)
    await expect(page).toHaveURL(/\/order\/[^/]+\/confirmed/, { timeout: 60_000 })
    await expect(page.getByTestId("order-complete-container")).toBeVisible({ timeout: 20_000 })
  })
})
