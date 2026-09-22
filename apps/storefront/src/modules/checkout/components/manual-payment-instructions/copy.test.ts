import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * The offline payment kinds (olavka-payments) added a whole `ManualPayment`
 * namespace plus `PaymentButton.placeOrderManual`. A missing key fails at
 * runtime rather than at build time in this repository, and there is no parity
 * gate, so this test keeps every catalog carrying every key `en.json` has in
 * that namespace, and keeps the components reading keys that exist.
 */

const MESSAGES = path.join(process.cwd(), "messages")
/** Each component with the name its `ManualPayment` translator is bound to. */
const COMPONENTS: Array<[file: string, translator: string]> = [
  [path.join(__dirname, "index.tsx"), "t"],
  [path.join(__dirname, "..", "manual-payment-kind-select", "index.tsx"), "t"],
  [path.join(__dirname, "..", "manager-contact-cta", "index.tsx"), "t"],
  [
    path.join(
      process.cwd(),
      "src/modules/order/components/manual-payment-handover/index.tsx"
    ),
    "t",
  ],
  [
    path.join(process.cwd(), "src/modules/order/components/payment-details/index.tsx"),
    "tmp",
  ],
]

type Catalog = {
  ManualPayment: Record<string, unknown>
  PaymentButton: Record<string, unknown>
}

const catalogs = fs
  .readdirSync(MESSAGES)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({
    locale: f.replace(".json", ""),
    messages: JSON.parse(
      fs.readFileSync(path.join(MESSAGES, f), "utf8")
    ) as Catalog,
  }))

const en = catalogs.find((c) => c.locale === "en")!.messages

describe("manual payment copy", () => {
  it("ships one catalog per locale, so the loops below are not silently empty", () => {
    expect(catalogs.length).toBe(36)
  })

  it("carries every ManualPayment key of en.json in every locale", () => {
    const wanted = Object.keys(en.ManualPayment)
    expect(wanted.length).toBeGreaterThan(0)

    const gaps = catalogs
      .map(({ locale, messages }) => ({
        locale,
        missing: wanted.filter(
          (key) =>
            typeof messages.ManualPayment?.[key] !== "string" ||
            !(messages.ManualPayment[key] as string).trim()
        ),
      }))
      .filter(({ missing }) => missing.length > 0)

    expect(gaps).toEqual([])
  })

  it("labels the order button for an offline kind in every locale", () => {
    const missing = catalogs
      .filter(
        ({ messages }) =>
          typeof messages.PaymentButton.placeOrderManual !== "string" ||
          !(messages.PaymentButton.placeOrderManual as string).trim()
      )
      .map(({ locale }) => locale)

    expect(missing).toEqual([])
  })

  it("only reads ManualPayment keys that en.json defines", () => {
    const defined = new Set(Object.keys(en.ManualPayment))
    const unknown: string[] = []
    let seen = 0
    for (const [file, translator] of COMPONENTS) {
      const source = fs.readFileSync(file, "utf8")
      const call = new RegExp(`\\b${translator}\\(\\s*"([A-Za-z]+)"`, "g")
      let match: RegExpExecArray | null
      while ((match = call.exec(source)) !== null) {
        seen += 1
        if (!defined.has(match[1])) {
          unknown.push(`${path.basename(path.dirname(file))}: ${match[1]}`)
        }
      }
    }
    expect(seen).toBeGreaterThan(0)
    expect(unknown).toEqual([])
  })

  it("keeps the Russian catalog translated rather than copied from English", () => {
    const ru = catalogs.find((c) => c.locale === "ru")!.messages.ManualPayment
    for (const key of ["kindHeading", "handoverTitle", "awaitingPayment"]) {
      expect(ru[key]).not.toBe(en.ManualPayment[key])
    }
  })
})
