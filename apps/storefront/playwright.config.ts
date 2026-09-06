import {defineConfig, devices} from "@playwright/test"

// The browser does not start from an agent shell on macOS (detached Aqua session,
// no Mach bootstrap namespace), so this suite runs inside the Playwright Docker
// image whose tag equals the @playwright/test version in package.json.
// Runner: pnpm ui-lab:test
const baseURL = process.env.UI_LAB_URL ?? "http://host.docker.internal:8001"

export default defineConfig({
  testDir: "./tests/ui-lab",
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
    {
      name: "ui-lab",
      use: {...devices["Desktop Chrome"]},
    },
  ],
})
