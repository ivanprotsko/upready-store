import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getLoginModalState,
  setLoginModalAvailable,
} from "@modules/account/components/login-modal/store"

import { openLoginModalOnClick } from "."

const SRC = join(__dirname, "../../../..")
const read = (path: string) => readFileSync(join(SRC, path), "utf8")

/** A plain left click, as the browser hands it to the link's onClick. */
const click = (overrides: Partial<Parameters<typeof openLoginModalOnClick>[0]> = {}) => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  preventDefault: vi.fn(),
  ...overrides,
})

afterEach(() => setLoginModalAvailable(false))

/**
 * Ivan, 04.10 (ask-20261004-090805-23d9): «вход нужно сделать в popup без перехода на другую
 * страницу». The header's account icon is an `AccountLink`; for a guest `LoginModalHost` mounts
 * the modal, and the link's click opens it and cancels the navigation.
 */
describe("a guest's click on the header account icon", () => {
  it("opens the sign-in modal and does not navigate", () => {
    setLoginModalAvailable(true) // what LoginModal does on mount, for a guest only
    const event = click()

    expect(openLoginModalOnClick(event)).toBe(true)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(getLoginModalState()).toMatchObject({ open: true, email: false })
  })

  it("is the AccountLink the olavka header (h7) draws for the account icon", () => {
    const h7 = read("modules/layout/templates/nav/variants/h7.tsx")
    expect(h7).toMatch(/<AccountLink\s+aria-label=\{t\("Nav\.account"\)\}[\s\S]*?data-testid="nav-account-link"/)
    expect(h7).not.toContain('href="/account"')
  })

  it("reaches openLoginModalOnClick from the link's own onClick", () => {
    const link = read("modules/layout/components/account-link/index.tsx")
    expect(link).toContain("openLoginModalOnClick(event, { email: emailForm })")
  })
})

describe("when the link keeps its meaning", () => {
  it("follows /account for a signed-in buyer: no modal is mounted", () => {
    const event = click()
    expect(openLoginModalOnClick(event)).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(getLoginModalState().open).toBe(false)
  })

  it.each([
    ["a new tab (Cmd)", { metaKey: true }],
    ["a new tab (Ctrl)", { ctrlKey: true }],
    ["a new window (Shift)", { shiftKey: true }],
    ["the middle button", { button: 1 }],
  ])("lets %s through", (_name, overrides) => {
    setLoginModalAvailable(true)
    const event = click(overrides)
    expect(openLoginModalOnClick(event)).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(getLoginModalState().open).toBe(false)
  })
})

describe("the checkout's «По эл. почте»", () => {
  it("opens the modal with the e-mail form unfolded", () => {
    setLoginModalAvailable(true)
    const event = click()
    expect(openLoginModalOnClick(event, { email: true })).toBe(true)
    expect(getLoginModalState()).toMatchObject({ open: true, email: true })
    expect(read("modules/checkout/components/checkout-sign-in/index.tsx")).toContain(
      '<AccountLink className="flex w-full" emailForm>'
    )
  })
})

describe("the modal is on every page a guest can sign in from", () => {
  it.each(["app/[locale]/(main)/layout.tsx", "app/[locale]/(checkout)/layout.tsx"])(
    "%s places LoginModalHost",
    (layout) => {
      expect(read(layout)).toMatch(/<Suspense fallback=\{null\}>\s*<LoginModalHost \/>\s*<\/Suspense>/)
    }
  )

  it("closes once the buyer is signed in: the host renders nothing for a customer", () => {
    expect(read("modules/account/components/login-modal/host.tsx")).toContain("if (customer) return null")
    setLoginModalAvailable(true)
    openLoginModalOnClick(click())
    setLoginModalAvailable(false) // LoginModal unmounting after the sign-in redirect
    expect(getLoginModalState()).toEqual({ available: false, open: false, email: false })
  })
})
