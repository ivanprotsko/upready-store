import { defineConfig, devices } from "@playwright/test"

/**
 * Course purchase suite (o24-courses part (e)): buy the liver course → checkout
 * without a delivery step → lesson opens → mark viewed → progress shows. Same
 * shape as `e2e/cart/playwright.config.ts` — read that file's header for the
 * env vars and the data-safety rule (never point `E2E_BASE_URL` at a storefront
 * backed by the shared stand database). This worker's own storefront build
 * runs on port 8132, not the shared 8122 stand.
 *
 *   E2E_BASE_URL=http://cherkashino.localhost:8132 \
 *   E2E_DATABASE_URL=postgres://ivanprotsko@127.0.0.1:5433/upready_store_e2e \
 *   E2E_EXPECTED_BACKEND_URL=http://localhost:9131 \
 *     npx playwright test --config e2e/courses/playwright.config.ts
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
  },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://cherkashino.localhost:8132",
    trace: "off",
    screenshot: "off",
    actionTimeout: 20_000,
    // The lesson player is reached by clicking a `next-intl` `Link`
    // (`localePrefix: "never"`, `src/i18n/routing.ts`), which renders an
    // UNPREFIXED href — the middleware then negotiates the locale for that
    // navigation fresh from `Accept-Language` (deliberately, not from the
    // referring page's own locale: `src/middleware.ts`'s own comment on
    // `chosenLocale`, fixing incident t-2026-09-10-01). Playwright's default
    // Chromium profile sends `en-US`, so without this the click away from
    // `/ru/...` landed on `/en/...` (found live: the lesson player rendered in
    // English). A real Russian-speaking visitor's browser already sends `ru`
    // and never sees this; this only fixes the TEST's browser to match one.
    locale: "ru-RU",
  },
  projects: [
    {
      name: "desktop-1440",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-390",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
})
