import { readFileSync, readdirSync, statSync } from "fs"
import path from "path"

import { TABLE_SCROLL } from "../lib/table-scroll"

/**
 * t-2026-10-13-30. Ivan, 13.10: «нужно проверить все страницы панели тенантов и
 * платформы». The mobile audit (apps/tenant-panel/scripts/mobile-audit.mjs) found
 * our `/app/tenants/:id` wider than a 390 px screen: the administrators table had
 * no box to scroll in and three buttons sat beside the shop's name. The stock
 * Medusa pages are upstream and are not patched here.
 *
 * Source assertions: the admin extension is bundled by the dashboard, so the
 * guard is read from the files the bundler reads.
 */

const ROUTES = path.join(__dirname, "..", "routes")

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

// Comments may name `<Table>` too; only code counts.
const code = (text: string) =>
  text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

describe("our admin pages keep wide tables inside their card", () => {
  it("the shared box scrolls sideways and cannot grow past its parent", () => {
    for (const cls of [
      "overflow-x-auto",
      "max-w-full",
      "min-w-0",
      "[-webkit-overflow-scrolling:touch]",
      "overscroll-x-contain",
    ]) {
      expect(TABLE_SCROLL).toContain(cls)
    }
  })

  it("every hand-rolled Table under src/admin/routes sits in TABLE_SCROLL", () => {
    const bare: string[] = []
    for (const file of walk(ROUTES).filter((f) => f.endsWith(".tsx"))) {
      const lines = code(readFileSync(file, "utf8")).split("\n")
      lines.forEach((line, index) => {
        if (!/<(Table|table)(?=[\s>]|$)/.test(line)) return
        const before = lines
          .slice(0, index)
          .filter((l) => l.trim())
          .slice(-2)
          .join("\n")
        if (/TABLE_SCROLL|overflow-x-auto/.test(before)) return
        bare.push(`${path.relative(ROUTES, file)}:${index + 1}`)
      })
    }
    expect(bare).toEqual([])
  })

  it("the shop page's buttons wrap under its name on a phone", () => {
    const page = readFileSync(path.join(ROUTES, "tenants", "[id]", "page.tsx"), "utf8")
    expect(page).toContain('"flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 py-4"')
    expect(page).toContain('"flex flex-wrap items-center gap-2"')
  })
})
