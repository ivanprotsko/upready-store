import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * A-20 (46df audit, B-07, WCAG 2.2 SC 2.4.1): no way to skip the header and
 * jump straight to `#main-content` — a keyboard or screen-reader visitor had
 * to tab through the whole nav (and `PromoBanner`'s own close button) on
 * every single page. Async Server Component, no renderer here — asserted on
 * source, the same convention `(main)/reset-password/page.test.ts` uses.
 */

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, "layout.tsx"), "utf8")

describe("(main) layout: a skip link precedes everything else", () => {
  it("the skip link is the first element in the returned tree, before PromoBanner", () => {
    const returnIndex = source.indexOf("return (")
    const skipLinkIndex = source.indexOf('href="#main-content"')
    const promoBannerIndex = source.indexOf("<PromoBanner")
    expect(skipLinkIndex).toBeGreaterThan(returnIndex)
    expect(skipLinkIndex).toBeLessThan(promoBannerIndex)
  })

  it("points at the one #main-content landmark this layout renders", () => {
    expect(source).toContain('id="main-content"')
  })

  it("is hidden until focused (sr-only / focus:not-sr-only)", () => {
    const aTagIndex = source.indexOf("<a")
    const classIndex = source.indexOf("sr-only focus:not-sr-only")
    expect(classIndex).toBeGreaterThan(aTagIndex)
  })

  it("its text comes from the message catalog, not a hard-coded string", () => {
    expect(source).toContain('t("skipToContent")')
  })
})

describe("Nav.skipToContent: present in every one of the 36 message catalogs", () => {
  const messagesDir = join(here, "../../../../messages")
  const files = readdirSync(messagesDir).filter((f) => f.endsWith(".json"))

  it("found all 36 catalogs", () => {
    expect(files.length).toBe(36)
  })

  it.each(files)("%s carries Nav.skipToContent", (file) => {
    const catalog = JSON.parse(readFileSync(join(messagesDir, file), "utf8"))
    expect(typeof catalog.Nav?.skipToContent).toBe("string")
    expect(catalog.Nav.skipToContent.length).toBeGreaterThan(0)
  })
})
