import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

/**
 * The unit suites import through the same `@lib/*`, `@modules/*` and `@i18n/*`
 * aliases the app does (tsconfig.json "paths"); Next resolves them from
 * tsconfig, vitest does not, so a suite that touched anything but its own folder
 * used to have to reach for a relative path. Aliases only — the include globs
 * and the exclusions stay on the `test` script in package.json.
 */
const src = (segment: string) =>
  fileURLToPath(new URL(`./src/${segment}`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@lib": src("lib"),
      "@modules": src("modules"),
      "@i18n": src("i18n"),
    },
  },
  test: {
    // next-intl's ESM build imports `next/navigation` without an extension,
    // which Node's own resolver rejects; run it through Vite's instead.
    server: { deps: { inline: ["next-intl"] } },
  },
})
