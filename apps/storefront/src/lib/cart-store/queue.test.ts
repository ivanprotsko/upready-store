import type { HttpTypes } from "@medusajs/types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { parseSyncLines } from "./protocol"
import {
  applyIntents,
  CartQueue,
  DEBOUNCE_MS,
  MAX_WAIT_MS,
  quantityIn,
  type CartSnapshot,
  type CartTransport,
  type SyncLine,
  type SyncReply,
} from "./queue"

type Cart = HttpTypes.StoreCart

const line = (variantId: string, quantity: number, unit = 100) =>
  ({
    id: `line_${variantId}`,
    variant_id: variantId,
    quantity,
    unit_price: unit,
    total: unit * quantity,
  }) as HttpTypes.StoreCartLineItem

const cartOf = (...items: HttpTypes.StoreCartLineItem[]): Cart => {
  const sum = items.reduce((acc, item) => acc + (item.total ?? 0), 0)
  return {
    id: "cart_1",
    currency_code: "rub",
    items,
    item_subtotal: sum,
    item_total: sum,
    subtotal: sum,
    total: sum,
  } as unknown as Cart
}

/**
 * A fake backend: it holds quantities by variant, answers `sync` the way the route does
 * (absolute quantities, a failure per line), and lets a test hold a reply back.
 */
class FakeServer implements CartTransport {
  quantities = new Map<string, number>()
  calls: SyncLine[][] = []
  inFlight = 0
  maxInFlight = 0
  failLines = new Set<string>()
  failRequest = false
  reads = 0
  clock = 1_000
  private held: Array<() => void> = []
  hold = false

  cart(): Cart {
    return cartOf(
      ...Array.from(this.quantities).filter(([, q]) => q > 0).map(([variantId, q]) => line(variantId, q))
    )
  }

  async sync(lines: SyncLine[]): Promise<SyncReply> {
    this.calls.push(lines)
    this.inFlight += 1
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)
    if (this.hold) {
      await new Promise<void>((resolve) => this.held.push(resolve))
    }
    this.inFlight -= 1
    if (this.failRequest) {
      throw new Error("network down")
    }
    const errors: SyncReply["errors"] = []
    for (const { variantId, quantity } of lines) {
      if (this.failLines.has(variantId)) {
        errors.push({ variantId, code: "stock" })
      } else {
        this.quantities.set(variantId, quantity)
      }
    }
    return { cart: this.cart(), at: ++this.clock, errors }
  }

  async read(): Promise<CartSnapshot> {
    this.reads += 1
    return { cart: this.cart(), at: ++this.clock }
  }

  release() {
    this.hold = false
    for (const resolve of this.held.splice(0)) resolve()
  }
}

