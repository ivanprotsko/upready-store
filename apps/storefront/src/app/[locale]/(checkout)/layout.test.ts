import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * t-2026-10-12-05, Ivan 12.10 items 1.1, 1.2 and 6.2: the checkout header. Async Server
 * Component, no renderer here: asserted on source, the convention `(main)/layout.test.ts` uses.
 */

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, "layout.tsx"), "utf8")
const header = source.slice(source.indexOf("<header"), source.indexOf("</header>"))
const logo = readFileSync(
  join(here, "../../../modules/layout/components/header-logo/index.tsx"),
  "utf8"
)

describe("the checkout header", () => {
  it("1.1: draws the main header's logo, not the shop name as plain text", () => {
    expect(header).toContain('<HeaderLogo testId="store-link" />')
    expect(header).not.toContain("{siteName}")
    // cherkashino.ru's main header is H7: the same Ruslan Display wordmark box.
    expect(logo).toContain("className={clx(h7.wordmark, styles.wordmark)}")
    expect(logo).toContain("<SiteLogo siteName={siteName} branding={branding} />")
  })

  it("1.2: leads back to the cart, named «Вернуться в корзину» at every width", () => {
    expect(header).toMatch(/<Link\s+href="\/cart"\s+aria-label=\{t\("backToCart"\)\}/)
    expect(header).toContain('<span className="small:hidden">{t("backToCartShort")}</span>')
    expect(header).toContain('<span className="hidden small:inline">{t("backToCart")}</span>')
  })

  it("6.2: shows the signed-in buyer's avatar instead of a user icon, as no link", () => {
    expect(header).not.toContain("UserMini")
    expect(header).toContain("<CustomerAvatar")
    const signedIn = header
      .slice(header.indexOf("{customer ? ("), header.indexOf(") : ("))
      .replace(/\/\/.*$/gm, "")
    expect(signedIn).not.toMatch(/<Link|<a\b|<button|AccountLink|hover:/)
  })
})
