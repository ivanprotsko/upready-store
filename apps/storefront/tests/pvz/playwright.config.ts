import { defineConfig, devices } from "@playwright/test"

/**
 * Checkout pickup-map and address-suggest suite (i03-checkout-pvz-map-address-suggest).
 *
 * Runs the browsers straight from the host, like `tests/pdp`: `chromium.launch()`
 * was measured working from an agent shell on this machine 2026-09-16, and local
 * Docker is off by Ivan's order of 2026-09-15 22:05 WITA.
 *
 * Point it at a running stand:
 *   PVZ_URL=http://cherkashino.localhost:8163 \
 *     npx playwright test --config tests/pvz/playwright.config.ts
 *
 * Nothing here talks to a carrier or to Yandex: the CDEK reads are the
 * storefront's own `/api/cdek/*` routes, answered from `fixtures.ts`, and the
 * Yandex loader is replaced by a stub that records what the map was asked to
 * draw. The stand still has to be up, because the checkout flow in front of the
 * sheet (cart, contacts, address) is real.
 *
 * The mobile project runs the specs whose title carries "@mobile"; the desktop
 * project runs the rest — the same tagging-by-title split `tests/stands` uses.
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.PVZ_URL ?? "http://cherkashino.localhost:8163",
    trace: "off",
    screenshot: "off",
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "pvz-desktop",
      grepInvert: /@mobile/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "pvz-mobile",
      grep: /@mobile/,
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
    },
  ],
})
