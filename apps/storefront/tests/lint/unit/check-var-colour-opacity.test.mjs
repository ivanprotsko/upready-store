import { createRequire } from "node:module"

import { describe, expect, it } from "vitest"

import {
  bareVarColours,
  findOpacityOnVarColours,
} from "../../../scripts/check-var-colour-opacity.mjs"

const require = createRequire(import.meta.url)
const resolveConfig = require("tailwindcss/resolveConfig")
const colours = bareVarColours(resolveConfig(require("../../../tailwind.config.js")))

describe("check-var-colour-opacity", () => {
  it("reads the bare var() colours from the resolved Tailwind config", () => {
    expect(colours.has("ui-bg-base")).toBe(true)
    expect(colours.has("ui-border-interactive")).toBe(true)
    expect(colours.has("grey-50")).toBe(false)
  })

  it("fails a class that puts an opacity modifier on a bare var() colour", () => {
    const sample = [
      `<div className="flex bg-ui-bg-base/50 p-2" />`,
      `const scrim = clx("hover:border-ui-border-interactive/50", "from-[var(--foreground)]/70")`,
      "const ink = `text-ui-fg-muted/[.8]`",
    ].join("\n")

    expect(findOpacityOnVarColours(sample, colours)).toEqual([
      { token: "bg-ui-bg-base/50", line: 1 },
      { token: "hover:border-ui-border-interactive/50", line: 2 },
      { token: "from-[var(--foreground)]/70", line: 2 },
      { token: "text-ui-fg-muted/[.8]", line: 3 },
    ])
  })

  it("passes plain tokens, colours with their own alpha and comments", () => {
    const sample = [
      `<div className="bg-ui-bg-base text-ui-fg-muted bg-grey-50/50 bg-transparent" />`,
      `<div className="bg-[color-mix(in_srgb,var(--bg-base)_90%,transparent)] text-[rgba(255,255,255,0.86)]" />`,
      `// not \`from-[var(--foreground)]/70\`, which Tailwind drops`,
      `/* bg-ui-bg-base/90 */`,
      `const href = "https://example.com/ui-bg-base/50"`,
    ].join("\n")

    expect(findOpacityOnVarColours(sample, colours)).toEqual([])
  })
})
