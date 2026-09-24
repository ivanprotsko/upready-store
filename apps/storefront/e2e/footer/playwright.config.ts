import { defineConfig, devices } from "@playwright/test"

/**
 * Footer F7 suite (t-2026-09-24-n1, step 6). Same host-Chrome pattern as
 * `e2e/cart/playwright.config.ts` — see its header comment for why no Docker.
 *
 *   E2E_BASE_URL=http://cherkashino.localhost:8122 \
 *   E2E_DATABASE_URL=postgres://ivanprotsko@127.0.0.1:5433/upready_store_e2e \
 *   E2E_EXPECTED_BACKEND_URL=http://localhost:9131 \
 *   E2E_REVALIDATE_SECRET=<apps/backend/.env REVALIDATE_SECRET> \
 *     npx playwright test --config e2e/footer/playwright.config.ts
 *
 * DATA SAFETY: the suite's own `beforeAll` writes `tenant_home_config.config.
 * settings.footer = "f7"` for cherkashino through `E2E_DATABASE_URL` before any
 * page loads — never point it at the shared stand database. F7 is a real
 * owner-panel setting (`apps/tenant-panel/src/routes/home-settings`); this is
 * the same write that panel makes, done directly since the suite has no owner
 * session to drive the panel's own UI with. `globalSetup`
 * (`../lib/verify-e2e-backend.mjs`) enforces this before the first test: it
 * refuses to run unless `E2E_DATABASE_URL` names an e2e-labelled database AND
 * the storefront's own compiled build has `E2E_EXPECTED_BACKEND_URL` baked in
 * — see that file's header for the incident (2026-09-24) this closes.
 */
export default defineConfig({
  testDir: ".",
  globalSetup: "../lib/verify-e2e-backend.mjs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
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
