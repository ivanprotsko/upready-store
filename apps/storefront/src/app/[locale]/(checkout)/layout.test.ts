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
// What the header draws, without the comments that quote Ivan's words.
const drawn = header.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "")
const backLink = header.slice(
  header.search(/<Link\s+href="\/cart"/),
  header.indexOf("</Link>", header.search(/<Link\s+href="\/cart"/)) + "</Link>".length
)
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
    expect(backLink).toContain('data-testid="checkout-back-to-cart"')
  })

  // t-2026-10-13-20, Ivan 13.10 ~19:15: «кнопку назад в виде обычной иконки со стрелкой назад».
  it("draws the way back as a plain back-arrow icon, with no visible text", () => {
    const children = backLink
      .slice(backLink.indexOf(">") + 1, backLink.lastIndexOf("</Link>"))
      .trim()
    expect(children).toBe('<ArrowLeft className="rtl:rotate-180" aria-hidden />')
    // A 40 px round target at least, centred, so the logo keeps its column.
    expect(backLink).toMatch(/className="[^"]*\bh-10 w-10\b[^"]*"/)
    expect(backLink).toMatch(/className="[^"]*\bitems-center justify-center rounded-full\b/)
    // Neither label is drawn anywhere in the header, only named.
    expect(drawn).not.toMatch(/\{t\("backToCartShort"\)\}/)
    expect(drawn).not.toMatch(/>\s*\{t\("backToCart"\)\}/)
    expect(drawn).not.toMatch(/Корзина|Вернуться в корзину/)
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
