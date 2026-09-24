import { defineConfig, devices } from "@playwright/test"

/**
 * Cart → checkout suite (t-2026-09-24-n1). Runs the Playwright browsers straight
 * from the host, the way `tests/pdp/playwright.config.ts` does (measured working
 * from an agent shell on this machine 2026-09-16; local Docker is off by Ivan's
 * order of 2026-09-15 22:05 WITA). It never starts its own stand: point it at one
 * already running (backend + storefront) with `E2E_BASE_URL`.
 *
 *   E2E_BASE_URL=http://cherkashino.localhost:8122 \
 *   E2E_DATABASE_URL=postgres://ivanprotsko@127.0.0.1:5433/upready_store_e2e \
 *   E2E_EXPECTED_BACKEND_URL=http://localhost:9131 \
 *     npx playwright test --config e2e/cart/playwright.config.ts
 *
 * DATA SAFETY: this suite adds to cart, fills addresses and places real orders.
 * Never point E2E_BASE_URL at a storefront backed by the shared stand database
 * (see apps/backend README "e2e" section) — only at a backend on its own clone.
 * `globalSetup` (`../lib/verify-e2e-backend.mjs`) enforces this before the first
 * test: it refuses to run unless `E2E_DATABASE_URL` names an e2e-labelled
 * database AND the storefront's own compiled build has `E2E_EXPECTED_BACKEND_URL`
 * baked in — see that file's header for the incident (2026-09-24) this closes.
 */
export default defineConfig({
  testDir: ".",
  globalSetup: "../lib/verify-e2e-backend.mjs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // One retry outside CI: this machine runs many worktrees' stands and agent
  // sessions at once (load average 15-20 is routine, not a fluke), and a
  // Suspense boundary or a form save that is merely SLOW under that load reads
  // identically to a timeout on the first try. Every retry observed while
  // building this suite passed clean with no code change — a real defect does
  // not start passing on its own.
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [["list"]],
  timeout: 90_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://cherkashino.localhost:8122",
    trace: "off",
    screenshot: "off",
    actionTimeout: 20_000,
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
