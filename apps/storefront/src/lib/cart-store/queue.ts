import type { HttpTypes } from "@medusajs/types"

import { MAX_SYNC_LINES } from "./protocol"

/**
 * The storefront's one client-side cart (t-2026-10-03-66, Ivan 03.10: «действие
 * выполняется моментально, а выполнение происходит в фоне … в фоне выстраиваться в
 * очередь с debounce»). Framework-free on purpose: `./index.tsx` puts it in React, and
 * `queue.test.ts` drives it with fake timers.
 *
 * The model, in four rules:
 *
 * 1. A click is an INTENT: «this variant, this many», an absolute quantity, never a
 *    delta. Five «+» in a row leave one intent (N + 5), so they coalesce into one
 *    request, and sending the same intent twice changes nothing on the server (a page
 *    unload re-sends it from `sessionStorage`, see `./index.tsx`).
 * 2. What the buyer sees is the server's last cart with the intents laid over it
 *    (`applyIntents`): the quantity, the counter and the line appear at once.
 * 3. Intents go out after `DEBOUNCE_MS` of quiet, or `MAX_WAIT_MS` after the first one
 *    of a burst, and only ONE request is in flight for the whole cart. The backend locks
 *    a cart per request anyway, and one at a time keeps the replies in order, so an old
 *    reply can never overwrite a newer one.
 * 4. A reply replaces the server cart. It retires an intent only if that intent did
 *    not change while the request was out (`seq`), so a click made during the request
 *    is sent next instead of being lost. A failed line, or a failed request, drops its
 *    intent: the view falls back to the server's cart, and the line carries an error
 *    code the UI turns into a message.
 */

type Cart = HttpTypes.StoreCart
type Line = HttpTypes.StoreCartLineItem

/**
 * 400 ms between the last click and the request. Rapid taps on a stepper come
 * 150–300 ms apart, so a burst of «+» lands in one request; any longer and a buyer who
 * clicks «+» and then «К оформлению» waits for nothing. clipmonster used 300 ms for a
 * title and 500 ms for a form field; this sits between them.
 */
export const DEBOUNCE_MS = 400

/**
 * A buyer who never stops clicking still gets a request every 2 s, so the most an
 * unexpected crash can lose is two seconds of clicks.
 */
export const MAX_WAIT_MS = 2000

/** A cart read on the server, with the server's clock at the moment the read began. */
export type CartSnapshot = { cart: Cart | null; at: number }

/** What the page knows about a line before the server has one: a first add. */
export type DraftLine = Partial<Line> & { currency_code?: string }

export type LineIntent = {
  variantId: string
  quantity: number
  /** Bumped on every change, so a reply can tell whether it confirms this value. */
  seq: number
  draft?: DraftLine
}

/** An intent as it is persisted across a page unload. */
export type StoredIntent = Pick<LineIntent, "variantId" | "quantity" | "draft">

export type SyncLine = { variantId: string; quantity: number }

/** `stock`: the shop has fewer than asked. `failed`: anything else. */
export type CartErrorCode = "stock" | "failed"

export type SyncReply = CartSnapshot & {
  errors: { variantId: string; code: CartErrorCode }[]
}

export type CartTransport = {
  /** Sets every line to its quantity and answers with the cart afterwards. */
  sync(lines: SyncLine[], options: { keepalive: boolean }): Promise<SyncReply>
  /** Reads the cart as the server has it. */
  read(): Promise<CartSnapshot>
}

export type CartQueueState = {
  /** False until the first server cart arrives: render your own server props meanwhile. */
  seeded: boolean
  /** The cart as the server last confirmed it. Prices and totals are this cart's. */
  server: Cart | null
  /** The server cart with the pending intents laid over it: what the buyer sees. */
  view: Cart | null
  /** Something is not confirmed yet: an intent waits or a request is out. */
  pending: boolean
  /** The last failure per variant, until the buyer changes that variant again. */
  errors: Readonly<Record<string, CartErrorCode>>
}

export const OPTIMISTIC_LINE_PREFIX = "optimistic:"

const round = (amount: number) => Math.round(amount * 100) / 100

/** The variant's quantity in a cart: its first line, the way `linesByVariant` reads it. */
export const quantityIn = (cart: Cart | null, variantId: string): number =>
  cart?.items?.find((item) => item.variant_id === variantId)?.quantity ?? 0

/**
 * The cart as the buyer should see it: every intent applied to the server's cart.
 * Line totals scale with the quantity, which keeps a line's own discount and tax
 * ratio; a new line costs its unit price times the quantity. The cart's totals move by
 * the same amounts. All of it is an estimate until the reply brings the server's
 * numbers.
 */
