import { defineConfig, devices } from "@playwright/test"

// T0h.5 compatibility proof. Same rule as tests/ui-lab: the browser does not start from
// an agent shell on macOS, so this runs inside the Playwright Docker image whose tag
// equals the @playwright/test version in package.json. Runner: see the report.
const baseURL = process.env.THEME_URL ?? "http://host.docker.internal:8031"

export default defineConfig({
  testDir: "./tests/theme",
  // *.pwspec.ts, not *.spec.ts: the storefront's `test:unit` script runs vitest over
  // src/** and tests/**, excluding only tests/ui-lab, and vitest would otherwise try to
  // collect this Playwright suite. Renaming keeps both runners honest without a
  // package.json change.
  testMatch: "**/*.pwspec.ts",
  // Baselines live under test-results/, which apps/storefront/.gitignore already
  // ignores: they are 1280x800 PNGs, rewritten by the --update-snapshots pass on every
  // measurement, and binaries have no business in git history (rule 21f).
  snapshotPathTemplate: "test-results/theme-shots/{arg}{ext}",
  // Playwright empties outputDir at the start of every run, which would take the
  // baseline with it if the two shared a directory.
  outputDir: "test-results/artifacts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 180_000,
  use: {
    baseURL,
    viewport: { width: 1280, height: 800 },
    colorScheme: "light",
    trace: "off",
    screenshot: "off",
  },
  projects: [{ name: "theme", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
})
