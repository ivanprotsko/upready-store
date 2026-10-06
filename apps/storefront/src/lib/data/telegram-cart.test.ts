import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * t-cherk-23: «Оформить» in the shop's bot opens the storefront with the cart
 * the buyer filled in the chat. This file holds the storefront's half: when
 * the cart cookie moves to the bot's cart, and every case where it must stay.
 * The backend's half, who may have which cart, is
 * `apps/backend/src/shop-bot/__tests__/cart-adoption.unit.spec.ts`.
 */

const clientFetch = vi.fn()
const createLineItem = vi.fn()
const setCartId = vi.fn()
const signIn = vi.fn()
const revalidateTag = vi.fn()
let cookieCartId: string | undefined
let authHeaders: Record<string, string> = {}
const calls: string[] = []

vi.mock("@lib/config", () => ({
  sdk: {
    client: { fetch: (...args: unknown[]) => clientFetch(...args) },
    store: { cart: { createLineItem: (...args: unknown[]) => createLineItem(...args) } },
  },
}))
vi.mock("next/cache", () => ({ revalidateTag: (...args: unknown[]) => revalidateTag(...args) }))
vi.mock("./cookies", () => ({
  getAuthHeaders: async () => authHeaders,
  getCacheTag: async (tag: string) => `${tag}-tag`,
  getCartId: async () => cookieCartId,
  setCartId: (...args: unknown[]) => setCartId(...args),
}))
vi.mock("./telegram-auth", () => ({
  signInWithTelegramMiniApp: (...args: unknown[]) => signIn(...args),
}))

const INIT_DATA = "auth_date=1790000000&user=%7B%22id%22%3A555%7D&hash=abc"
const BOT_CART_ROUTE = "/store/telegram-bot/cart"

type Line = { variant_id: string; quantity: number }
type Answer = { cart_id: string | null } | Error

const failure = (status: number, message: string) => Object.assign(new Error(message), { status })

/** The backend as the storefront sees it: the bot-cart route and the carts it can read. */
const backend = (opts: { botCart: Answer; carts?: Record<string, Line[] | Error> }) => {
  clientFetch.mockImplementation(async (path: string) => {
    calls.push(path)
    if (path === BOT_CART_ROUTE) {
      if (opts.botCart instanceof Error) throw opts.botCart
      return opts.botCart
    }
    const cartId = path.replace("/store/carts/", "")
    const cart = opts.carts?.[cartId]
    if (!cart) throw failure(404, `Cart with id: ${cartId} was not found`)
    if (cart instanceof Error) throw cart
    return { cart: { id: cartId, completed_at: null, items: cart } }
  })
}

const enter = async (initData: string, withSignIn = false) => {
  const { enterMiniApp } = await import("./telegram-cart")
  return enterMiniApp(initData, withSignIn)
}

