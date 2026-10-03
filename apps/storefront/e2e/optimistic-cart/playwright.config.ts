import { defineConfig, devices } from "@playwright/test"

/**
 * The client cart queue suite (t-2026-10-03-66). Runs the Playwright browsers from the
 * host against a storefront that is already running; it never starts one.
 *
 *   E2E_BASE_URL=http://olavka-com.localhost:8766 \
 *     npx playwright test --config e2e/optimistic-cart/playwright.config.ts
 *
 * Unlike `e2e/cart`, this suite needs no database clone of its own: every test opens a
 * fresh browser context, so it only ever touches the cart that context creates, and it
 * places no order. Pointing it at a shared stand leaves a few abandoned carts behind,
 * nothing more.
 *
 * `E2E_PRODUCT` names a product of that shop with one variant in stock and the
 * «В КОРЗИНЕ − N +» pill (an Olavka-family shop); `propolis` by default.
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://olavka-com.localhost:8766",
    trace: "off",
    screenshot: "off",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "desktop-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
})
