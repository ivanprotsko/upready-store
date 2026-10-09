import { describe, expect, it } from "vitest"

import {
  AHEAD_SCREENS,
  BATCH_PRODUCTS,
  FIRST_SCREENS_PRODUCTS,
  MAX_REQUEST_PRODUCTS,
  clampRequest,
  createListLoader,
  needsMore,
  parsePosition,
  positionKey,
  restoreLimit,
  retryDelay,
  type ListState,
} from "./infinite-list"

/**
 * t-2026-10-09-75, rule 5zg. Ivan, 09.10.2026, about cherkashino.ru/ru/store: «убираем
 * пагинацию и больше никогда не делаем, вместо этого делаем lazy-loading, при этом товары
 * должны загрузиться еще до того как пользователь начал скроллить, чтобы когда он начнет
 * крутить, то начали грузиться товары уже с четвертого и пятого экранов, т.е. не позволять
 * появляться задержке».
 *
 * A fake page: a phone of 844px, two cards a row, a row 300px tall, the list starting 400px
 * down. The loader is driven the way `InfiniteProducts` drives it: `start` once the list is on
 * the page, `rendered` after a batch is drawn, `check` on a scroll.
 */
const VIEWPORT = 844
const ROW = 300
const PER_ROW = 2
const LIST_TOP = 400

function fakePage({ total, shown = FIRST_SCREENS_PRODUCTS, fail = [] as number[] }: { total: number; shown?: number; fail?: number[] }) {
  let products = shown
  let scrollY = 0
  const requests: { offset: number; limit: number; at: number }[] = []
  const timers: { run: () => void; ms: number }[] = []
  const states: ListState[] = []
  const pending: (() => void)[] = []
  let call = 0

  const loader = createListLoader({
    shown,
    total,
    fetchBatch: (offset, limit) => {
      requests.push({ offset, limit, at: scrollY })
      const attempt = call++
      return new Promise((resolve, reject) => {
        pending.push(() => {
          if (fail.includes(attempt)) return reject(new Error("batch failed"))
          const received = Math.max(0, Math.min(limit, total - offset))
          products = offset + received
          resolve({ received, total })
        })
      })
    },
    measure: () => ({ sentinelTop: LIST_TOP + Math.ceil(products / PER_ROW) * ROW - scrollY, viewportHeight: VIEWPORT }),
    scrollTo: (y) => {
      scrollY = y
    },
    setTimer: (run, ms) => {
      const timer = { run, ms }
      timers.push(timer)
      return () => {
        timers.splice(timers.indexOf(timer), 1)
      }
    },
    onState: (state) => states.push(state),
  })

  /** The server answers the request in flight, and the page draws what came. */
  const answer = async () => {
    const next = pending.shift()
    if (!next) throw new Error("no request in flight")
    next()
    await Promise.resolve()
    await Promise.resolve()
    loader.rendered()
  }

  return {
    loader,
    requests,
    timers,
    states,
    answer,
    inFlight: () => pending.length,
    products: () => products,
    scrollY: () => scrollY,
    scroll: (y: number) => {
      scrollY = y
      loader.check()
    },
    /** How many screens of products stand below the bottom of the window. */
    lead: () => (LIST_TOP + Math.ceil(products / PER_ROW) * ROW - scrollY - VIEWPORT) / VIEWPORT,
  }
}

describe("rule 5zg: the list loads ahead of the buyer", () => {
  it("asks for the products of the 4th and 5th screens on start, before any scroll", async () => {
    const page = fakePage({ total: 120 })

    page.loader.start()

    // The server's 24 cards end inside the 5th screen; the first batch goes out with no scroll.
    expect(page.requests).toEqual([{ offset: FIRST_SCREENS_PRODUCTS, limit: BATCH_PRODUCTS, at: 0 }])
    await page.answer()
    // …and the list keeps asking until five screens stand below the window, still at the top.
    while (page.inFlight()) await page.answer()
    expect(page.requests.every((request) => request.at === 0)).toBe(true)
    expect(page.lead()).toBeGreaterThanOrEqual(AHEAD_SCREENS)
  })

  it("keeps five screens ahead while the buyer scrolls", async () => {
    const page = fakePage({ total: 400 })
    page.loader.start()
    while (page.inFlight()) await page.answer()

    for (let y = 0; y <= 20 * VIEWPORT; y += VIEWPORT / 2) {
      page.scroll(y)
      while (page.inFlight()) await page.answer()
      expect(page.lead(), `at ${y}px`).toBeGreaterThanOrEqual(AHEAD_SCREENS)
    }
  })

  it("asks for nothing while five screens are already ahead", () => {
    const page = fakePage({ total: 400, shown: 80 })

    page.loader.start()

    expect(page.requests).toEqual([])
  })

  it("one request at a time: a scroll while a batch is on its way asks for nothing more", () => {
    const page = fakePage({ total: 400 })
    page.loader.start()

    page.scroll(VIEWPORT)
    page.scroll(2 * VIEWPORT)

    expect(page.requests).toHaveLength(1)
  })
})