describe("enterMiniApp", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    clientFetch.mockReset()
    createLineItem.mockReset()
    createLineItem.mockImplementation(async (cartId: string, line: Line) => {
      calls.push(`add ${line.variant_id} to ${cartId}`)
    })
    setCartId.mockReset()
    setCartId.mockImplementation(async (cartId: string) => {
      calls.push(`cookie ${cartId}`)
    })
    signIn.mockReset()
    signIn.mockImplementation(async () => {
      calls.push("sign-in")
      return true
    })
    revalidateTag.mockReset()
    cookieCartId = undefined
    authHeaders = { authorization: "Bearer buyer-session" }
    calls.length = 0
  })

  it("opens the bot's cart for the signed-in Telegram buyer", async () => {
    backend({ botCart: { cart_id: "cart_bot" } })

    await expect(enter(INIT_DATA)).resolves.toEqual({ signedIn: false, cartAdopted: true })

    expect(setCartId).toHaveBeenCalledWith("cart_bot")
    expect(revalidateTag).toHaveBeenCalledWith("carts-tag")
    expect(clientFetch).toHaveBeenCalledWith(
      BOT_CART_ROUTE,
      expect.objectContaining({
        method: "POST",
        headers: { authorization: "Bearer buyer-session" },
        // The proof and nothing else: no cart id is ever sent.
        body: { initData: INIT_DATA },
      })
    )
  })

  it("opens the cart before the sign-in, which would hand the site cart to the customer first", async () => {
    backend({ botCart: { cart_id: "cart_bot" } })
    authHeaders = {}

    await expect(enter(INIT_DATA, true)).resolves.toEqual({ signedIn: true, cartAdopted: true })

    expect(calls).toEqual([BOT_CART_ROUTE, "cookie cart_bot", "sign-in"])
    expect(signIn).toHaveBeenCalledWith(INIT_DATA)
  })

  it("does not sign in when the bridge did not ask for it", async () => {
    backend({ botCart: { cart_id: "cart_bot" } })

    await enter(INIT_DATA, false)

    expect(signIn).not.toHaveBeenCalled()
  })

  describe("outside Telegram", () => {
    it("asks nothing and leaves the cookie cart untouched when there is no initData", async () => {
      backend({ botCart: { cart_id: "cart_bot" } })
      cookieCartId = "cart_site"

      await expect(enter("", true)).resolves.toEqual({ signedIn: false, cartAdopted: false })
      await expect(enter(undefined as unknown as string, true)).resolves.toEqual({
        signedIn: false,
        cartAdopted: false,
      })

      expect(clientFetch).not.toHaveBeenCalled()
      expect(signIn).not.toHaveBeenCalled()
      expect(setCartId).not.toHaveBeenCalled()
    })

    it("leaves the cookie cart untouched when the backend refuses a made-up proof", async () => {
      backend({ botCart: failure(401, "Telegram sign-in could not be verified.") })
      cookieCartId = "cart_site"

      await expect(enter("hash=made-up")).resolves.toEqual({ signedIn: false, cartAdopted: false })

      expect(setCartId).not.toHaveBeenCalled()
      expect(calls).toEqual([BOT_CART_ROUTE])
    })
  })

  it("leaves the cookie cart untouched when the proof has expired", async () => {
    backend({ botCart: failure(401, "This Telegram sign-in has expired. Try again.") })
    cookieCartId = "cart_site"

    await expect(enter(INIT_DATA)).resolves.toMatchObject({ cartAdopted: false })
    expect(setCartId).not.toHaveBeenCalled()
  })

  it("leaves the cookie cart untouched when the session belongs to another buyer", async () => {
    backend({ botCart: failure(403, "This Telegram account belongs to another customer.") })
    cookieCartId = "cart_site"

    await expect(enter(INIT_DATA)).resolves.toMatchObject({ cartAdopted: false })
    expect(setCartId).not.toHaveBeenCalled()
  })

  it("changes nothing when the buyer has no cart in the bot", async () => {
    backend({ botCart: { cart_id: null } })
    cookieCartId = "cart_site"

    await expect(enter(INIT_DATA)).resolves.toMatchObject({ cartAdopted: false })
    expect(setCartId).not.toHaveBeenCalled()
    expect(calls).toEqual([BOT_CART_ROUTE])
  })

  it("changes nothing when the cookie already holds the bot's cart", async () => {
    backend({ botCart: { cart_id: "cart_bot" } })
    cookieCartId = "cart_bot"

    await expect(enter(INIT_DATA)).resolves.toMatchObject({ cartAdopted: false })
    expect(setCartId).not.toHaveBeenCalled()
    expect(createLineItem).not.toHaveBeenCalled()
  })

  describe("a site cart that is not empty", () => {
    it("has its lines carried into the bot's cart before the cookie moves", async () => {
      backend({
        botCart: { cart_id: "cart_bot" },
        carts: {
          cart_site: [
            { variant_id: "variant_site_only", quantity: 2 },
            { variant_id: "variant_in_both", quantity: 1 },
          ],
          cart_bot: [{ variant_id: "variant_in_both", quantity: 5 }],
        },
      })
      cookieCartId = "cart_site"

      await expect(enter(INIT_DATA)).resolves.toMatchObject({ cartAdopted: true })

      expect(createLineItem).toHaveBeenCalledTimes(1)
      expect(createLineItem).toHaveBeenCalledWith(
        "cart_bot",
        { variant_id: "variant_site_only", quantity: 2 },
        {},
        { authorization: "Bearer buyer-session" }
      )
      expect(calls).toEqual([
        BOT_CART_ROUTE,
        "/store/carts/cart_site",
        "/store/carts/cart_bot",
        "add variant_site_only to cart_bot",
        "cookie cart_bot",
      ])
    })

    it("stays the visitor's cart when it could not be read, so no line is lost", async () => {
      backend({
        botCart: { cart_id: "cart_bot" },
        carts: { cart_site: failure(502, "Bad Gateway"), cart_bot: [] },
      })
      cookieCartId = "cart_site"

      await expect(enter(INIT_DATA)).resolves.toMatchObject({ cartAdopted: false })
      expect(setCartId).not.toHaveBeenCalled()
    })

    it("stays the visitor's cart when a line could not be carried for a passing reason", async () => {
      backend({
        botCart: { cart_id: "cart_bot" },
        carts: { cart_site: [{ variant_id: "variant_a", quantity: 1 }], cart_bot: [] },
      })
      createLineItem.mockRejectedValue(failure(502, "Bad Gateway"))
      cookieCartId = "cart_site"

      await expect(enter(INIT_DATA)).resolves.toMatchObject({ cartAdopted: false })
      expect(setCartId).not.toHaveBeenCalled()
    })

    it("leaves behind only a line the backend refuses by name, and carries the rest", async () => {
      backend({
        botCart: { cart_id: "cart_bot" },
        carts: {
          cart_site: [
            { variant_id: "variant_gone", quantity: 1 },
            { variant_id: "variant_ok", quantity: 3 },
          ],
          cart_bot: [],
        },
      })
      createLineItem.mockImplementation(async (cartId: string, line: Line) => {
        if (line.variant_id === "variant_gone") {
          throw failure(400, "Variant variant_gone is out of stock")
        }
        calls.push(`add ${line.variant_id} to ${cartId}`)
      })
      cookieCartId = "cart_site"

      await expect(enter(INIT_DATA)).resolves.toMatchObject({ cartAdopted: true })
      expect(calls).toContain("add variant_ok to cart_bot")
      expect(setCartId).toHaveBeenCalledWith("cart_bot")
    })
  })

  it("moves on from a site cart the backend no longer has, with nothing to carry", async () => {
    backend({ botCart: { cart_id: "cart_bot" }, carts: {} })
    cookieCartId = "cart_gone"

    await expect(enter(INIT_DATA)).resolves.toMatchObject({ cartAdopted: true })
    expect(createLineItem).not.toHaveBeenCalled()
    expect(setCartId).toHaveBeenCalledWith("cart_bot")
  })

  it("moves on from an empty site cart without reading the bot's cart", async () => {
    backend({ botCart: { cart_id: "cart_bot" }, carts: { cart_site: [] } })
    cookieCartId = "cart_site"

    await expect(enter(INIT_DATA)).resolves.toMatchObject({ cartAdopted: true })
    expect(calls).toEqual([BOT_CART_ROUTE, "/store/carts/cart_site", "cookie cart_bot"])
  })
})
