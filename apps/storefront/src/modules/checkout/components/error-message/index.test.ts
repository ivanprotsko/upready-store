import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * A-19 (46df audit, B-05, WCAG 2.2 SC 4.1.3): a checkout error rendered as a
 * plain `<div>` — a screen reader never announced it, because nothing marks
 * the container as a live region. Client component (`useErrorMessage`), no
 * renderer here — the repository has no `@testing-library/react` and every
 * other component-shape test in this app asserts on source instead
 * (`(main)/reset-password/page.test.ts`).
 */

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, "index.tsx"), "utf8")

describe("ErrorMessage: announced to assistive tech", () => {
  it("the error container carries role=alert", () => {
    const divIndex = source.indexOf("<div")
    const roleIndex = source.indexOf('role="alert"')
    const closeIndex = source.indexOf(">", divIndex)
    expect(roleIndex).toBeGreaterThan(divIndex)
    expect(roleIndex).toBeLessThan(closeIndex)
  })
})
