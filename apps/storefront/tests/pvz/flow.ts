import { expect, type Page } from "@playwright/test"

import {
  addOpenProductToCart,
  fillCheckoutContacts,
  openFirstProduct,
} from "../stands/helpers"

/**
 * The checkout flow in front of the CDEK sheet, in Russian
 * (i03-checkout-pvz-map-address-suggest).
 *
 * The three stages it reuses from `tests/stands/helpers` carry that suite's own
 * hard-won retries (hydration, option groups, the headless-ui dialog that has no
 * bounding box of its own); only the locale-scoped navigation is local, because
 * this suite reads Russian copy — the shop this task was ordered for.
 */

export async function addFirstProductToCartRu(page: Page) {
  await page.goto("/ru/store")
  await expect(page.getByTestId("products-list")).toBeVisible({ timeout: 30_000 })
  await openFirstProduct(page)
  await addOpenProductToCart(page)
}

/** The buyer's address: a Moscow one, because the fixtures list Moscow points. */
export const TEST_ADDRESS = {
  address1: "Тверская улица, 12с1",
  city: "Москва",
  postalCode: "125009",
  province: "г Москва",
}

/**
 * Fills the address sheet, scoped to the sheet itself.
 *
 * Not `tests/stands/helpers`' own `fillCheckoutAddress`: that one reaches for
 * `getByRole("checkbox")` across the WHOLE page to find the suggest's «enter
 * manually» escape hatch, and on this checkout the page behind the open sheet
 * carries the consent checkboxes — the click then waits out its timeout against
 * the dialog that is covering them (measured 2026-09-16, all five specs).
 * Everything here is looked up inside the dialog, where only the sheet's own
 * controls live.
 */
export async function fillAddressSheetRu(
  page: Page,
  address: { address1: string; city: string; postalCode: string; province: string }
) {
  const row = page.getByTestId("checkout-address-row")
  if ((await row.count()) === 0) return
  await row.click()

  const sheet = page.locator("#headlessui-portal-root")
  const addNew = sheet.getByRole("button", { name: /новый адрес|add a new address/i })
  if ((await addNew.count()) > 0 && (await addNew.isVisible())) await addNew.click()

  const manualToggle = sheet.getByRole("checkbox")
  if ((await manualToggle.count()) > 0) await manualToggle.first().click()

  const address1 = sheet.locator('input[name="address_1"]')
  await expect(address1).toBeVisible()
  await address1.fill(address.address1)
  await sheet.getByTestId("address-city-suggest").fill(address.city)
  await sheet.locator('input[name="postal_code"]').fill(address.postalCode)

  // Russia requires the province since f04-address-without-city, and the
  // select that offers it only appears once `listShippingRegions` has answered
  // — until then the form renders the free-text input with its own testid. Both
  // are filled with the canonical string the shop's zones are built from
  // («г Москва», measured on the stand 2026-09-16), because a province the zone
  // list does not know prices nothing.
  const provinceSelect = sheet.getByTestId("address-province-select")
  const appeared = await provinceSelect
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  if (appeared) {
    await provinceSelect.selectOption(address.province)
  } else {
    const provinceInput = sheet.getByTestId("address-province-input")
    if ((await provinceInput.count()) > 0) await provinceInput.fill(address.province)
  }

  await sheet.locator('form button[type="submit"]:visible').last().click()
  const incomplete = sheet.getByTestId("address-incomplete-message")
  if (await incomplete.isVisible().catch(() => false)) {
    throw new Error("the address sheet refused the address as incomplete — check city/index/province")
  }
  await expect(address1).toBeHidden({ timeout: 30_000 })
}

/**
 * Cart → checkout → contacts → address, stopping in front of the shipping
 * cards. Returns nothing: every assertion belongs to the spec.
 */
export async function reachShippingStep(page: Page) {
  await addFirstProductToCartRu(page)
  await page.goto("/ru/checkout")
  await fillCheckoutContacts(page, {
    firstName: "Иван",
    lastName: "Покупатель",
    email: "i03-buyer@upready.dev",
    phone: "+79990000000",
  })
  await fillAddressSheetRu(page, TEST_ADDRESS)
}

/** Opens the CDEK pickup card's sheet. Returns the card's own element. */
export async function openCdekPointSheet(page: Page) {
  const card = page
    .getByTestId("delivery-option-radio")
    .filter({ hasText: /СДЭК|CDEK/i })
    .filter({ hasText: /пункт|постамат|point/i })
    .first()
  await expect(
    card,
    "no CDEK pickup card on the shipping step — check the tenant's CDEK delivery settings on this stand"
  ).toBeVisible({ timeout: 20_000 })
  await card.click()
  await expect(page.getByTestId("cdek-point-city")).toBeVisible({ timeout: 20_000 })
  return card
}