/** Lets every pending promise callback run. */
const settleMicrotasks = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe("CartQueue", () => {
  let server: FakeServer
  let queue: CartQueue

  beforeEach(() => {
    vi.useFakeTimers()
    server = new FakeServer()
    queue = new CartQueue({ transport: server, now: () => Date.now() })
    queue.seed({ cart: server.cart(), at: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows a click at once and sends nothing until the debounce has passed", () => {
    queue.add("variant_a", 1, { unit_price: 250, product_title: "Прополис" })

    const view = queue.getState().view
    expect(quantityIn(view, "variant_a")).toBe(1)
    expect(view?.item_subtotal).toBe(250)
    expect(queue.getState().pending).toBe(true)

    vi.advanceTimersByTime(DEBOUNCE_MS - 1)
    expect(server.calls).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(server.calls).toHaveLength(1)
  })

  it("coalesces five quick «+» into one request that sets the absolute quantity", async () => {
    for (let i = 0; i < 5; i++) {
      queue.add("variant_a", 1, { unit_price: 100 })
      vi.advanceTimersByTime(150)
    }
    expect(quantityIn(queue.getState().view, "variant_a")).toBe(5)

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(server.calls).toEqual([[{ variantId: "variant_a", quantity: 5 }]])
    expect(server.quantities.get("variant_a")).toBe(5)
    expect(queue.getState().pending).toBe(false)
    expect(quantityIn(queue.getState().server, "variant_a")).toBe(5)
  })

  it("still sends within MAX_WAIT_MS while the buyer never stops clicking", async () => {
    let elapsed = 0
    while (server.calls.length === 0 && elapsed < 10_000) {
      queue.add("variant_a", 1, { unit_price: 100 })
      await vi.advanceTimersByTimeAsync(300)
      elapsed += 300
    }
    expect(server.calls).toHaveLength(1)
    expect(elapsed).toBeLessThanOrEqual(MAX_WAIT_MS + 300)
  })

  it("keeps one request in flight and sends a click made during it right after, in order", async () => {
    server.hold = true
    queue.add("variant_a", 1, { unit_price: 100 })
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(server.calls).toHaveLength(1)

    // Two more clicks while the first request is out, past the debounce too.
    queue.add("variant_a", 1)
    queue.add("variant_a", 1)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 3)
    expect(server.calls).toHaveLength(1)
    expect(server.maxInFlight).toBe(1)
    expect(quantityIn(queue.getState().view, "variant_a")).toBe(3)

    server.release()
    await settleMicrotasks()
    // The first reply (quantity 1) must not undo the two later clicks on screen.
    expect(quantityIn(queue.getState().view, "variant_a")).toBe(3)

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(server.calls.map((c) => c[0].quantity)).toEqual([1, 3])
    expect(server.maxInFlight).toBe(1)
    expect(server.quantities.get("variant_a")).toBe(3)
    expect(queue.getState().pending).toBe(false)
  })

  it("rolls a refused line back to the server's quantity and says why", async () => {
    server.quantities.set("variant_a", 2)
    queue.seed({ cart: server.cart(), at: 10 })
    server.failLines.add("variant_a")

    queue.add("variant_a", 1)
    expect(quantityIn(queue.getState().view, "variant_a")).toBe(3)

    const { ok } = await queue.settle()
    expect(ok).toBe(false)
    expect(quantityIn(queue.getState().view, "variant_a")).toBe(2)
    expect(queue.getState().errors).toEqual({ variant_a: "stock" })

    // The next change of that variant clears the message.
    queue.add("variant_a", -1)
    expect(queue.getState().errors).toEqual({})
  })

  it("rolls everything back and re-reads the server when the request itself fails", async () => {
    server.quantities.set("variant_b", 1)
    queue.seed({ cart: server.cart(), at: 10 })
    server.failRequest = true

    queue.add("variant_a", 1, { unit_price: 100 })
    queue.set("variant_b", 0)
    expect(queue.getState().view?.items).toHaveLength(1)

    const { ok } = await queue.settle()
    expect(ok).toBe(false)
    expect(server.reads).toBe(1)
    expect(quantityIn(queue.getState().view, "variant_a")).toBe(0)
    expect(quantityIn(queue.getState().view, "variant_b")).toBe(1)
    expect(queue.getState().errors).toEqual({ variant_a: "failed", variant_b: "failed" })
    expect(queue.getState().pending).toBe(false)
  })

  it("sends nothing when the buyer returns to the server's quantity before the debounce", async () => {
    queue.add("variant_a", 1, { unit_price: 100 })
    queue.add("variant_a", -1)
    expect(queue.getState().pending).toBe(false)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2)
    expect(server.calls).toHaveLength(0)
  })

  it("settle sends at once and resolves only when the server has everything", async () => {
    queue.add("variant_a", 2, { unit_price: 100 })
    const settled = queue.settle()
    await settleMicrotasks()
    expect(server.calls).toHaveLength(1)
    await expect(settled).resolves.toEqual({ ok: true })
    expect(server.quantities.get("variant_a")).toBe(2)
  })

  it("ignores a server render while something is pending, and an older one after", async () => {
    const stale = { cart: cartOf(line("variant_a", 7)), at: 5 }

    queue.add("variant_a", 1, { unit_price: 100 })
    queue.seed(stale)
    expect(quantityIn(queue.getState().view, "variant_a")).toBe(1)

    await queue.settle()
    // A page restored from the router's cache carries a read older than the reply.
    queue.seed(stale)
    expect(quantityIn(queue.getState().view, "variant_a")).toBe(1)

    // A newer read (an order placed in another tab emptied the cart) is taken.
    queue.seed({ cart: null, at: server.clock + 1 })
    expect(queue.getState().view).toBeNull()
  })

  it("re-sends intents restored from a previous page, which the server takes as a no-op", async () => {
    server.quantities.set("variant_a", 4)
    queue.seed({ cart: server.cart(), at: 10 })

    // The previous page's keepalive request already set 4; the stored intent says 4 too.
    queue.set("variant_a", 4)
    expect(queue.getState().pending).toBe(false)

    // A removal the previous page could not deliver is sent again.
    queue.set("variant_a", 0)
    await queue.settle()
    expect(server.quantities.get("variant_a")).toBe(0)
  })

  it("sends a removal made before the first server cart arrived", async () => {
    const unseeded = new CartQueue({ transport: server })
    unseeded.set("variant_a", 0)
    expect(unseeded.getState().pending).toBe(true)
    await unseeded.settle()
    expect(server.calls).toEqual([[{ variantId: "variant_a", quantity: 0 }]])
  })
})

