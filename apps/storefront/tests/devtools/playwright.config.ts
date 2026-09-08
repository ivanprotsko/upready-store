import { defineConfig, devices } from "@playwright/test"

/**
 * T0i — the hidden settings panel.
 *
 * Two stands, because one of the checks is about a storefront where the feature does not
 * exist: DEVTOOLS_URL is a storefront started WITH STOREFRONT_DEVTOOLS_PASSWORD, and
 * DEVTOOLS_DISABLED_URL one started without it, where the route must answer 404.
 *
 * Spec files are *.pw.ts, like tests/profile: `test:unit` runs vitest over the default
 * include and would otherwise try to collect a Playwright suite.
 *
 * The browser does not start from an agent shell on macOS, so this runs inside the
 * Playwright Docker image whose tag equals the @playwright/test version in package.json —
 * same shape as ui-lab:test and test:profile.
 */
const baseURL = process.env.DEVTOOLS_URL ?? "http://host.docker.internal:8000"

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 90_000,
  use: {
    baseURL,
    trace: "off",
    screenshot: "off",
  },
  projects: [{ name: "devtools", use: { ...devices["Desktop Chrome"] } }],
})
