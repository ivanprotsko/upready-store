import { Fragment, type ReactElement } from "react"
import { describe, expect, it } from "vitest"

import HydrationSlot from "@modules/common/components/hydration-slot"
import { Link, getPathname, localeOfHref } from "./navigation"

/**
 * Internal links carry the locale themselves, so a click never goes through
 * the middleware's 302 (46df A-10).
 */
describe("internal hrefs", () => {
  it("get the locale in front of them", () => {
    expect(getPathname({ href: "/store", locale: "ru" })).toBe("/ru/store")
    expect(getPathname({ href: "/pages/privacy", locale: "en" })).toBe("/en/pages/privacy")
    expect(getPathname({ href: "/", locale: "ru" })).toBe("/ru")
    expect(getPathname({ href: "/checkout?step=address", locale: "ru" })).toBe("/ru/checkout?step=address")
  })

  it("that already name a locale are recognised, so the Link does not prefix them twice", () => {
    expect(localeOfHref("/ru/store")).toBe("ru")
    expect(localeOfHref("/en")).toBe("en")
    expect(localeOfHref("/ru?x=1")).toBe("ru")
    expect(localeOfHref("/store")).toBeNull()
    expect(localeOfHref("/russia")).toBeNull()
    expect(localeOfHref("https://olavka.com/ru")).toBeNull()
    expect(localeOfHref({ pathname: "/store" })).toBeNull()
  })
})

/**
 * In a Server Component next-intl's Link suspends on the locale, so the RSC
 * payload carries it as a lazy row. Straight under a `<div>` that lazy makes
 * React 19.2 replay the `<div>` and claim its first child instead of it: #418 on
 * /checkout, 1–2 loads of 10 in Chromium (46df U-06).
 */
describe("Link", () => {
  it("puts next-intl's Link under a keyed Fragment, not straight under the parent element", () => {
    const slot = Link({ href: "/store" }) as ReactElement<{ children: ReactElement }>
    expect(slot.type).toBe(HydrationSlot)

    const fragment = HydrationSlot(slot.props) as ReactElement<{ children: unknown }>
    expect(fragment.type).toBe(Fragment)
    // Flight drops a key-less Fragment, which would put the lazy back under the <div>.
    expect(fragment.key).not.toBeNull()
    expect(fragment.props.children).toBe(slot.props.children)
  })

  it("leaves an href that already names its locale on next/link, which does not suspend", () => {
    const link = Link({ href: "/ru/store" }) as ReactElement
    expect(link.type).not.toBe(HydrationSlot)
  })
})
