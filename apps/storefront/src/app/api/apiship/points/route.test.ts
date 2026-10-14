import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * t-2026-10-14-58, part B: the storefront proxy of `GET /store/apiship/points`, modelled
 * on `app/api/cdek/points`. The data loader is replaced, so the test holds the route's
 * own work: which queries reach the Store API, and the empty answer otherwise.
 */

const { listApishipPoints } = vi.hoisted(() => ({ listApishipPoints: vi.fn() }))
vi.mock("@lib/data/apiship", () => ({ listApishipPoints }))

const call = async (query: string) => {
  const { GET } = await import("./route")
  const res = await GET(new Request(`http://shop.test/api/apiship/points${query}`))
  return res.json()
}

describe("GET /api/apiship/points", () => {
  beforeEach(() => listApishipPoints.mockReset())
  afterEach(() => vi.restoreAllMocks())

  it("passes the carrier and the city on and answers what the store answered", async () => {
    const answer = { configured: true, provider_key: "cdek", city: "Москва", total: 1, points: [{ id: 1 }] }
    listApishipPoints.mockResolvedValue(answer)
    await expect(call("?provider_key=cdek&city=%20Москва%20")).resolves.toEqual(answer)
    expect(listApishipPoints).toHaveBeenCalledWith({ providerKey: "cdek", city: "Москва" })
  })

  it("asks nothing without a carrier or a city", async () => {
    for (const query of ["?city=Москва", "?provider_key=cdek", ""]) {
      const answer = await call(query)
      expect(answer).toMatchObject({ configured: false, points: [] })
    }
    expect(listApishipPoints).not.toHaveBeenCalled()
  })
})
