import { defineConfig, devices } from "@playwright/test"

/**
 * Cart → checkout suite (t-2026-09-24-n1). Runs the Playwright browsers straight
 * from the host, the way `tests/pdp/playwright.config.ts` does (measured working
 * from an agent shell on this machine 2026-09-16; local Docker is off by Ivan's
 * order of 2026-09-15 22:05 WITA). It never starts its own stand: point it at one
 * already running (backend + storefront) with `E2E_BASE_URL`.
 *
 *   E2E_BASE_URL=http://cherkashino.localhost:8122 \
 *     npx playwright test --config e2e/cart/playwright.config.ts
 *
 * DATA SAFETY: this suite adds to cart, fills addresses and places real orders.
 * Never point E2E_BASE_URL at a storefront backed by the shared stand database
 * (see apps/backend README "e2e" section) — only at a backend on its own clone.
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 90_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://cherkashino.localhost:8122",
    trace: "off",
    screenshot: "off",
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "desktop-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-390",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
})
