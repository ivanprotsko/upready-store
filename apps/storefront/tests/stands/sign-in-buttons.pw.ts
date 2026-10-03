import { expect, test, type Locator, type Page } from "@playwright/test"

import { addOpenProductToCart, openFirstProduct } from "./helpers"

/**
 * Buttons that stand next to each other are one size (t-2026-10-03-65, Ivan: «в сайдбаре с
 * корзиной и в прочих местах не допускать такого, чтобы кнопки которые стоят рядом могли
 * быть разного размера как сейчас со входом в телеграм»).
 *
 * Every group of sign-in controls a guest meets is measured on the live render: the cart
 * sidebar's methods and its e-mail forms' button pairs, the checkout's sign-in step, and the
 * login page. Within a group every button is the same height; buttons sharing a row are the
 * same width; a stacked group (the login page) is one width top to bottom.
 *
 * Which methods a group holds is the shop's own setting (e-mail, Yandex ID, Telegram), so a
 * group with a single button says so in an annotation rather than passing silently on
 * nothing to compare (rule 20a: zero is not empty).
 */

type Box = { id: string; x: number; y: number; width: number; height: number }

const TOLERANCE = 0.5

async function boxes(scope: Locator, testIds: string[]): Promise<Box[]> {
  const out: Box[] = []
  for (const id of testIds) {
    const control = scope.getByTestId(id)
    if ((await control.count()) === 0 || !(await control.first().isVisible())) continue
    const box = await control.first().boundingBox()
    if (box) out.push({ id, ...box })
  }
  return out
}

function expectOneSize(group: string, found: Box[], { stacked = false } = {}) {
  const describe = found.map((b) => `${b.id} ${b.width.toFixed(1)}×${b.height.toFixed(1)} @${b.x.toFixed(0)},${b.y.toFixed(0)}`).join("; ")
  test.info().annotations.push({ type: "measured", description: `${group}: ${describe || "no controls"}` })
  if (found.length < 2) {
    test.info().annotations.push({ type: "measured", description: `${group}: one control on this shop, no neighbour to compare` })
    return
  }
  const [first] = found
  for (const box of found) {
    expect(Math.abs(box.height - first.height), `${group}: ${box.id} height vs ${first.id} (${describe})`).toBeLessThanOrEqual(TOLERANCE)
  }
  const rows = new Map<number, Box[]>()
  for (const box of found) {
    const row = Math.round(box.y)
    rows.set(row, [...(rows.get(row) ?? []), box])
  }
  for (const row of Array.from(rows.values())) {
    for (const box of row) {
      expect(Math.abs(box.width - row[0].width), `${group}: ${box.id} width vs ${row[0].id} in one row (${describe})`).toBeLessThanOrEqual(TOLERANCE)
    }
  }
  if (stacked) {
    for (const box of found) {
      expect(Math.abs(box.width - first.width), `${group}: ${box.id} width vs ${first.id} in one column (${describe})`).toBeLessThanOrEqual(TOLERANCE)
    }
  }
}

async function addProductToCart(page: Page) {
  await page.goto("/ru/store")
  await expect(page.getByTestId("products-list")).toBeVisible({ timeout: 20_000 })
  await openFirstProduct(page)
  await addOpenProductToCart(page)
}

test.describe("sign-in buttons that stand together are one size", () => {
  test("cart sidebar: the methods, then the sign-in and sign-up button pairs", async ({ page }) => {
    await addProductToCart(page)
    const sidebar = page.getByTestId("cart-sidebar")
    // A successful add opens the sidebar on a desktop viewport (`use-product-purchase.ts`).
    await expect(sidebar).toBeVisible({ timeout: 20_000 })
    const signIn = sidebar.getByTestId("cart-sidebar-sign-in")
    await expect(signIn).toBeVisible()

    const methods = signIn.getByTestId("cart-sidebar-sign-in-methods")
    expectOneSize(
      "sidebar methods",
      await boxes(methods, ["cart-sidebar-sign-in-email", "telegram-login-cta", "cart-sidebar-sign-in-yandex"])
    )

    const email = methods.getByTestId("cart-sidebar-sign-in-email")
    if ((await email.count()) === 0) {
      test.info().annotations.push({ type: "measured", description: "this shop has no e-mail sign-in: no forms to measure" })
      return
    }
    await email.click()
    await expect(signIn.getByTestId("cart-sidebar-sign-in-form")).toBeVisible()
    expectOneSize(
      "sidebar sign-in actions",
      await boxes(signIn.getByTestId("cart-sidebar-auth-actions"), ["cart-sidebar-sign-in-submit", "cart-sidebar-auth-switch"])
    )

    await signIn.getByTestId("cart-sidebar-auth-switch").click()
    await expect(signIn.getByTestId("cart-sidebar-register-form")).toBeVisible()
    expectOneSize(
      "sidebar sign-up actions",
      await boxes(signIn.getByTestId("cart-sidebar-auth-actions"), ["cart-sidebar-register-submit", "cart-sidebar-auth-switch"])
    )
    // The methods row keeps its sizes with a form open under it.
    expectOneSize(
      "sidebar methods, form open",
      await boxes(methods, ["cart-sidebar-sign-in-email", "telegram-login-cta", "cart-sidebar-sign-in-yandex"])
    )
  })

  for (const width of ["desktop", "@mobile"] as const) {
    test(`checkout sign-in step ${width}`, async ({ page }) => {
      await addProductToCart(page)
      await page.goto("/ru/checkout")
      const block = page.getByTestId("checkout-sign-in")
      await expect(block).toBeVisible({ timeout: 20_000 })
      expectOneSize(
        `checkout sign-in ${width}`,
        await boxes(block.getByTestId("checkout-sign-in-methods"), [
          "checkout-sign-in-button",
          "telegram-login-cta",
          "checkout-sign-in-yandex",
        ])
      )
    })

    test(`login page ${width}`, async ({ page }) => {
      await page.goto("/ru/account")
      const login = page.getByTestId("login-page")
      await expect(login).toBeVisible({ timeout: 20_000 })
      expectOneSize(
        `login page ${width}`,
        await boxes(login, ["sign-in-button", "yandex-login-cta", "telegram-login-cta"]),
        { stacked: true }
      )
    })
  }
})
