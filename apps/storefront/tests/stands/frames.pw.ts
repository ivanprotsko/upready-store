import fs from "fs"
import path from "path"
import { expect, test, type Page } from "@playwright/test"

import {
  addOpenProductToCart,
  choosePickupPoint,
  currentProfile,
  currentStandSlug,
  fillCheckoutAddress,
  fillCheckoutContacts,
  fillDemoCard,
  goToStore,
  loginCustomer,
  openFirstProduct,
  seededPickupPoints,
  selectAnyShippingMethod,
  selectManualPayment,
  selectPickupShipping,
  setModeBeforeNav,
} from "./helpers"

/**
 * R-frames (task order t-2026-09-09-02): shoots the frames Ivan looks at, full-page,
 * for every page a visitor or the demo customer reaches. Runs once per Playwright
 * project (this config's own "desktop"/"mobile" split already gives the two required
 * widths, 1440x900 and 390x844 — see playwright.config.ts's own viewport overrides),
 * and internally loops over both modes so each project produces exactly the width x
 * mode matrix the task asks for.
 *
 * Skipped entirely unless FRAMES_DIR is set (the orchestrator's own convention for an
 * opt-in suite, mirrored from the "@frames" tag named in the task order) — this is a
 * screenshot harness, not a pass/fail gate, and every OTHER stands/*.pw.ts file
 * already asserts the same journeys' correctness.
 *
 * A page that never renders its own content is still captured (whatever is on screen,
 * including a stuck loading skeleton) and then asserted, so the run's own pass/fail
 * count is accurate and the screenshot itself is the red item's evidence — never a
 * silently skipped frame.
 */

const FRAMES_DIR = process.env.FRAMES_DIR

function uniqueContact(tag: string) {
  const stamp = Date.now()
  return {
    firstName: "Ada",
    lastName: "Visitor",
    email: `stand-frames-${tag}+${stamp}@upready.dev`,
    phone: "+15550100000",
  }
}

/**
 * Waits (bounded) for `locator` to render, screenshots the page regardless of
 * whether it did, then reports. Never throws itself — every call site is its own
 * try/catch "stage" (see `stage` below), so one page that never renders costs that
 * one frame's stage, not the rest of the journey: the screenshot is still written
 * (whatever is on screen, a stuck loading skeleton included) and `ok` tells the
 * caller whether to fold the stage into `redItems`.
 */
async function captureFrame(
  page: Page,
  locator: ReturnType<Page["getByTestId"]>,
  waitLabel: string,
  page_: string,
  mode: "light" | "dark",
  standSlug: string,
  timeoutMs = 20_000
): Promise<{ ok: boolean; framePath: string }> {
  const ok = await locator
    .waitFor({ state: "visible", timeout: timeoutMs })
    .then(() => true)
    .catch(() => false)

  const width = page.viewportSize()?.width ?? 0
  const outDir = path.join(FRAMES_DIR as string, standSlug)
  fs.mkdirSync(outDir, { recursive: true })
  const framePath = path.join(outDir, `${page_}-${width}-${mode}.png`)
  await page.screenshot({ path: framePath, fullPage: true })

  if (!ok) {
    // eslint-disable-next-line no-console -- surfaced in the run's own log, read into the R-frames report's red[]
    console.log(`[frames] RED ${page_} (${mode}): "${waitLabel}" never became visible within ${timeoutMs}ms`)
  }
  return { ok, framePath }
}

/**
 * Runs one journey stage in isolation: a failure (the precondition throwing, or
 * `captureFrame` reporting `ok: false`) is pushed onto `redItems` and swallowed, so
 * the next stage — independent frames included — still gets attempted. This is what
 * keeps a single stuck page (measured live: /account/orders's perpetual loading
 * skeleton, S-scenarios.json) from silently costing every frame after it.
 */
