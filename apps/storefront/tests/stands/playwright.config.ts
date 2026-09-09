import { defineConfig, devices } from "@playwright/test"

/**
 * Wave-3 stand scenarios (S-scenarios, task order t-2026-09-09-02) — walks a live
 * public stand the way a visitor would: the hidden theme panel, checkout with pickup
 * and the demo card's three outcomes, and every customer-account page.
 *
 * One config drives a desktop pass and a mobile pass. The mobile pass only runs specs
 * whose title carries the literal string "@mobile" (see the `grep`/`grepInvert` split
 * on the two projects below) — same tagging-by-title convention, just inverted, as
 * tests/devtools/disabled.pw.ts's own "other half" comment.
 *
 * Spec files are *.pw.ts: `test:unit` runs vitest over its default include and would
 * otherwise try to collect a Playwright suite (tests/devtools/playwright.config.ts,
 * tests/profile/playwright.config.ts already use the same extension for the same
 * reason).
 *
 * The browser does not start from an agent shell on macOS, so this runs inside the
 * Playwright Docker image whose tag equals the @playwright/test version in
 * package.json — same shape as test:devtools and test:profile.
 */
const baseURL = process.env.STAND_URL ?? "http://host.docker.internal:8000"

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  // Every stand here is a live, public, remote deployment (never localhost) reached
  // from inside a Docker container — page loads, hydration and the panel's own
  // lazy-mounted popover all cost real network time that a same-host dev-server
  // suite never pays. Playwright's 5s default is too tight for that; 15s matches
  // the slower steps measured against kerbstone (2026-09-10) with room to spare.
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "off",
    screenshot: "only-on-failure",
  },
  outputDir: "test-results",
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      grepInvert: /@mobile/,
    },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
      grep: /@mobile/,
    },
  ],
})
