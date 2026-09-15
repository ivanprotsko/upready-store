import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * The confirmation page used to tell every buyer «Подтверждение заказа
 * отправлено на …» whether or not a letter had left the building. It is a claim
 * the storefront cannot check: the letter is the backend's business, and with no
 * SMTP provider configured the send fails and is logged while the page keeps
 * promising (f02-order-email-not-sent).
 *
 * So the copy states what is true instead, and these tests keep it that way. A
 * missing key fails at runtime rather than at build time in this repository, and
 * there is no parity gate, which is why the check is a test and not a comment.
 */

const MESSAGES = path.join(process.cwd(), "messages")
const COMPONENT = path.join(__dirname, "index.tsx")
const TEMPLATE = path.join(
  process.cwd(),
  "src/modules/order/templates/order-completed-template.tsx"
)

type Catalog = {
  OrderCompleted: Record<string, unknown>
  OrderDetails: Record<string, unknown>
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

describe("order confirmation copy", () => {
  it("ships one catalog per locale, so the loop below is not silently empty", () => {
    expect(catalogs.length).toBe(36)
  })

  it("never promises a letter the storefront cannot confirm was sent", () => {
    const offenders = catalogs
      .filter(({ messages }) => "confirmationSentBefore" in messages.OrderDetails)
      .map(({ locale }) => locale)

    expect(offenders).toEqual([])
  })

  it("names the order's contact address in every locale instead", () => {
    const missing = catalogs
      .filter(
        ({ messages }) =>
          typeof messages.OrderDetails.contactEmailBefore !== "string" ||
          !(messages.OrderDetails.contactEmailBefore as string).trim()
      )
      .map(({ locale }) => locale)

    expect(missing).toEqual([])
  })

  it("tells the buyer to keep the order number in every locale, because that number is what they are left with", () => {
    const missing = catalogs
      .filter(
        ({ messages }) =>
          typeof messages.OrderCompleted.keepOrderNumber !== "string" ||
          !(messages.OrderCompleted.keepOrderNumber as string).trim()
      )
      .map(({ locale }) => locale)

    expect(missing).toEqual([])
  })

  it("reads those keys from the components, so a catalog entry is not dead weight", () => {
    expect(fs.readFileSync(COMPONENT, "utf8")).toContain("contactEmailBefore")
    expect(fs.readFileSync(COMPONENT, "utf8")).not.toContain(
      "confirmationSentBefore"
    )
    expect(fs.readFileSync(TEMPLATE, "utf8")).toContain("keepOrderNumber")
  })
})
