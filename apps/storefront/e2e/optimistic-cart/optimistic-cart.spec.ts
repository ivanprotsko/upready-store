import { expect, test, type Page, type Request } from "@playwright/test"

/**
 * The client cart queue (t-2026-10-03-66), checked the way Ivan put it on 03.10:
 * «действие выполняется моментально, а выполнение происходит в фоне … в фоне
 * выстраиваться в очередь с debounce».
 *
 * Every test starts in a fresh context, so on a fresh cart. The server's word is
 * `GET /api/cart`, read with the page's own cookies.
 */

const PRODUCT = process.env.E2E_PRODUCT ?? "propolis"

const ADD = '[data-testid="add-product-button"]'
const STEPPER = '[data-testid="in-cart-stepper"]'
const PLUS = '[data-testid="in-cart-stepper-increase"]'
const QUANTITY = '[data-testid="in-cart-stepper-quantity"]'
const COUNT = '[data-testid="cart-item-count"]'
const CART_LINK = '[data-testid="nav-cart-link"]'

const isSync = (request: Request) =>
  request.method() === "POST" && new URL(request.url()).pathname === "/api/cart"

/** Every `POST /api/cart` the page sends, in order. */
const recordSyncs = (page: Page) => {
  const bodies: { lines: { variantId: string; quantity: number }[] }[] = []
  page.on("request", (request) => {
    if (isSync(request)) {
      bodies.push(request.postDataJSON())
    }
  })
  return bodies
}

/** The variant's quantity as the server has it. */
const serverQuantity = async (page: Page): Promise<number> => {
  const response = await page.request.get("/api/cart")
  const { cart } = (await response.json()) as {
    cart: { items?: { quantity: number }[] } | null
  }
  return cart?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0
}

/** Waits until nothing is on its way to the server any more. */
const settled = async (page: Page) => {
  await expect(page.locator(CART_LINK).first()).not.toHaveAttribute("data-pending", "true")
}

const openProduct = async (page: Page) => {
  await page.goto(`/ru/products/${PRODUCT}`, { waitUntil: "networkidle" })
  await page.locator(`${ADD}:not([disabled])`).first().waitFor()
}

/** Adds one from the product page, closes the sidebar it opens, waits for the server. */
const addOne = async (page: Page) => {
  await page.locator(ADD).first().click()
  await page.keyboard.press("Escape")
  await page.locator(STEPPER).first().waitFor()
  await settled(page)
}