describe("applyIntents", () => {
  it("draws a first add from its draft, with an estimated price", () => {
    const view = applyIntents(null, [
      {
        variantId: "variant_a",
        quantity: 3,
        seq: 1,
        draft: { unit_price: 120, product_title: "Мазь", currency_code: "rub" },
      },
    ])
    expect(view?.currency_code).toBe("rub")
    expect(view?.items?.[0]).toMatchObject({
      id: "optimistic:variant_a",
      variant_id: "variant_a",
      quantity: 3,
      total: 360,
      product_title: "Мазь",
    })
    expect(view?.item_subtotal).toBe(360)
  })

  it("scales a line's total with its quantity, keeping its own discount ratio", () => {
    const discounted = { ...line("variant_a", 2, 100), total: 160 }
    const view = applyIntents(cartOf(discounted), [{ variantId: "variant_a", quantity: 3, seq: 1 }])
    expect(view?.items?.[0].total).toBe(240)
    expect(view?.total).toBe(240)
    expect(view?.item_subtotal).toBe(260)
  })

  it("removes a line set to 0 and leaves the server cart untouched", () => {
    const server = cartOf(line("variant_a", 1), line("variant_b", 2))
    const view = applyIntents(server, [{ variantId: "variant_a", quantity: 0, seq: 1 }])
    expect(view?.items?.map((item) => item.variant_id)).toEqual(["variant_b"])
    expect(server.items).toHaveLength(2)
  })
})

describe("parseSyncLines", () => {
  it("takes absolute quantities by variant", () => {
    expect(parseSyncLines({ lines: [{ variantId: "variant_01ABC", quantity: 0 }] })).toEqual([
      { variantId: "variant_01ABC", quantity: 0 },
    ])
  })

  it.each([
    null,
    {},
    { lines: [] },
    { lines: [{ variantId: "variant_a", quantity: -1 }] },
    { lines: [{ variantId: "variant_a", quantity: 1.5 }] },
    { lines: [{ variantId: "../x", quantity: 1 }] },
    { lines: [{ variantId: "variant_a" }] },
    { lines: Array.from({ length: 51 }, () => ({ variantId: "variant_a", quantity: 1 })) },
  ])("refuses %j", (body) => {
    expect(parseSyncLines(body)).toBeNull()
  })
})
