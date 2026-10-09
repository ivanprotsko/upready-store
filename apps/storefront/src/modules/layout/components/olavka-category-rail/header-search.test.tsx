import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ path: "/" }))

vi.mock("@i18n/navigation", () => ({ usePathname: () => state.path }))
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))

import HeaderSearch from "./header-search"

/**
 * t-2026-10-09-75. Ivan, 09.10: «вот эту навигацию оставляем только на главной странице». The
 * brief: search, if the row was its only place, stays reachable on the other pages the way the
 * header offers it. The bar's magnifier steps aside only where the row and its own magnifier are.
 */
const render = (railDrawn: boolean) =>
  renderToStaticMarkup(<HeaderSearch className="icon-button" railDrawn={railDrawn} />)

beforeEach(() => {
  state.path = "/"
})

describe("the h7 bar's magnifier", () => {
  it("is not drawn on the home page, where the row's magnifier is", () => {
    expect(render(true)).toBe("")
  })

  it.each(["/store", "/categories/asd", "/products/asd-1", "/collections/hits", "/cart", "/account"])(
    "is drawn on %s, and opens the one search palette",
    (path) => {
      state.path = path
      const html = render(true)

      expect(html).toContain('data-testid="search-button"')
      expect(html).toContain('aria-haspopup="dialog"')
      expect(html).toContain('class="icon-button"')
    }
  )

  it("is drawn on the home page of a shop with no category, which has no row", () => {
    expect(render(false)).toContain('data-testid="search-button"')
  })
})
