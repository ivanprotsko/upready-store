import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-04-15 (Ivan, 04.10.2026): «в ходе недавних изменений в сайдбаре его сделали
 * слева, а он должен быть справа». Commit b5fdb6a1 (PR #232) had flipped the one
 * constant that drives both the pin and the slide direction of the cart sidebar to
 * "left"; Figma frame 3:60739 "Sidebar" and the shop have it on the right.
 *
 * `CartSidebar` is a client component this package has no renderer for (no
 * @testing-library/react here — the same constraint `login-render.test.ts` works
 * around), so the side is asserted on the source: the exported constant must read
 * "right", and nothing else in the file may pin the panel to the left edge.
 */
const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, "index.tsx"), "utf8")

describe("cart sidebar side", () => {
  it("is pinned to the right edge", () => {
    expect(source).toMatch(/export const CART_SIDEBAR_SIDE = "right" as "left" \| "right"/)
  })

  it("derives the panel side from that one constant only", () => {
    expect(source).toMatch(/const SIDE = CART_SIDEBAR_SIDE/)
    // No second, hard-coded answer to the same question anywhere else in the file.
    const otherSideLiterals = source
      .split("\n")
      .filter((line) => /const SIDE\b/.test(line) && /"left"|"right"/.test(line))
      .filter((line) => !/CART_SIDEBAR_SIDE/.test(line))
    expect(otherSideLiterals).toEqual([])
  })
})
