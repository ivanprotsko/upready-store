import { afterEach, describe, expect, it, vi } from "vitest"

import { isTelegramLaunch } from "./web-app"

/**
 * `isTelegramLaunch()` is the gate in front of everything the storefront does
 * for a Mini App: the bridge loads no script, signs nobody in and opens no
 * bot cart unless it answers true (t-cherk-23: outside Telegram a visitor's own
 * cart stays as it is).
 */

const page = (hash: string, stored: string | null = null) => ({
  location: { hash },
  sessionStorage: { getItem: () => stored },
})

describe("isTelegramLaunch", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("is false on the server, where there is no window", () => {
    expect(isTelegramLaunch()).toBe(false)
  })

  it("is false for a page a browser opened, whatever its own fragment says", () => {
    vi.stubGlobal("window", page(""))
    expect(isTelegramLaunch()).toBe(false)

    vi.stubGlobal("window", page("#reviews"))
    expect(isTelegramLaunch()).toBe(false)
  })

  it("is true when Telegram's launch data is in the fragment", () => {
    vi.stubGlobal("window", page("#tgWebAppData=auth_date%3D1&tgWebAppVersion=8.0"))
    expect(isTelegramLaunch()).toBe(true)
  })

  it("is true on a later page of the same webview, from the launch data Telegram's script stored", () => {
    vi.stubGlobal("window", page("", '{"tgWebAppPlatform":"ios"}'))
    expect(isTelegramLaunch()).toBe(true)
  })

  it("is false when the browser forbids sessionStorage", () => {
    vi.stubGlobal("window", {
      location: { hash: "" },
      get sessionStorage(): Storage {
        throw new Error("SecurityError")
      },
    })
    expect(isTelegramLaunch()).toBe(false)
  })
})
