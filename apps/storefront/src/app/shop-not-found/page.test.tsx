import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

/**
 * t-2026-10-12-32 FX4: what an address with no shop shows, once
 * `src/middleware.ts` has rewritten it here with a 404
 * (`middleware.unknown-host.test.ts`): «Магазин не найден» with the address the
 * visitor typed, drawn by the server — not left to the browser.
 */

let requestHeaders = new Headers()

vi.mock("next/headers", () => ({ headers: async () => requestHeaders }))

const render = async () => {
  const { default: ShopNotFoundPage } = await import("./page")
  return renderToStaticMarkup(await ShopNotFoundPage())
}

describe("/shop-not-found", { timeout: 30_000 }, () => {
  it("says «Магазин не найден» and «Shop not found» and shows the address without its port", async () => {
    requestHeaders = new Headers({ host: "nosuchshop-t32.shipshift.dev:8431" })

    const html = await render()

    expect(html).toContain('<h1 class="')
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

    const html = await render()

    expect(html).toContain(">beautyprojapan.shipshift.dev<")
    expect(html).not.toContain("mt-storefront")
  })

  it("names no shop and no server error, and links nowhere", async () => {
    requestHeaders = new Headers({ host: "nosuchshop-t32.shipshift.dev" })

    const html = await render()

    expect(html).not.toMatch(/Gorgo|Bad Gateway|502|500|ошибка сервера/i)
    expect(html).not.toContain("<a ")
  })

  it("keeps the address out of search", async () => {
    const { metadata } = await import("./layout")

    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.title).toBe("Магазин не найден · Shop not found")
  })

  it("gives the 404 its own tab title, not the root not-found's with the build profile's name", async () => {
    const { metadata } = await import("./layout")
    const notFound = await import("./not-found")

    expect(notFound.metadata).toEqual(metadata)
    expect(notFound.default).toBe((await import("./page")).default)
  })
})
