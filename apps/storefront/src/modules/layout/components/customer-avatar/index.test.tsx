import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import CustomerAvatar from "."

/**
 * t-2026-10-12-05, Ivan 12.10 item 6.2: «показывать аватар если я залогинен а не иконку
 * "пользователя", но он долен остаться не кликабельным».
 */

describe("the checkout header's avatar", () => {
  it("draws the Yandex ID picture when there is one", () => {
    const html = renderToStaticMarkup(
      <CustomerAvatar src="https://avatars.yandex.net/get-yapic/1/a/islands-retina-50" initials="ИП" />
    )
    expect(html).toContain('data-kind="picture"')
    expect(html).toContain('src="https://avatars.yandex.net/get-yapic/1/a/islands-retina-50"')
    expect(html).not.toContain("ИП")
  })

  it("falls back to the initials in a circle", () => {
    const html = renderToStaticMarkup(<CustomerAvatar src={null} initials="ИП" />)
    expect(html).toContain('data-kind="initials"')
    expect(html).toContain(">ИП<")
    expect(html).toContain("rounded-full")
  })

  it("is no link, no button and no focus stop", () => {
    const html = renderToStaticMarkup(<CustomerAvatar src={null} initials="I" />)
    expect(html).not.toMatch(/<a\b|<button\b|tabindex|cursor-pointer|hover:/)
    expect(html).toContain('aria-hidden="true"')
  })
})