async function stage(redItems: string[], label: string, run: () => Promise<void>) {
  try {
    await run()
  } catch (err) {
    redItems.push(`${label}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * The full visitor + customer journey for one (mode, project-viewport) combination:
 * home, plp, pdp, cart, checkout with the pickup sheet open, order success (paid with
 * the approving demo card, scenario F5's 4242 suffix), every account page, and a
 * second short checkout pass for the order-failed banner (9999 suffix) so the first
 * pass's cart/checkout frames stay on the pickup-success path the task names first.
 */
/**
 * One (mode, project-viewport) pass over every frame the task names. Built as
 * independent `stage()` blocks rather than one straight-line function: the guest
 * purchase path (home..order-success), the account pages, and the second checkout
 * pass (order-failed) each depend only on their OWN preceding stage, so a stuck page
 * in one — measured live: /account/orders's perpetual loading skeleton — costs that
 * stage's frame and nothing downstream. Returns every stage's failure message;
 * throwing is left to the caller so both modes always run to completion.
 */
async function runJourney(page: Page, mode: "light" | "dark", standSlug: string): Promise<string[]> {
  const red: string[] = []
  await setModeBeforeNav(page, mode)

  await stage(red, `login (${mode})`, () => loginCustomer(page))

  await stage(red, `home (${mode})`, async () => {
    await page.goto("/en")
    const { ok } = await captureFrame(page, page.getByTestId("nav-store-link"), "nav-store-link", "home", mode, standSlug)
    if (!ok) throw new Error("nav-store-link never became visible")
  })

  await stage(red, `plp (${mode})`, async () => {
    await goToStore(page)
    const { ok } = await captureFrame(page, page.getByTestId("products-list"), "products-list", "plp", mode, standSlug)
    if (!ok) throw new Error("products-list never became visible")
  })

  await stage(red, `pdp (${mode})`, async () => {
    await openFirstProduct(page)
    const { ok } = await captureFrame(page, page.getByTestId("product-container"), "product-container", "pdp", mode, standSlug)
    if (!ok) throw new Error("product-container never became visible")
  })

  await stage(red, `cart (${mode})`, async () => {
    await addOpenProductToCart(page)
    await page.goto("/en/cart")
    const { ok } = await captureFrame(page, page.getByTestId("cart-sidebar-line").first(), "product-row", "cart", mode, standSlug)
    if (!ok) throw new Error("cart-sidebar-line never became visible")
  })

  await stage(red, `checkout-pickup + order-success (${mode})`, async () => {
    const profile = currentProfile()
    const points = seededPickupPoints(profile)
    const point = points[0]

    await page.goto("/en/checkout")
    await fillCheckoutContacts(page, uniqueContact("success"))
    await fillCheckoutAddress(page, {
      address1: point.address.address_1,
      city: point.address.city,
      postalCode: point.address.postal_code,
    })
    await selectPickupShipping(page)
    const pickupShot = await captureFrame(
      page,
      page.getByTestId("pickup-point-list"),
      "pickup-point-list",
      "checkout-pickup",
      mode,
      standSlug
    )
    if (!pickupShot.ok) throw new Error("pickup-point-list never became visible")
    await choosePickupPoint(page)

    await selectManualPayment(page)
    await fillDemoCard(page, "approve")
    // 04.10 checklist C1: the pay button waits for the personal-data consent.
    await page.getByTestId("consent-personal-data").click()
    await page.getByTestId("submit-order-button").click()
    await page.waitForURL(/\/order\/.+\/confirmed/, { timeout: 30_000 }).catch(() => {
      /* captureFrame below still screenshots whatever page this landed on and reports the missing order-id */
    })
    const successShot = await captureFrame(page, page.getByTestId("order-id"), "order-id", "order-success", mode, standSlug)
    if (!successShot.ok) throw new Error("order-id never became visible after submitting the approving card")
  })

  // ── account pages, reusing the same logged-in session ──────────────────────────

  await stage(red, `account overview (${mode})`, async () => {
    await page.goto("/en/account")
    const { ok } = await captureFrame(
      page,
      page.getByTestId("overview-page-wrapper"),
      "overview-page-wrapper",
      "account",
      mode,
      standSlug
    )
    if (!ok) throw new Error("overview-page-wrapper never became visible")
  })

  await stage(red, `orders list (${mode})`, async () => {
    await page.goto("/en/account/orders")
    const { ok } = await captureFrame(
      page,
      page.getByTestId("orders-page-wrapper"),
      "orders-page-wrapper",
      "orders",
      mode,
      standSlug,
      30_000
    )
    if (!ok) throw new Error("orders-page-wrapper never became visible within 30s")
  })

  await stage(red, `order detail (${mode})`, async () => {
    await page.getByTestId("order-details-link").first().click({ timeout: 10_000 })
    const { ok } = await captureFrame(
      page,
      page.getByTestId("order-details-container"),
      "order-details-container",
      "order",
      mode,
      standSlug
    )
    if (!ok) throw new Error("order-details-container never became visible")
  })

  await stage(red, `addresses (${mode})`, async () => {
    await page.goto("/en/account/addresses")
    const { ok } = await captureFrame(
      page,
      page.getByTestId("addresses-page-wrapper"),
      "addresses-page-wrapper",
      "addresses",
      mode,
      standSlug
    )
    if (!ok) throw new Error("addresses-page-wrapper never became visible")
  })

  await stage(red, `profile (${mode})`, async () => {
    await page.goto("/en/account/profile")
    const { ok } = await captureFrame(
      page,
      page.getByTestId("profile-page-wrapper"),
      "profile-page-wrapper",
      "profile",
      mode,
      standSlug
    )
    if (!ok) throw new Error("profile-page-wrapper never became visible")
  })

  // ── a second, short checkout pass for the failure banner (card ending 9999) ────

  await stage(red, `order-failed (${mode})`, async () => {
    await goToStore(page)
    await openFirstProduct(page)
    await addOpenProductToCart(page)
    await page.goto("/en/checkout")
    await fillCheckoutContacts(page, uniqueContact("failed"))
    await fillCheckoutAddress(page, {
      address1: "1 Demo Street",
      city: "Demo City",
      postalCode: "10000",
    })
    await selectAnyShippingMethod(page)
    await selectManualPayment(page)
    await fillDemoCard(page, "redirect")
    // 04.10 checklist C1: the pay button waits for the personal-data consent.
    await page.getByTestId("consent-personal-data").click()
    await page.getByTestId("submit-order-button").click()
    await page.waitForURL(/\/cart\?error=order_failed/, { timeout: 20_000 }).catch(() => {
      /* captureFrame below still screenshots whatever page this landed on and reports the missing banner */
    })
    const { ok } = await captureFrame(
      page,
      page.getByTestId("order-error-banner"),
      "order-error-banner",
      "order-failed",
      mode,
      standSlug
    )
    if (!ok) throw new Error("order-error-banner never became visible after submitting the redirecting card")
  })

  return red
}

async function runBothModes(page: Page) {
  const standSlug = currentStandSlug()
  const redLight = await runJourney(page, "light", standSlug)
  const redDark = await runJourney(page, "dark", standSlug)
  const red = [...redLight, ...redDark]
  test.info().annotations.push({ type: "frames-red-count", description: String(red.length) })
  // Every stage still ran and its frame (whatever was on screen) is already on disk —
  // this assertion only decides the test's own pass/fail colour, per this file's
  // header comment: a red stage is evidence attached to a failing test, not a
  // silently skipped frame.
  expect(red, `${red.length} of 24 frame stages did not render as expected:\n${red.join("\n")}`).toHaveLength(0)
}

test.describe("frames @frames", () => {
  test.skip(!FRAMES_DIR, "FRAMES_DIR not set - frame capture opts in explicitly")

  test("captures every page in light and dark", async ({ page }) => {
    test.setTimeout(600_000)
    await runBothModes(page)
  })

  test("[@mobile] captures every page in light and dark", async ({ page }) => {
    test.setTimeout(600_000)
    await runBothModes(page)
  })
})
