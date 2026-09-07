import { defineConfig, devices } from "@playwright/test"

/**
 * Store-profile specs. Separate from playwright.config.ts (tests/ui-lab) because these run
 * against a storefront built from the fixture profile in tests/profile/fixtures, on its own
 * port, and must not be swept up by the ui-lab suite.
 *
 * Spec files are named *.pw.ts rather than *.spec.ts on purpose: `test:unit` runs vitest with
 * the default include (**\/*.{test,spec}.*) and would otherwise try to collect them.
 *
 * The browser does not start from an agent shell on macOS, so this suite runs inside the
 * Playwright Docker image whose tag equals the @playwright/test version in package.json —
 * same shape as the ui-lab:test script.
 */
const baseURL = process.env.PROFILE_URL ?? "http://host.docker.internal:8033"

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "off",
    screenshot: "off",
  },
  projects: [
    { name: "profile-desktop", use: { ...devices["Desktop Chrome"] } },
  ],
})
