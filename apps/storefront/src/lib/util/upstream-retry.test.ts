import { afterEach, describe, expect, it, vi } from "vitest"

import { isGatewayFailure, retryOnGatewayFailure } from "./upstream-retry"

/** The js-sdk's `FetchError` shape, a message plus the HTTP status. */
const fetchError = (status: number, message: string) =>
  Object.assign(new Error(message), { status, statusText: message })

describe("isGatewayFailure (t-2026-10-04-44)", () => {
  it("counts the proxy's own 502 and 503 for any call", () => {
    for (const idempotent of [true, false]) {
      expect(isGatewayFailure(fetchError(502, "Bad Gateway"), { idempotent })).toBe(true)
      expect(isGatewayFailure(fetchError(503, "Service Unavailable"), { idempotent })).toBe(true)
    }
  })

  it("counts a 504 and a fetch with no answer only for a call that is safe to repeat", () => {
    const noAnswer = new TypeError("fetch failed")
    expect(isGatewayFailure(fetchError(504, "Gateway Timeout"), { idempotent: true })).toBe(true)
    expect(isGatewayFailure(noAnswer, { idempotent: true })).toBe(true)
    expect(isGatewayFailure(fetchError(504, "Gateway Timeout"), { idempotent: false })).toBe(false)
    expect(isGatewayFailure(noAnswer, { idempotent: false })).toBe(false)
  })

  it("never counts an answer Medusa gave itself", () => {
    for (const status of [400, 401, 404, 409, 500]) {
      expect(isGatewayFailure(fetchError(status, "x"), { idempotent: true })).toBe(false)
    }
    expect(isGatewayFailure(new Error("Bad Gateway"), { idempotent: true })).toBe(false)
  })
})

describe("retryOnGatewayFailure (t-2026-10-04-44)", () => {
  afterEach(() => vi.restoreAllMocks())

  it("answers with the retry after one 502 and logs the first failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const call = vi
      .fn()
      .mockRejectedValueOnce(fetchError(502, "Bad Gateway"))
      .mockResolvedValueOnce("ok")

    await expect(
      retryOnGatewayFailure("probe", call, { idempotent: false, delayMs: 0 })
    ).resolves.toBe("ok")

    expect(call).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[0]?.[0]).toMatch(/^\[upstream-retry\] probe failed with 502 Bad Gateway/)
  })

  it("retries once only and hands the second failure to the caller", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const call = vi.fn().mockRejectedValue(fetchError(502, "Bad Gateway"))

    await expect(
      retryOnGatewayFailure("probe", call, { idempotent: true, delayMs: 0 })
    ).rejects.toMatchObject({ status: 502 })
    expect(call).toHaveBeenCalledTimes(2)
  })

  it("does not repeat a refusal Medusa gave", async () => {
    const call = vi.fn().mockRejectedValue(fetchError(400, "Invalid data"))

    await expect(
      retryOnGatewayFailure("probe", call, { idempotent: true, delayMs: 0 })
    ).rejects.toMatchObject({ status: 400 })
    expect(call).toHaveBeenCalledTimes(1)
  })
})
