import { beforeEach, describe, expect, it, vi } from "vitest"

import type { NextRequest } from "next/server"

const revalidateTag = vi.fn()
const revalidatePath = vi.fn()

vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}))

const post = async (body: Record<string, unknown>) => {
  const { POST } = await import("./route")
  const request = {
    headers: new Headers(),
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

  it.each(["product-type.updated", "product-type.created", "product-type.deleted"])(
    "clears the product pages for %s",
    async (type) => {
      await post({ type, id: "ptyp_1" })

      expect(revalidateTag).toHaveBeenCalledWith("products")
      expect(clearedPaths()).toContain("/[locale]/(main)/products/[handle]")
      expect(clearedPaths()).toContain("/[locale]/(main)/store")
    }
  )

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
})