test.describe("client cart queue", () => {
  test("«В корзину» turns into the stepper and moves the counter within 100 ms", async ({
    page,
  }) => {
    await openProduct(page)
    await expect(page.locator(COUNT)).toHaveCount(0)

    // Timed in the page: from the pointer going down to the DOM showing the change.
    await page.evaluate(() => {
      const w = window as unknown as { __t0?: number; __marks: Record<string, number> }
      w.__marks = {}
      document.addEventListener("pointerdown", () => (w.__t0 = performance.now()), {
        capture: true,
        once: true,
      })
      new MutationObserver(() => {
        if (w.__t0 === undefined) return
        const at = performance.now() - w.__t0
        if (w.__marks.stepper === undefined && document.querySelector('[data-testid="in-cart-stepper"]')) {
          w.__marks.stepper = at
        }
        if (w.__marks.count === undefined && document.querySelector('[data-testid="cart-item-count"]')?.textContent === "1") {
          w.__marks.count = at
        }
      }).observe(document.documentElement, { subtree: true, childList: true, characterData: true })
    })

    const syncs = recordSyncs(page)
    await page.locator(ADD).first().click()
    await page.locator(STEPPER).first().waitFor()
    const marks = await page.evaluate(
      () => (window as unknown as { __marks: Record<string, number> }).__marks
    )
    test.info().annotations.push({ type: "marks-ms", description: JSON.stringify(marks) })

    expect(marks.stepper).toBeLessThanOrEqual(100)
    expect(marks.count).toBeLessThanOrEqual(100)
    // Nothing has been sent yet: the request waits for the debounce.
    expect(syncs).toHaveLength(0)

    await settled(page)
    expect(syncs).toHaveLength(1)
    expect(await serverQuantity(page)).toBe(1)
  })

  test("five quick «+» land as exactly +5 on the server, in one or two requests", async ({
    page,
  }) => {
    await openProduct(page)
    await addOne(page)
    const before = await serverQuantity(page)

    const syncs = recordSyncs(page)
    for (let i = 0; i < 5; i++) {
      await page.locator(PLUS).first().click()
    }
    // On screen at once, before any request.
    await expect(page.locator(QUANTITY).first()).toHaveText(String(before + 5))
    await expect(page.locator(COUNT).first()).toHaveText(String(before + 5))

    await settled(page)
    expect(await serverQuantity(page)).toBe(before + 5)
    expect(syncs.length).toBeGreaterThanOrEqual(1)
    expect(syncs.length).toBeLessThanOrEqual(2)
    // Absolute quantities, the last one being the final count.
    expect(syncs.at(-1)?.lines[0].quantity).toBe(before + 5)
  })

  test("a refused request rolls the stepper back to the server and says so", async ({
    page,
  }) => {
    await openProduct(page)
    await addOne(page)
    const before = await serverQuantity(page)

    await page.route("**/api/cart", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500, body: "{}" })
        : route.continue()
    )

    await page.locator(PLUS).first().click()
    await page.locator(PLUS).first().click()
    await expect(page.locator(QUANTITY).first()).toHaveText(String(before + 2))

    await expect(page.locator('[data-testid="product-cart-error"]')).toBeVisible()
    await expect(page.locator(QUANTITY).first()).toHaveText(String(before))
    await expect(page.locator(COUNT).first()).toHaveText(String(before))
    expect(await serverQuantity(page)).toBe(before)
    await page.screenshot({ path: test.info().outputPath("rollback.png") })

    // The next click clears the message and goes through once the server is back.
    await page.unroute("**/api/cart")
    await page.locator(PLUS).first().click()
    await expect(page.locator('[data-testid="product-cart-error"]')).toHaveCount(0)
    await settled(page)
    expect(await serverQuantity(page)).toBe(before + 1)
  })

  test("the sidebar, the product page and the header show one state", async ({ page }) => {
    await openProduct(page)
    await page.locator(ADD).first().click()
    const sidebar = page.locator('[data-testid="cart-sidebar"]')
    await expect(sidebar).toBeVisible()
    await expect(sidebar.locator('[data-testid="cart-sidebar-quantity"]')).toHaveText("1")

    await sidebar.locator('[data-testid="cart-sidebar-increase"]').click()
    await sidebar.locator('[data-testid="cart-sidebar-increase"]').click()
    await expect(sidebar.locator('[data-testid="cart-sidebar-quantity"]')).toHaveText("3")
    await expect(page.locator(COUNT).first()).toHaveText("3")

    await page.keyboard.press("Escape")
    await expect(page.locator(QUANTITY).first()).toHaveText("3")
    await settled(page)
    expect(await serverQuantity(page)).toBe(3)
  })

  test("«К оформлению» waits for the queue before it leaves", async ({ page }) => {
    await openProduct(page)
    await page.locator(ADD).first().click()
    const sidebar = page.locator('[data-testid="cart-sidebar"]')
    await sidebar.locator('[data-testid="cart-sidebar-increase"]').click()

    const events: string[] = []
    page.on("requestfinished", (request) => {
      if (isSync(request)) events.push("sync")
    })
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.includes("/checkout")) events.push("checkout")
    })

    await sidebar.locator('[data-testid="cart-sidebar-checkout"]').click()
    await page.waitForURL(/\/checkout/)
    expect(events.indexOf("sync")).toBeGreaterThanOrEqual(0)
    expect(events.indexOf("sync")).toBeLessThan(events.indexOf("checkout"))
    expect(await serverQuantity(page)).toBe(2)
  })

  test("a full navigation right after a click loses nothing", async ({ page }) => {
    await openProduct(page)
    await addOne(page)
    await page.locator(PLUS).first().click()
    await page.locator(PLUS).first().click()

    // Within the debounce: nothing sent yet, and the next page is requested at once.
    await page.goto("/ru/cart", { waitUntil: "domcontentloaded" })
    // The cart page shows the two clicks whether or not the unload's request has landed:
    // it re-applies what the product page left behind, then sends it again.
    await expect(page.locator(COUNT).first()).toHaveText("3")
    await expect(page.locator('[data-testid="cart-sidebar-line"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="cart-sidebar-line-unit"]')).toContainText("3 ×")
    await settled(page)
    expect(await serverQuantity(page)).toBe(3)
  })
})
