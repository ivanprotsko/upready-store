import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * t-2026-10-09-75. A batch's cards are async server components: they can still be streaming when
 * the batch's answer is. Appended without a boundary of their own, they suspended the page's
 * boundary, and React hid the whole list behind the catalog skeleton while the buyer scrolled
 * (stand trace, 1440, 4 screens a second: the list hidden up to 3.6 s).
 */
const source = readFileSync(join(__dirname, "index.tsx"), "utf8")

describe("InfiniteProducts: a batch waits inside its own boundary", () => {
  it("each batch is wrapped in a Suspense whose fallback is its own loading cards", () => {
    expect(source).toMatch(/import \{[^}]*\bSuspense\b[^}]*\} from "react"/)
    expect(source).toMatch(
      /<Suspense key=\{batch\.offset\} fallback=\{placeholders\(batch\.count, `batch-\$\{batch\.offset\}`\)\}>\s*\{batch\.items\}\s*<\/Suspense>/
    )
  })

  it("a batch keeps how many products it brought, so its loading cards hold the same place", () => {
    expect(source).toContain("{ offset, count: batch.received, items: batch.items }")
  })

  it("no batch is appended bare", () => {
    expect(source).not.toMatch(/<Fragment key=\{batch\.offset\}>/)
  })
})

describe("InfiniteProducts: the first request shows its loading cards", () => {
  // Hydrated inside a streamed boundary, the list's effects run at offscreen priority; a state
  // set there waited, idle, until the batch's request was over (stand trace, 390, 09.10.2026).
  it("starts the loader after the effect, not inside it", () => {
    expect(source).toMatch(/queueMicrotask\(\(\) => \{\s*if \(live\) loader\.start\(saved\)\s*\}\)/)
    expect(source).not.toMatch(/^\s*loader\.start\(saved\)\s*$/m)
  })
})