export function applyIntents(
  server: Cart | null,
  list: readonly LineIntent[]
): Cart | null {
  if (list.length === 0) {
    return server
  }

  const items: Line[] = [...(server?.items ?? [])]
  let subtotalDelta = 0
  let totalDelta = 0
  let currency = server?.currency_code

  for (const intent of list) {
    const index = items.findIndex((item) => item.variant_id === intent.variantId)

    if (index >= 0) {
      const line = items[index]
      const unit = line.unit_price ?? 0
      const before = line.total ?? unit * line.quantity
      const after =
        line.total != null && line.quantity > 0
          ? round((line.total * intent.quantity) / line.quantity)
          : round(unit * intent.quantity)
      subtotalDelta += unit * (intent.quantity - line.quantity)
      totalDelta += after - before
      if (intent.quantity <= 0) {
        items.splice(index, 1)
      } else {
        items[index] = { ...line, quantity: intent.quantity, total: after }
      }
    } else if (intent.quantity > 0 && intent.draft) {
      const unit = intent.draft.unit_price ?? 0
      const total = round(unit * intent.quantity)
      currency ??= intent.draft.currency_code
      items.push({
        ...intent.draft,
        id: `${OPTIMISTIC_LINE_PREFIX}${intent.variantId}`,
        variant_id: intent.variantId,
        quantity: intent.quantity,
        unit_price: unit,
        total,
        subtotal: total,
      } as Line)
      subtotalDelta += unit * intent.quantity
      totalDelta += total
    }
  }

  const base =
    server ??
    ({
      id: "",
      currency_code: currency ?? "",
      items: [],
      item_subtotal: 0,
      item_total: 0,
      subtotal: 0,
      total: 0,
    } as unknown as Cart)

  return {
    ...base,
    items,
    item_subtotal: round((base.item_subtotal ?? 0) + subtotalDelta),
    subtotal: round((base.subtotal ?? 0) + subtotalDelta),
    item_total: round((base.item_total ?? 0) + totalDelta),
    total: round((base.total ?? 0) + totalDelta),
  }
}

export type CartQueueOptions = {
  transport: CartTransport
  debounceMs?: number
  maxWaitMs?: number
  now?: () => number
}

export class CartQueue {
  private readonly transport: CartTransport
  private readonly debounceMs: number
  private readonly maxWaitMs: number
  private readonly now: () => number

  private server: Cart | null = null
  private serverAt = -Infinity
  private seeded = false
  private readonly intents = new Map<string, LineIntent>()
  /** Variant → the `seq` the request in flight carries for it; null when none is out. */
  private sending: Map<string, number> | null = null
  private errors: Record<string, CartErrorCode> = {}
  /** Every failure ever recorded, so `settle` can tell whether one happened meanwhile. */
  private failures = 0
  private seq = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private firstPendingAt: number | null = null
  /** A send was asked for while one was out: run again as soon as it answers. */
  private again = false
  private keepalive = false
  private readonly idleWaiters: Array<() => void> = []
  private readonly listeners = new Set<() => void>()
  private state: CartQueueState

  constructor({
    transport,
    debounceMs = DEBOUNCE_MS,
    maxWaitMs = MAX_WAIT_MS,
    now = Date.now,
  }: CartQueueOptions) {
    this.transport = transport
    this.debounceMs = debounceMs
    this.maxWaitMs = maxWaitMs
    this.now = now
    this.state = this.compute()
  }

  // ------------------------------------------------------------------ reading

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState = (): CartQueueState => this.state

  /** The quantity the buyer sees for a variant, pending intents included. */
  quantityOf(variantId: string): number {
    return this.intents.get(variantId)?.quantity ?? quantityIn(this.server, variantId)
  }

  /** Whether something is still unconfirmed. */
  get busy(): boolean {
    return this.intents.size > 0 || this.sending !== null
  }

  /** The intents not yet confirmed, in the order they were first made. */
  pendingIntents(): StoredIntent[] {
    return Array.from(this.intents.values()).map(({ variantId, quantity, draft }) => ({
      variantId,
      quantity,
      draft,
    }))
  }

  // ------------------------------------------------------------------ writing

  /**
   * A cart read the server rendered into the page. Taken only while nothing is
   * pending, and only when it was read after the newest cart this queue already has:
   * a page restored from the router's cache carries an old read and must not undo a
   * click the server has since confirmed.
   */
  seed(snapshot: CartSnapshot): void {
    if (this.seeded && (this.busy || snapshot.at <= this.serverAt)) {
      return
    }
    this.server = snapshot.cart
    this.serverAt = snapshot.at
    this.seeded = true
    this.emit()
  }

  /** Sets a variant's quantity: 0 removes its line. */
  set(variantId: string, quantity: number, draft?: DraftLine): void {
    const target = Math.max(0, Math.floor(quantity))
    const previous = this.intents.get(variantId)
    delete this.errors[variantId]

    // Back to what the server already holds, and nothing for it in flight: no request.
    // Before the first server cart arrives nothing is known to match, so it is sent.
    if (
      this.seeded &&
      !this.sending?.has(variantId) &&
      target === quantityIn(this.server, variantId)
    ) {
      this.intents.delete(variantId)
    } else {
      this.intents.set(variantId, {
        variantId,
        quantity: target,
        seq: ++this.seq,
        draft: draft ?? previous?.draft,
      })
    }

    this.emit()

    if (!this.busy) {
      this.clearTimer()
      this.firstPendingAt = null
      this.resolveIdle()
      return
    }
    this.schedule()
  }

