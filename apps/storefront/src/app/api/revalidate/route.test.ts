import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { tenantHomeTag } from "@lib/tenant/cache-tags"
import type { NextRequest } from "next/server"

const revalidateTag = vi.fn()
const revalidatePath = vi.fn()

vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}))

const post = async (
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) => {
  const { POST } = await import("./route")
  const request = {
    headers: new Headers(headers),
    json: async () => body,
  } as unknown as NextRequest

  return POST(request)
}

const clearedPaths = () => revalidatePath.mock.calls.map(([path]) => path)

/**
 * The backend subscriber (`apps/backend/src/subscribers/product-updated.ts`)
 * sends every event name below. An event the route has no branch for answers
 * `revalidated: true` and clears nothing, which is how a renamed product type
 * stayed on the storefront until the process restarted.
 */
describe("POST /api/revalidate", () => {
  beforeEach(() => {
    revalidateTag.mockClear()
    revalidatePath.mockClear()
    delete process.env.REVALIDATE_SECRET
  })

  it("clears the product pages for a product event", async () => {
    await post({ type: "product.updated", id: "prod_1" })

    expect(revalidateTag).toHaveBeenCalledWith("products")
    expect(clearedPaths()).toContain("/[locale]/(main)/products/[handle]")
  })

  it.each([
    "product-type.updated",
    "product-type.created",
    "product-type.deleted",
  ])("clears the product pages for %s", async (type) => {
    await post({ type, id: "ptyp_1" })

    expect(revalidateTag).toHaveBeenCalledWith("products")
    expect(clearedPaths()).toContain("/[locale]/(main)/products/[handle]")
    expect(clearedPaths()).toContain("/[locale]/(main)/store")
  })

  // The values of `InventoryLevelWorkflowEvents` and
  // `ReservationItemWorkflowEvents` in Medusa 2.19, printed from
  // `@medusajs/framework/utils`. The product list caches
  // `+variants.inventory_quantity`, which is stock minus reservations.
  it.each([
    "inventory-level.created",
    "inventory-level.updated",
    "inventory-level.deleted",
    "reservation-item.created",
    "reservation-item.updated",
    "reservation-item.deleted",
  ])("clears the pages that show stock for %s", async (type) => {
    await post({ type, id: "ilev_1" })

    expect(revalidateTag).toHaveBeenCalledWith("products")
    expect(clearedPaths()).toEqual(
      expect.arrayContaining([
        "/[locale]/(main)/products/[handle]",
        "/[locale]/(main)/store",
        "/[locale]/(main)/categories/[...category]",
        "/[locale]/(main)/collections/[handle]",
        "/[locale]/(main)",
      ])
    )
    // Stock is on neither of these, and a reservation is made by every order.
    expect(clearedPaths()).not.toContain("/sitemap.xml")
    expect(clearedPaths()).not.toContain("/llms.txt")
  })

  it("refuses a call that carries the wrong secret", async () => {
    process.env.REVALIDATE_SECRET = "expected"

    const response = await post({ type: "product.updated" })

    expect(response.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it("accepts a call that carries the right secret", async () => {
    process.env.REVALIDATE_SECRET = "expected"

    const response = await post(
      { type: "product.updated" },
      { "x-revalidate-secret": "expected" }
    )

    expect(response.status).toBe(200)
    expect(revalidateTag).toHaveBeenCalledWith("products")
  })

  it("refuses a secret of a different length without throwing (timingSafeEqual needs equal-length buffers)", async () => {
    process.env.REVALIDATE_SECRET = "a-fairly-long-expected-secret"

    const response = await post(
      { type: "product.updated" },
      { "x-revalidate-secret": "short" }
    )

    expect(response.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

/**
 * 46df A-16: an unset `REVALIDATE_SECRET` used to mean "open to anyone" (the old `&&` short-
 * circuit) — the real risk is production, where the deploy compose file (`deploy/compose.mt.yml`)
 * always sets the variable, so a missing one there is a genuine misconfiguration, not a template
 * default. Outside production (a template clone's first run, this repo's own dev/test) it still
 * means "not configured yet" and the route stays open, exactly as before this fix.
 */
describe("POST /api/revalidate: REVALIDATE_SECRET not configured", () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    revalidateTag.mockClear()
    revalidatePath.mockClear()
    delete process.env.REVALIDATE_SECRET
  })

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test")
  })

  it("in production, no secret configured: 503, clears nothing", async () => {
    vi.stubEnv("NODE_ENV", "production")

    const response = await post({ type: "product.updated" })

    expect(response.status).toBe(503)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it("outside production, no secret configured: still open, unchanged behaviour", async () => {
    vi.stubEnv("NODE_ENV", "development")

    const response = await post({ type: "product.updated" })

    expect(response.status).toBe(200)
    expect(revalidateTag).toHaveBeenCalledWith("products")
  })
})

/**
 * The whole answer of the route, pinned call by call and in order: which tags
 * and which paths every event clears. It was written against the chain of `if`
 * blocks the route used to be, so the table that replaced the chain had to
 * reproduce it exactly (architecture review 2026-09-21, finding L-1).
 */
describe("what every revalidation event clears", () => {
  beforeEach(() => {
    revalidateTag.mockClear()
    revalidatePath.mockClear()
    delete process.env.REVALIDATE_SECRET
  })

  const PRODUCT = ["/[locale]/(main)/products/[handle]", "page"]
  const STORE = ["/[locale]/(main)/store", "page"]
  const CATEGORY = ["/[locale]/(main)/categories/[...category]", "page"]
  const COLLECTION = ["/[locale]/(main)/collections/[handle]", "page"]
  const HOME = ["/[locale]/(main)", "page"]
  const LAYOUT = ["/[locale]/(main)", "layout"]
  const LLMS = ["/llms.txt"]
  const SITEMAP = ["/sitemap.xml"]

  const each = (names: string[], verbs = ["updated", "created", "deleted"]) =>
    names.flatMap((name) => verbs.map((verb) => `${name}.${verb}`))

  const groups: { types: string[]; tags: string[]; paths: string[][] }[] = [
    {
      types: each([
        "product",
        "product-variant",
        "product-type",
        "product-tag",
        "product-option",
      ]),
      tags: ["products"],
      paths: [PRODUCT, STORE, CATEGORY, COLLECTION, HOME, LLMS, SITEMAP],
    },
    {
      types: each(["inventory-level", "reservation-item"]),
      tags: ["products"],
      paths: [PRODUCT, STORE, CATEGORY, COLLECTION, HOME],
    },
    {
      types: each(["product-category"]),
      tags: ["categories"],
      paths: [PRODUCT, STORE, CATEGORY, COLLECTION, HOME, LLMS, SITEMAP],
    },
    {
      types: each(["product-collection"]),
      tags: ["collections"],
      paths: [COLLECTION, STORE, HOME, LLMS, SITEMAP],
    },
    {
      types: each(["translation"]),
      tags: ["products", "categories", "collections"],
      paths: [PRODUCT, STORE, CATEGORY, COLLECTION, HOME, LLMS, SITEMAP],
    },
    {
      types: ["tenant.pages"],
      tags: ["tenant-pages"],
      paths: [["/[locale]/(main)/pages/[key]", "page"], LAYOUT],
    },
    {
      types: ["tenant.product-attributes"],
      tags: ["product-attributes"],
      paths: [PRODUCT, STORE, CATEGORY],
    },
    {
      types: ["tenant.home"],
      tags: ["tenant-home"],
      paths: [LAYOUT, HOME],
    },
    {
      types: ["tenant.reviews"],
      tags: ["product-reviews"],
      paths: [PRODUCT],
    },
    {
      types: ["tenant.articles"],
      tags: ["tenant-articles"],
      paths: [
        ["/[locale]/(main)/journal", "page"],
        ["/[locale]/(main)/journal/[slug]", "page"],
        LAYOUT,
        SITEMAP,
      ],
    },
  ]

  it.each(
    groups.flatMap(({ types, tags, paths }) =>
      types.map((type) => ({ type, tags, paths }))
    )
  )("$type", async ({ type, tags, paths }) => {
    const response = await post({ type, id: "id_1" })

    expect(await response.json()).toEqual({ revalidated: true })
    expect(revalidateTag.mock.calls).toEqual(tags.map((tag) => [tag]))
    expect(revalidatePath.mock.calls).toEqual(paths)
  })

  it("clears one shop's home document as well when the call names the shop", async () => {
    await post({ type: "tenant.home", handle: "cherkashino" })

    expect(revalidateTag.mock.calls).toEqual([
      ["tenant-home"],
      [tenantHomeTag("cherkashino")],
    ])
    expect(revalidatePath.mock.calls).toEqual([LAYOUT, HOME])
  })

  it.each([{ handle: "" }, { handle: 7 }, {}])(
    "clears only the shared home tag for the handle of %o",
    async (extra) => {
      await post({ type: "tenant.home", ...extra })

      expect(revalidateTag.mock.calls).toEqual([["tenant-home"]])
    }
  )

  it("answers the same and clears nothing for an event it does not know", async () => {
    const response = await post({ type: "order.placed", id: "order_1" })

    expect(await response.json()).toEqual({ revalidated: true })
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
