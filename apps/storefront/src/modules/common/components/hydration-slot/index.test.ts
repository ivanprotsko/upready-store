import { Fragment, type ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"

// The data readers behind these components talk to the backend; the test only
// looks at what each component returns before any of them would run.
vi.mock("@lib/data/cart", () => ({ retrieveCart: vi.fn(), retrieveCartSnapshot: vi.fn() }))
vi.mock("@lib/data/attribution", () => ({ getSiteAttribution: vi.fn() }))
vi.mock("@lib/data/tenant-branding", () => ({ getSiteBranding: vi.fn() }))
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }))
vi.mock("@modules/layout/components/cart-trigger", () => ({ default: () => null }))

import HydrationSlot from "@modules/common/components/hydration-slot"
import CartButton from "@modules/layout/components/cart-button"
import FooterCredit from "@modules/layout/components/footer-credit"
import { FooterContacts, FooterRequisites } from "@modules/layout/components/footer-seller"
import SiteAttribution from "@modules/layout/components/site-attribution"

/**
 * An async Server Component reaches the RSC payload as a lazy row. Straight
 * under a `<div>` that lazy makes React 19.2 replay the `<div>` and claim its
 * first child instead of it: #418 on the product page (46df U-06). Every header
 * and footer variant puts these straight into a `<div>`, so each one hands back
 * a keyed Fragment rather than a promise.
 */
describe("async components that header and footer variants put straight into a <div>", () => {
  const cases: [string, () => unknown][] = [
    ["CartButton", () => CartButton()],
    ["SiteAttribution", () => SiteAttribution({})],
    ["FooterCredit", () => FooterCredit({})],
    ["FooterContacts", () => FooterContacts({ seller: null })],
    ["FooterRequisites", () => FooterRequisites({ seller: null })],
  ]

  it.each(cases)("%s answers with a keyed Fragment around its async body", (_name, render) => {
    const slot = render() as ReactElement<{ children: ReactElement }>
    expect(slot).not.toBeInstanceOf(Promise)
    expect(slot.type).toBe(HydrationSlot)

    const fragment = HydrationSlot(slot.props) as ReactElement<{ children: unknown }>
    expect(fragment.type).toBe(Fragment)
    // Flight drops a key-less Fragment, which would put the lazy back under the <div>.
    expect(fragment.key).not.toBeNull()
    expect(fragment.props.children).toBe(slot.props.children)
  })
})
