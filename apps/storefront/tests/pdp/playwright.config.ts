import {defineConfig, devices} from "@playwright/test"

/**
 * Product-page suite (b17). Unlike the older suites in this directory it runs
 * the Playwright browsers straight from the host — `chromium.launch()` was
 * measured working from an agent shell on this machine 2026-09-16, and local
 * Docker is off by Ivan's order of 2026-09-15 22:05 WITA.
 *
 * Point it at a running stand:
 *   PDP_URL=http://cherkashino.localhost:8417/ru/products/<handle> \
 *     npx playwright test --config tests/pdp/playwright.config.ts
 *
 * The product has to carry more than one image, or every navigation assertion
 * has nothing to navigate: the gallery deliberately draws no chrome for a
 * single photo. The suite says so out loud rather than passing vacuously.
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 90_000,
  use: {
    baseURL: process.env.PDP_URL,
    trace: "off",
    screenshot: "off",
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "pdp-desktop",
      use: {...devices["Desktop Chrome"], viewport: {height: 900, width: 1280}},
    },
  ],
})