describe("rule 5zg: the end, said once", () => {
  it("is done when the total is reached and asks for nothing after it", async () => {
    const page = fakePage({ total: 40 })
    page.loader.start()
    while (page.inFlight()) await page.answer()

    expect(page.loader.state()).toEqual({ loaded: 40, status: "done" })
    expect(page.states.filter((state) => state.status === "done")).toHaveLength(1)
    page.scroll(10 * VIEWPORT)
    expect(page.requests).toHaveLength(1)
  })

  it("a list the server rendered whole is done from the start and asks for nothing", () => {
    const page = fakePage({ total: 10, shown: 10 })

    page.loader.start()

    expect(page.loader.state()).toEqual({ loaded: 10, status: "done" })
    expect(page.requests).toEqual([])
  })

  it("an empty batch ends the list even if the total said more", async () => {
    const requests: number[] = []
    const loader = createListLoader({
      shown: 24,
      total: 60,
      fetchBatch: async (offset) => {
        requests.push(offset)
        return { received: 0, total: 24 }
      },
      measure: () => ({ sentinelTop: 100, viewportHeight: VIEWPORT }),
      scrollTo: () => {},
      setTimer: () => () => {},
      onState: () => {},
    })

    loader.start()
    await Promise.resolve()
    await Promise.resolve()

    expect(loader.state().status).toBe("done")
    loader.check()
    expect(requests).toEqual([24])
  })
})

describe("rule 5zg: a failed batch retries by itself and erases nothing", () => {
  it("waits, asks for the same products again, and keeps what is shown meanwhile", async () => {
    const page = fakePage({ total: 120, fail: [0, 1] })
    page.loader.start()

    await page.answer()
    expect(page.loader.state()).toEqual({ loaded: FIRST_SCREENS_PRODUCTS, status: "retrying" })
    expect(page.timers.map((timer) => timer.ms)).toEqual([retryDelay(0)])

    page.timers.shift()?.run()
    await page.answer()
    expect(page.timers.map((timer) => timer.ms)).toEqual([retryDelay(1)])
    expect(page.loader.state().loaded).toBe(FIRST_SCREENS_PRODUCTS)

    page.timers.shift()?.run()
    await page.answer()
    expect(page.requests.slice(0, 3).map((request) => request.offset)).toEqual([24, 24, 24])
    expect(page.loader.state().loaded).toBe(48)
  })

  it("a scroll while it waits does not jump the queue; the network coming back does", async () => {
    const page = fakePage({ total: 120, fail: [0] })
    page.loader.start()
    await page.answer()

    page.scroll(3 * VIEWPORT)
    expect(page.requests).toHaveLength(1)

    page.loader.retryNow()
    expect(page.requests).toHaveLength(2)
    expect(page.timers).toEqual([])
  })

  it("waits longer each time, up to fifteen seconds", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(retryDelay)).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000])
  })

  it("a list that left the page asks for nothing more", async () => {
    const page = fakePage({ total: 120, fail: [0] })
    page.loader.start()
    await page.answer()

    page.loader.stop()
    expect(page.timers).toEqual([])
    page.scroll(5 * VIEWPORT)
    expect(page.requests).toHaveLength(1)
  })
})

