import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  isValidEvmAddress,
  isValidFacilitatorUrl,
  readX402Payment,
  shortHash,
  x402DraftErrors,
  x402DraftFrom,
  x402Payload,
} from "../lib/x402-settings.ts"

/**
 * «x402 (USDC)» on «Приём оплат» (t-2026-10-03-33). `x402-settings.ts` is plain
 * TS with no JSX, so it is imported and run for real, as
 * `btcpay-settings.test.mjs` does. What it pins down: the form starts from the
 * stored row or the instance's default facilitator, the switch cannot go on
 * without an address and a network, and the PUT body is trimmed.
 */

const ADDRESS = "0xAbCdEf0123456789aBcDeF0123456789abcdef01"

const stored = {
  id: "tis_1",
  provider: "x402",
  is_enabled: false,
  is_test: true,
  pay_to: ADDRESS,
  networks: ["eip155:84532"],
  facilitator_url: "https://x402.org/facilitator",
}

test("the form starts from the stored row, or from the default facilitator with no row", () => {
  assert.deepEqual(x402DraftFrom(stored, "https://other.example"), {
    enabled: false,
    pay_to: ADDRESS,
    networks: ["eip155:84532"],
    facilitator_url: "https://x402.org/facilitator",
  })
  assert.deepEqual(x402DraftFrom(null, "https://x402.org/facilitator"), {
    enabled: false,
    pay_to: "",
    networks: [],
    facilitator_url: "https://x402.org/facilitator",
  })
})

test("the address is checked for format only", () => {
  assert.equal(isValidEvmAddress(ADDRESS), true)
  assert.equal(isValidEvmAddress(`  ${ADDRESS}  `), true)
  assert.equal(isValidEvmAddress("0x123"), false)
  assert.equal(isValidEvmAddress(ADDRESS.replace("0x", "1x")), false)
  assert.equal(isValidEvmAddress(`${ADDRESS}00`), false)
  assert.equal(isValidEvmAddress("0xZZcdEf0123456789aBcDeF0123456789abcdef01"), false)
})

test("the facilitator address follows the backend's rules", () => {
  assert.equal(isValidFacilitatorUrl("https://x402.org/facilitator"), true)
  assert.equal(isValidFacilitatorUrl("http://localhost:4022"), true)
  assert.equal(isValidFacilitatorUrl("http://x402.org/facilitator"), false)
  assert.equal(isValidFacilitatorUrl("https://x402.org/facilitator?x=1"), false)
  assert.equal(isValidFacilitatorUrl("https://x402.org/facilitator#top"), false)
  assert.equal(isValidFacilitatorUrl("https://user:pw@x402.org"), false)
  assert.equal(isValidFacilitatorUrl("x402.org"), false)
})

test("switching on needs an address and a network", () => {
  assert.deepEqual(x402DraftErrors({ ...x402DraftFrom(stored, ""), enabled: true }), {})
  assert.deepEqual(
    x402DraftErrors({ enabled: true, pay_to: "", networks: [], facilitator_url: "https://x402.org/facilitator" }),
    { pay_to: "x402.errors.required", networks: "x402.errors.networks" }
  )
})

test("a switched-off row may be saved incomplete, but not with a malformed value", () => {
  assert.deepEqual(x402DraftErrors({ enabled: false, pay_to: "", networks: [], facilitator_url: "" }), {})
  assert.deepEqual(
    x402DraftErrors({ enabled: false, pay_to: "0x12", networks: [], facilitator_url: "http://x402.org" }),
    { pay_to: "x402.errors.payTo", facilitator_url: "x402.errors.facilitatorUrl" }
  )
})

test("the PUT body is trimmed, always carries networks and the switch, and omits empty values", () => {
  assert.deepEqual(
    x402Payload({
      enabled: true,
      pay_to: `  ${ADDRESS} `,
      networks: ["eip155:84532"],
      facilitator_url: " https://x402.org/facilitator ",
    }),
    {
      is_enabled: true,
      networks: ["eip155:84532"],
      pay_to: ADDRESS,
      facilitator_url: "https://x402.org/facilitator",
    }
  )
  const empty = x402Payload({ enabled: false, pay_to: " ", networks: [], facilitator_url: "" })
  assert.deepEqual(empty, { is_enabled: false, networks: [] })
  assert.equal("pay_to" in empty, false)
  assert.equal("facilitator_url" in empty, false)
})

test("the order's payment data is read defensively", () => {
  const hash = `0x${"a".repeat(30)}${"b".repeat(34)}`
  assert.equal(readX402Payment(null), null)
  assert.equal(readX402Payment({}), null)
  assert.equal(readX402Payment({ transaction: 5 }), null)
  assert.deepEqual(
    readX402Payment({
      transaction: hash,
      explorer_url: "https://sepolia.basescan.org/tx/" + hash,
      network: "eip155:84532",
      testnet: true,
    }),
    {
      transaction: hash,
      explorerUrl: "https://sepolia.basescan.org/tx/" + hash,
      network: "Base Sepolia",
      testnet: true,
    }
  )
  const plain = readX402Payment({ transaction: hash, explorer_url: "javascript:alert(1)", testnet: "yes" })
  assert.equal(plain.explorerUrl, null)
  assert.equal(plain.network, null)
  assert.equal(plain.testnet, false)
})

test("a hash is shortened to its first 10 and last 8 characters", () => {
  const hash = `0x${"a".repeat(30)}${"b".repeat(34)}`
  assert.equal(shortHash(hash), `0xaaaaaaaa…${"b".repeat(8)}`)
  assert.equal(shortHash("0x1234"), "0x1234")
})

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const catalogs = {
  ru: JSON.parse(read("../i18n/translations/ru.json")),
  en: JSON.parse(read("../i18n/translations/en.json")),
}
const keysOf = (node, prefix = "") =>
  Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === "object" ? keysOf(value, `${prefix}${key}.`) : [`${prefix}${key}`]
  )

test("every x402 string exists in both panel languages, translated", () => {
  const en = keysOf(catalogs.en.x402).sort()
  const ru = keysOf(catalogs.ru.x402).sort()
  assert.deepEqual(ru, en)
  assert.ok(en.length > 10)
  assert.notEqual(catalogs.ru.x402.subtitle, catalogs.en.x402.subtitle)
  for (const c of [catalogs.en, catalogs.ru]) {
    assert.ok(c.paymentSettings.methodsSummary.x402)
    assert.ok(c.orders.payment.provider.x402)
    assert.ok(c.orders.payment.x402Transaction)
    assert.ok(c.orders.payment.x402TestNetwork)
  }
  assert.notEqual(catalogs.ru.orders.payment.x402Transaction, catalogs.en.orders.payment.x402Transaction)
})

test("the card leads back to the list unless the backend says available, and the list puts it after BTCPay", () => {
  const card = read("../routes/settings/payments/components/x402-card.tsx")
  assert.match(
    card,
    /if \(x402 && x402\.available !== true\) \{\s*return <Navigate to="\/settings\/payments" replace \/>\s*\}/
  )

  // t-2026-10-14-01 (G3): the list's order is the prototype's, x402 last.
  const ways = read("../routes/settings/payments/payment-ways.ts")
  assert.match(ways, /\["robokassa", "manual", "tribute", "btcpay", "bitcart", "x402"\]/)
})

test("an address that only takes test networks reads «тестовая сеть», orange (design-system rule 17)", () => {
  const ways = read("../routes/settings/payments/payment-ways.ts")
  assert.match(ways, /testnet: "orange"/)
  assert.equal(catalogs.ru.paymentMethods.state.testnet, "тестовая сеть")
})
