import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

/**
 * t-2026-10-12-32 FX4: what an address with no shop answers, once
 * `src/middleware.ts` has rewritten it here (`middleware.unknown-host.test.ts`).
 * The page throws Next's own not-found, which is the 404 status; `not-found.tsx`
 * draws «Магазин не найден» with the address the visitor typed.
 */

let requestHeaders = new Headers()

vi.mock("next/headers", () => ({ headers: async () => requestHeaders }))

describe("/shop-not-found", { timeout: 30_000 }, () => {
  it("answers 404 through Next's not-found, never a page of its own", async () => {
    const { default: ShopNotFoundPage } = await import("./page")

    let thrown: unknown
    try {
      ShopNotFoundPage()
    } catch (error) {
      thrown = error
    }

    expect((thrown as { digest?: string })?.digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404")
  })

  it("says «Магазин не найден» and «Shop not found» and shows the address without its port", async () => {
    requestHeaders = new Headers({ host: "nosuchshop-t32.shipshift.dev:8431" })
    const { default: ShopNotFound } = await import("./not-found")

    const html = renderToStaticMarkup(await ShopNotFound())

    expect(html).toContain('lang="ru">Магазин не найден<')
    expect(html).toContain('lang="en">Shop not found<')
    expect(html).toContain(">nosuchshop-t32.shipshift.dev<")
    expect(html).not.toContain(":8431")
    expect(html).toContain("Проверьте адрес")
    expect(html).toContain("Check it for a typo")
  })

  it("shows the address the visitor asked for, not the proxy's socket", async () => {
    requestHeaders = new Headers({
      host: "mt-storefront:8000",
      "x-forwarded-host": "beautyprojapan.shipshift.dev",
    })
    const { default: ShopNotFound } = await import("./not-found")

    const html = renderToStaticMarkup(await ShopNotFound())

    expect(html).toContain(">beautyprojapan.shipshift.dev<")
    expect(html).not.toContain("mt-storefront")
  })

  it("names no shop and no server error", async () => {
    requestHeaders = new Headers({ host: "nosuchshop-t32.shipshift.dev" })
    const { default: ShopNotFound } = await import("./not-found")

    const html = renderToStaticMarkup(await ShopNotFound())

    expect(html).not.toMatch(/Gorgo|Bad Gateway|502|500|ошибка сервера/i)
    expect(html).not.toContain("<a ")
  })

  it("keeps the address out of search", async () => {
    const { metadata } = await import("./layout")

    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.title).toBe("Магазин не найден · Shop not found")
  })
})