describe("«back» from a product returns to the same place", () => {
  it("brings the products the buyer had in one request, then scrolls to where they were", async () => {
    const page = fakePage({ total: 120 })

    page.loader.start({ count: 96, y: 6000 })

    expect(page.requests).toEqual([{ offset: 24, limit: 72, at: 0 }])
    await page.answer()
    expect(page.products()).toBe(96)
    // Back at the place, and from there the list looks ahead as usual.
    expect(page.scrollY()).toBe(6000)
    page.scroll(6000 + 5 * VIEWPORT)
    expect(page.requests.at(-1)).toEqual({ offset: 96, limit: BATCH_PRODUCTS, at: 6000 + 5 * VIEWPORT })
  })

  it("asks for nothing ahead until the page is back at the place", () => {
    const page = fakePage({ total: 120 })

    page.loader.start({ count: 96, y: 6000 })
    page.scroll(100)

    expect(page.requests).toHaveLength(1)
  })

  it("keeps the place with every product the list holds, a batch after the last scroll included", async () => {
    const page = fakePage({ total: 120 })

    page.loader.start(null)
    page.scroll(3000)
    expect(page.loader.position(3000)).toEqual({ count: 24, y: 3000 })
    await page.answer()

    // No scroll since the batch came: the place still counts it (stand, 1440: 72 shown, 48 kept).
    expect(page.loader.position(3000)).toEqual({ count: 48, y: 3000 })
  })

  it("keeps no place while it is still returning to the saved one", async () => {
    const page = fakePage({ total: 120 })

    page.loader.start({ count: 96, y: 6000 })
    expect(page.loader.position(0)).toBeNull()
    await page.answer()

    expect(page.loader.position(6000)).toEqual({ count: 96, y: 6000 })
  })

  it("scrolls at once when the server's first screens already hold the place", () => {
    const page = fakePage({ total: 120, shown: 80 })

    page.loader.start({ count: 30, y: 1200 })

    expect(page.requests).toEqual([])
    expect(page.lead()).toBeCloseTo((LIST_TOP + 40 * ROW - 1200 - VIEWPORT) / VIEWPORT)
  })

  it("a list reached by a link starts at the top with no request for the old place", () => {
    const page = fakePage({ total: 120 })

    page.loader.start(null)

    expect(page.requests).toEqual([{ offset: 24, limit: BATCH_PRODUCTS, at: 0 }])
  })

  it("asks for no more than the list has, and no more than one request may carry", () => {
    expect(restoreLimit({ count: 96, y: 1 }, 24, 50)).toBe(26)
    expect(restoreLimit({ count: 2000, y: 1 }, 24, 5000)).toBe(MAX_REQUEST_PRODUCTS)
    expect(restoreLimit({ count: 10, y: 1 }, 24, 120)).toBe(0)
    expect(restoreLimit(null, 24, 120)).toBe(0)
  })

  it("reads a saved place only when it is whole", () => {
    expect(parsePosition(JSON.stringify({ count: 48, y: 3100.6 }))).toEqual({ count: 48, y: 3100 })
    for (const raw of [null, "", "{", "[]", '{"count":"48","y":1}', '{"count":-1,"y":1}', '{"count":1}']) {
      expect(parsePosition(raw), String(raw)).toBeNull()
    }
  })

  it("keeps a place per list: the address with its sort and filters", () => {
    expect(positionKey("/ru/store", "?sortBy=price_asc")).not.toBe(positionKey("/ru/store", ""))
    expect(positionKey("/ru/categories/asd", "")).toBe("products-list:/ru/categories/asd")
  })
})

describe("the numbers", () => {
  it("looks ahead from the bottom of the window, in screens", () => {
    expect(needsMore({ sentinelTop: VIEWPORT + 4.9 * VIEWPORT, viewportHeight: VIEWPORT })).toBe(true)
    expect(needsMore({ sentinelTop: VIEWPORT + 5 * VIEWPORT, viewportHeight: VIEWPORT })).toBe(false)
    expect(needsMore({ sentinelTop: 100, viewportHeight: 0 })).toBe(false)
  })

  it("a background request is held to whole products, from zero, at most 240", () => {
    expect(clampRequest(24, 24)).toEqual({ offset: 24, limit: 24 })
    expect(clampRequest(-5, 10_000)).toEqual({ offset: 0, limit: MAX_REQUEST_PRODUCTS })
    expect(clampRequest(12.7, 0)).toEqual({ offset: 12, limit: 1 })
    expect(clampRequest("24", null)).toEqual({ offset: 0, limit: BATCH_PRODUCTS })
  })
})