  /** «+» / «−» / «В корзину»: the quantity the buyer sees, moved by `delta`. */
  add(variantId: string, delta: number, draft?: DraftLine): void {
    this.set(variantId, this.quantityOf(variantId) + delta, draft)
  }

  /** Drops a variant's error message (the buyer dismissed it). */
  clearError(variantId: string): void {
    if (variantId in this.errors) {
      delete this.errors[variantId]
      this.emit()
    }
  }

  /**
   * Sends what is pending now instead of after the debounce. `keepalive` lets the
   * request outlive the page (an unload); the browser caps such a body at 64 KB, which
   * a cart's intents never approach.
   */
  flush({ keepalive = false }: { keepalive?: boolean } = {}): void {
    if (!this.busy) {
      return
    }
    this.keepalive ||= keepalive
    void this.run()
  }

  /**
   * Sends everything now and waits until the queue is empty: what «К оформлению» and
   * «Оформить заказ» do before they leave for the checkout. `ok` is false when a line failed
   * meanwhile; the view has fallen back to the server's cart by then and the line
   * shows why.
   */
  async settle(): Promise<{ ok: boolean }> {
    const failuresBefore = this.failures
    if (this.busy) {
      const idle = new Promise<void>((resolve) => this.idleWaiters.push(resolve))
      void this.run()
      await idle
    }
    return { ok: this.failures === failuresBefore }
  }

  // ------------------------------------------------------------------ internals

  private schedule(): void {
    const now = this.now()
    this.firstPendingAt ??= now
    const wait = Math.max(
      0,
      Math.min(this.debounceMs, this.firstPendingAt + this.maxWaitMs - now)
    )
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.run()
    }, wait)
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private async run(): Promise<void> {
    this.clearTimer()
    if (this.sending) {
      this.again = true
      return
    }
    if (this.intents.size === 0) {
      this.resolveIdle()
      return
    }

    // The route takes `MAX_SYNC_LINES` at a time; the rest goes right after.
    const batch = Array.from(this.intents.values()).slice(0, MAX_SYNC_LINES)
    const leftover = this.intents.size > batch.length
    this.sending = new Map(batch.map((intent) => [intent.variantId, intent.seq]))
    this.firstPendingAt = null
    const keepalive = this.keepalive
    this.keepalive = false
    this.emit()

    let reply: SyncReply | null = null
    try {
      reply = await this.transport.sync(
        batch.map(({ variantId, quantity }) => ({ variantId, quantity })),
        { keepalive }
      )
    } catch {
      reply = null
    }

    const sent = this.sending
    this.sending = null

    if (reply) {
      this.accept(reply)
      sent.forEach((seq, variantId) => {
        if (this.intents.get(variantId)?.seq === seq) {
          this.intents.delete(variantId)
        }
      })
      // A failed line whose intent was not changed meanwhile has just been retired,
      // so the view shows the server's quantity: say why.
      for (const { variantId, code } of reply.errors) {
        if (!this.intents.has(variantId)) {
          this.fail(variantId, code)
        }
      }
    } else {
      sent.forEach((seq, variantId) => {
        if (this.intents.get(variantId)?.seq === seq) {
          this.intents.delete(variantId)
          this.fail(variantId, "failed")
        }
      })
      // No reply: whether the server applied any of it is unknown, so read it back
      // rather than trust the cart from before the request.
      try {
        this.accept(await this.transport.read())
      } catch {
        // Keep the last cart the server confirmed.
      }
    }

    // An intent the server already matches (the stock capped it, another reply set it)
    // needs no request of its own.
    for (const intent of Array.from(this.intents.values())) {
      if (intent.quantity === quantityIn(this.server, intent.variantId)) {
        this.intents.delete(intent.variantId)
      }
    }

    this.emit()

    if (this.intents.size === 0) {
      this.again = false
      this.resolveIdle()
      return
    }
    if (this.again || leftover || this.idleWaiters.length > 0) {
      this.again = false
      void this.run()
    } else {
      this.schedule()
    }
  }

  /** The queue's own replies come one at a time, so each is newer than the last. */
  private accept(snapshot: CartSnapshot): void {
    this.server = snapshot.cart
    this.serverAt = Math.max(this.serverAt, snapshot.at)
    this.seeded = true
  }

  private fail(variantId: string, code: CartErrorCode): void {
    this.errors[variantId] = code
    this.failures += 1
  }

  private resolveIdle(): void {
    if (this.busy) {
      return
    }
    for (const resolve of this.idleWaiters.splice(0)) {
      resolve()
    }
  }

  private compute(): CartQueueState {
    return {
      seeded: this.seeded,
      server: this.server,
      view: applyIntents(this.server, Array.from(this.intents.values())),
      pending: this.busy,
      errors: { ...this.errors },
    }
  }

  private emit(): void {
    this.state = this.compute()
    this.listeners.forEach((listener) => listener())
  }
}
