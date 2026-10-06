import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createEntrySignal, runMiniAppEntry, type MiniAppEntryDeps } from "./mini-app-entry"

const INIT_DATA = "auth_date=1790000000&user=%7B%22id%22%3A555%7D&hash=abc"

const deps = (over: Partial<MiniAppEntryDeps> = {}) => {
  let signInDone = false
  const built = {
    initData: INIT_DATA,
    signInDone: vi.fn(() => signInDone),
    markSignInDone: vi.fn(() => {
      signInDone = true
    }),
    enter: vi.fn(async () => ({ signedIn: false, cartAdopted: false })),
    refresh: vi.fn(),
    ...over,
  }
  return built
}

describe("runMiniAppEntry", () => {
  it("asks the server for nothing when Telegram gave no initData", async () => {
    const d = deps({ initData: "" })

    await runMiniAppEntry(d)
    await runMiniAppEntry({ ...d, initData: undefined })

    expect(d.enter).not.toHaveBeenCalled()
    expect(d.markSignInDone).not.toHaveBeenCalled()
    expect(d.refresh).not.toHaveBeenCalled()
  })

  it("opens the bot's cart on every launch and signs in on the first one only", async () => {
    const d = deps()

    await runMiniAppEntry(d)
    await runMiniAppEntry(d)

    expect(d.enter).toHaveBeenNthCalledWith(1, INIT_DATA, true)
    expect(d.enter).toHaveBeenNthCalledWith(2, INIT_DATA, false)
    expect(d.markSignInDone).toHaveBeenCalledTimes(1)
  })

  it("refreshes the page when the cart changed, when the buyer was signed in, and not otherwise", async () => {
    const adopted = deps({ enter: vi.fn(async () => ({ signedIn: false, cartAdopted: true })) })
    const signedIn = deps({ enter: vi.fn(async () => ({ signedIn: true, cartAdopted: false })) })
    const unchanged = deps()

    await runMiniAppEntry(adopted)
    await runMiniAppEntry(signedIn)
    await runMiniAppEntry(unchanged)

    expect(adopted.refresh).toHaveBeenCalledTimes(1)
    expect(signedIn.refresh).toHaveBeenCalledTimes(1)
    expect(unchanged.refresh).not.toHaveBeenCalled()
  })

  it("ends quietly when the server action fails, so the checkout entry is not left waiting", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const d = deps({
      enter: vi.fn(async () => {
        throw new Error("fetch failed")
      }),
    })

    await expect(runMiniAppEntry(d)).resolves.toBeUndefined()

    expect(d.refresh).not.toHaveBeenCalled()
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })
})

describe("createEntrySignal", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("lets the checkout through as soon as the bridge marks the entry over", async () => {
    const signal = createEntrySignal()
    const open = vi.fn()
    signal.wait(8000).then(open)

    await vi.advanceTimersByTimeAsync(300)
    expect(open).not.toHaveBeenCalled()

    signal.mark()
    await vi.advanceTimersByTimeAsync(0)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it("lets the checkout through at the bound when the bridge never finishes", async () => {
    const signal = createEntrySignal()
    const open = vi.fn()
    signal.wait(8000).then(open)

    await vi.advanceTimersByTimeAsync(7999)
    expect(open).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it("does not wait at all once the entry is already over", async () => {
    const signal = createEntrySignal()
    signal.mark()
    const open = vi.fn()
    signal.wait(8000).then(open)

    await vi.advanceTimersByTimeAsync(0)
    expect(open).toHaveBeenCalledTimes(1)
  })
})
