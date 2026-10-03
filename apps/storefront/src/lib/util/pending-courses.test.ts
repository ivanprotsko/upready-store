import { describe, expect, it } from "vitest"

import { pendingCoursesFromOrders } from "./pending-courses"

type Order = Parameters<typeof pendingCoursesFromOrders>[0][number]

const course = (id: string, title: string, overrides: Record<string, unknown> = {}) =>
  ({
    id: `li_${id}`,
    product_id: id,
    product_title: title,
    product_handle: `h-${id}`,
    thumbnail: null,
    requires_shipping: false,
    product: { id, handle: `h-${id}`, metadata: { digital: "true" } },
    ...overrides,
  }) as unknown as Order["items"] extends (infer T)[] | null | undefined ? T : never

const kit = {
  id: "li_kit",
  product_id: "kit",
  product_title: "Набор",
  requires_shipping: true,
  product: { id: "kit", metadata: {} },
} as unknown as Order["items"] extends (infer T)[] | null | undefined ? T : never

const order = (
  id: string,
  items: Order["items"],
  payment_status = "authorized",
  metadata: Record<string, unknown> | null = null,
  status = "pending"
): Order =>
  ({
    id,
    display_id: Number(id.replace(/\D/g, "")),
    status,
    payment_status,
    items,
    metadata,
  }) as unknown as Order

describe("pendingCoursesFromOrders", () => {
  it("lists a course from an unpaid order, with the buyer's status and the order to pay", () => {
    const pending = pendingCoursesFromOrders(
      [order("order_7", [course("c1", "Почки"), kit], "authorized", { payment_receipt: {} })],
      []
    )
    expect(pending).toEqual([
      {
        productId: "c1",
        title: "Почки",
        handle: "h-c1",
        thumbnail: null,
        orderId: "order_7",
        orderDisplayId: 7,
        status: "awaitingConfirmation",
      },
    ])
  })

  it("skips paid, cancelled and refunded orders and goods that are posted", () => {
    expect(
      pendingCoursesFromOrders(
        [
          order("order_1", [course("c1", "A")], "captured"),
          order("order_2", [course("c2", "B")], "authorized", null, "canceled"),
          order("order_3", [course("c3", "C")], "refunded"),
          order("order_4", [kit], "authorized"),
        ],
        []
      )
    ).toEqual([])
  })

  it("leaves out a course the customer already holds, and names each product once", () => {
    const pending = pendingCoursesFromOrders(
      [
        order("order_9", [course("c1", "A")], "authorized"),
        order("order_8", [course("c1", "A"), course("c2", "B")], "authorized", {
          payment_receipt: { status: "rejected", rejected_reason: "x" },
        }),
      ],
      ["c2"]
    )
    expect(pending.map((item) => [item.productId, item.orderId, item.status])).toEqual([
      ["c1", "order_9", "awaitingPayment"],
    ])
  })
})
