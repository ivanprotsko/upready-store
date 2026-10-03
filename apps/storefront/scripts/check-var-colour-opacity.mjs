#!/usr/bin/env node
// Guards the storefront against a Tailwind failure that has no error anywhere: an opacity modifier
// (`/50`, `/[.3]`) on a colour whose value is a bare `var(--x)`. Tailwind 3 cannot put an alpha into
// such a colour, so it drops the WHOLE class and the element keeps whatever colour it inherits. Both
// shapes behave this way:
//
//   - the @medusajs/ui-preset tokens, `bg-ui-bg-base/50`, `hover:border-ui-border-interactive/50`
//     (every `ui-*` colour of the preset is `var(--…)`);
//   - arbitrary values, `from-[var(--foreground)]/70`, which deleted the hero scrim (t-2026-09-08-02).
//
// The set of bare var() colours is read from the resolved tailwind.config.js, so a token added to
// the theme later is covered without touching this file. Comments are skipped. A hit that cannot be
// fixed in the same change goes into ALLOWED with its reason; everything else fails `pnpm lint`.
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const storefrontRoot = path.resolve(here, "..")
const srcDir = path.join(storefrontRoot, "src")

// Each entry is a real silent drop, left in place only because the file is outside the change that
// added this gate. Remove the entry together with the fix.
export const ALLOWED = [
  ...[
    "src/modules/checkout/components/checkout-shipping-section/index.tsx",
    "src/modules/checkout/components/checkout-payment-section/index.tsx",
  ].map((file) => ({
    file,
    token: "hover:border-ui-border-interactive/50",
    reason: "checkout is being rewritten by another line (46df L3); the hover border never changes colour",
  })),
  {
    file: "src/modules/checkout/components/checkout-pickup-map/index.tsx",
    token: "bg-ui-bg-base/90",
    reason: "checkout is being rewritten by another line (46df L3); the empty-map hint has no background",
  },
]

/** Names of the theme colours whose value is a bare `var(--x)`, e.g. `ui-bg-base`. */
export const bareVarColours = (config) => {
  const out = new Set()
  const visit = (node, prefix) => {
    for (const [key, value] of Object.entries(node)) {
      const name = key === "DEFAULT" ? prefix : prefix ? `${prefix}-${key}` : key
      if (value && typeof value === "object") visit(value, name)
      else if (typeof value === "string" && /^var\(--[^)]+\)$/.test(value.trim())) out.add(name)
    }
  }
  visit(config.theme.colors, "")
  return out
}

/** Blanks out comments while keeping every newline, so match offsets still map to lines. */
const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\w])\/\/[^\n]*/g, (line, lead) => lead + " ".repeat(line.length - lead.length))

// `<variants:>utility-<colour>/<opacity>`, the colour being `ui-…` or `[var(--x)]` / `[color:var(--x)]`.
const CLASS_WITH_OPACITY =
  /(?<![^\s"'`{(,])((?:[^\s"'`]*?:)?!?-?[a-z]+(?:-[a-z]+)*?-(ui-[a-z0-9]+(?:-[a-z0-9]+)*|\[(?:color:)?var\(--[^\]\s]*\)\])\/(?:\d+|\[[^\]\s]+\]))(?![\w-])/g

/** Every class in `text` that puts an opacity modifier on a bare var() colour. */
export const findOpacityOnVarColours = (text, colours) => {
  const code = stripComments(text)
  const hits = []
  for (const match of code.matchAll(CLASS_WITH_OPACITY)) {
    const [, token, colour] = match
    if (!colour.startsWith("[") && !colours.has(colour)) continue
    hits.push({ token, line: code.slice(0, match.index).split("\n").length })
  }
  return hits
}

const walk = (dir) => {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) out.push(full)
  }
  return out
}

export const main = () => {
  const require = createRequire(import.meta.url)
  const resolveConfig = require("tailwindcss/resolveConfig")
  const colours = bareVarColours(resolveConfig(require(path.join(storefrontRoot, "tailwind.config.js"))))

  const failures = []
  const allowedSeen = new Set()
  for (const file of walk(srcDir)) {
    const relative = path.relative(storefrontRoot, file).split(path.sep).join("/")
    for (const hit of findOpacityOnVarColours(fs.readFileSync(file, "utf8"), colours)) {
      const allowed = ALLOWED.find((entry) => entry.file === relative && entry.token === hit.token)
      if (allowed) allowedSeen.add(allowed)
      else failures.push(`  ${relative}:${hit.line}  ${hit.token}`)
    }
  }

  for (const entry of ALLOWED) {
    if (!allowedSeen.has(entry)) {
      console.warn(`check-var-colour-opacity: stale ALLOWED entry, remove it: ${entry.file} ${entry.token}`)
    }
  }

  if (failures.length > 0) {
    console.error(
      [
        "An opacity modifier on a bare var() colour makes Tailwind drop the whole class, with no error:",
        ...failures,
        "Use a colour that carries its own alpha (color-mix() in an arbitrary value, rgba(), an inline style) or drop the modifier.",
      ].join("\n"),
    )
    return 1
  }
  console.log(
    `check-var-colour-opacity: ok (${colours.size} bare var() colours, ${allowedSeen.size} allow-listed hits)`,
  )
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main()
}
