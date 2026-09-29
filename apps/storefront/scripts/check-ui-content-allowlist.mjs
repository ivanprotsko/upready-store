#!/usr/bin/env node
// Guards AGENTS.md's own "Things That Break Silently" note: tailwind.config.js's `content` array
// lists one glob per `@medusajs/ui` component this storefront actually imports (scanning the
// whole kit costs ~19 KB of unused CSS). Importing a new primitive and forgetting its glob means
// the component renders unstyled, with no build error and no lint error — this script is the
// error. It greps every `import { ... } from "@medusajs/ui"` under src (multi-line included),
// maps each PascalCase export to its kebab-case dist directory, and fails if tailwind.config.js
// has no matching `components/<name>/**/*.js` glob for it.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const storefrontRoot = path.resolve(here, "..")
const srcDir = path.join(storefrontRoot, "src")
const tailwindConfigPath = path.join(storefrontRoot, "tailwind.config.js")

const walk = (dir) => {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

const toKebabCase = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase()

const importPattern = /import\s*\{([^}]*)\}\s*from\s*["']@medusajs\/ui["']/gs

const usedComponents = new Set()
for (const file of walk(srcDir)) {
  const text = fs.readFileSync(file, "utf8")
  for (const match of text.matchAll(importPattern)) {
    for (const rawName of match[1].split(",")) {
      const name = rawName.trim().split(/\s+as\s+/)[0].trim()
      // `clx` and any other lowercase-first export is a utility, not a styled component with its
      // own compiled dist directory under `components/`.
      if (name && /^[A-Z]/.test(name)) usedComponents.add(name)
    }
  }
}

const tailwindConfig = fs.readFileSync(tailwindConfigPath, "utf8")
const globbedDirs = new Set(
  [...tailwindConfig.matchAll(/components\/([a-z0-9-]+)\//g)].map((m) => m[1]),
)

const missing = [...usedComponents]
  .map((name) => ({ name, dir: toKebabCase(name) }))
  .filter(({ dir }) => !globbedDirs.has(dir))

if (missing.length > 0) {
  console.error(
    "tailwind.config.js is missing the content glob for these imported @medusajs/ui components:",
  )
  for (const { name, dir } of missing) {
    console.error(
      `  ${name} -> add "./node_modules/@medusajs/ui/dist/esm/components/${dir}/**/*.js"`,
    )
  }
  console.error(
    "\nAdd each line to the content array (AGENTS.md, Things That Break Silently) — the component renders unstyled otherwise, with no error anywhere.",
  )
  process.exit(1)
}

console.log(
  `check-ui-content-allowlist: ${usedComponents.size} @medusajs/ui component(s) imported, all covered by tailwind.config.js.`,
)
