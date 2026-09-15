import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { FULFILLMENT_TONES, PAYMENT_TONES } from "./order-status"

/**
 * A customer must never read a raw order enum. `OrderStatusDot` falls back to
 * `status.replaceAll("_", " ")` when a key is missing, which is how «not
 * fulfilled» and «shipped» would reach a Russian shop's order screen.
 */
const CATALOGS = path.join(__dirname, "../../../messages")

const catalog = (locale: string) =>
  JSON.parse(readFileSync(path.join(CATALOGS, `${locale}.json`), "utf8"))

const LOCALES = ["ru", "en"] as const

describe.each(LOCALES)("%s order status catalog", (locale) => {
  const messages = catalog(locale)

  it("translates every fulfillment status the storefront can draw", () => {
    const labels = messages.OrderDetails?.fulfillmentStatuses ?? {}

    for (const status of Object.keys(FULFILLMENT_TONES)) {
      expect(typeof labels[status], `${locale}: ${status}`).toBe("string")
      expect(labels[status].length, `${locale}: ${status}`).toBeGreaterThan(0)
    }
  })

  it("translates every payment status the storefront can draw", () => {
    const labels = messages.OrderDetails?.paymentStatuses ?? {}

    for (const status of Object.keys(PAYMENT_TONES)) {
      expect(typeof labels[status], `${locale}: ${status}`).toBe("string")
      expect(labels[status].length, `${locale}: ${status}`).toBeGreaterThan(0)
    }
  })

  it("gives every translated status a colour to be drawn in", () => {
    for (const status of Object.keys(messages.OrderDetails?.fulfillmentStatuses ?? {})) {
      expect(FULFILLMENT_TONES[status], `${locale}: ${status}`).toBeDefined()
    }

    for (const status of Object.keys(messages.OrderDetails?.paymentStatuses ?? {})) {
      expect(PAYMENT_TONES[status], `${locale}: ${status}`).toBeDefined()
    }
  })
})

describe("ru order status catalog", () => {
  const ru = catalog("ru")

  it("says «Отправлен» and «Трек-номер» in Russian, not the enum", () => {
    expect(ru.OrderDetails.fulfillmentStatuses.shipped).toBe("Отправлен")
    expect(ru.OrderDetails.fulfillmentStatuses.delivered).toBe("Доставлен")
    expect(ru.OrderDetails.fulfillmentStatuses.fulfilled).toBe("Собран")
    expect(ru.OrderDetails.paymentStatuses.captured).toBe("Оплачен")
    expect(ru.OrderTimeline.trackingNumber).toBe("Трек-номер")
  })

  it("carries no latin order enum as a label", () => {
    const labels = [
      ...Object.values(ru.OrderDetails.fulfillmentStatuses as Record<string, string>),
      ...Object.values(ru.OrderDetails.paymentStatuses as Record<string, string>),
    ]

    for (const label of labels) {
      expect(label, label).not.toMatch(/[a-z]_[a-z]|^(shipped|fulfilled|delivered|captured)$/i)
    }
  })
})
