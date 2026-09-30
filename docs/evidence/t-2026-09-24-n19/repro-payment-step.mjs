#!/usr/bin/env node
/**
 * t-2026-09-24-n19: which red sentence the checkout shows for an address that is
 * missing one postable field, measured in a headless Chromium on a stand.
 *
 *   PLAYWRIGHT_PATH=<.../playwright> BASE=http://olavka-com.localhost:8611 TAG=<before|after> \
 *     [WIDTHS=1440,390] node repro-payment-step.mjs
 *
 * Four carts, each at every width:
 *   form-full        product → cart → checkout, courier delivery, the address form filled
 *                    in full (street, index, city, region), contacts filled: the control case
 *   form-no-street   the same form with the street left empty and «Сохранить» pressed: the
 *                    sentence the address sheet answers with
 *   api-no-province  the 24.09 path: the cart is opened and addressed through the store API
 *                    with street, city and index but no region, then the checkout is opened
 *                    on it (the `_medusa_cart_id` cookie)
 *   api-no-street    the same with region, city and index but no street
 * For each it records the red sentences on the page (`shipping-address-incomplete` above
 * «Оплатить», `address-incomplete-message` in the address sheet) with their computed
 * colour, whether «Оплатить» is disabled, the fields the cart's address is really missing,
 * and a full-page screenshot shots/<TAG>-<cart>-<width>.png. Every name, phone and e-mail
 * is made up here; nothing is read from the shop's customers.
 */
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright")

const BASE = (process.env.BASE ?? "http://olavka-com.localhost:8611").replace(/\/$/, "")
const TAG = process.env.TAG ?? "stand"
const WIDTHS = (process.env.WIDTHS ?? "1440,390").split(",").map(Number)
const BACKEND = process.env.BACKEND ?? "http://localhost:9611"
const PRODUCT = process.env.PRODUCT ?? "steviya-v-tabletkah-saharozamenitel-100-sht-cherkashino"
const COURIER = /DHL/i
const SHOTS = path.join(HERE, "shots")
const HOST = new URL(BASE).hostname

const BUYER = { first_name: "Тест", last_name: "Покупатель", phone: "+70000000000" }
const EMAIL = "buyer@example.com"
const STREET = "ул. Тестовая, д. 1"
const CITY = "Москва"
const INDEX = "101000"
const REGION = "Москва"

fs.mkdirSync(SHOTS, { recursive: true })

const byHost = await (await fetch(`${BACKEND}/storefront/by-host?host=${HOST}`)).json()
const KEY = byHost.publishable_key
const store = async (method, route, body) => {
  const response = await fetch(`${BACKEND}${route}`, {
    method,
    headers: { "content-type": "application/json", "x-publishable-api-key": KEY },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await response.json()
  if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${JSON.stringify(json).slice(0, 200)}`)
  return json
}

const { regions } = await store("GET", "/store/regions?limit=1000&fields=id,countries.iso_2")
const russia = regions.find((region) => region.countries?.some((country) => country.iso_2 === "ru"))
const { products } = await store("GET", `/store/products?handle=${PRODUCT}&region_id=${russia.id}&fields=id,variants.id`)
const variantId = products[0].variants[0].id

const missingFields = (address) =>
  ["address_1", "postal_code", "city", "province"].filter((field) => !address?.[field]?.trim())

const cartOf = async (page) => {
  const cookie = (await page.context().cookies()).find((c) => c.name === "_medusa_cart_id")
  if (!cookie?.value) return null
  const { cart } = await store("GET", `/store/carts/${cookie.value}?fields=id,*shipping_address`)
  return cart
}

const redSentences = (page) =>
  page.evaluate(() =>
    ["shipping-address-incomplete", "address-incomplete-message"].flatMap((id) =>
      [...document.querySelectorAll(`[data-testid="${id}"]`)]
        .filter((el) => el.getBoundingClientRect().height > 0)
        .map((el) => ({ testid: id, text: el.innerText.trim(), color: getComputedStyle(el).color }))
    )
  )

const payDisabled = (page) =>
  page.locator('[data-testid="submit-order-button"]').first().isDisabled().catch(() => null)

/** Opens the checkout on a fresh cart filled through the form; returns the page. */
const formCheckout = async (context, { street }) => {
  const page = await context.newPage()
  await page.goto(`${BASE}/ru/products/${PRODUCT}`, { waitUntil: "networkidle" })
  await page.locator('[data-testid="add-product-button"]:visible').first().click()
  await page.waitForResponse((r) => r.request().method() === "POST", { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await page.goto(`${BASE}/ru/checkout`, { waitUntil: "networkidle" })

  await page.locator('[data-testid="delivery-option-radio"]', { hasText: COURIER }).first().click()
  await page.waitForLoadState("networkidle")

  await page.locator('[data-testid="checkout-contacts-row"]').click()
  const contacts = page.locator('[role="dialog"]')
  await contacts.locator('input[name="first_name"]').fill(BUYER.first_name)
  await contacts.locator('input[name="last_name"]').fill(BUYER.last_name)
  await contacts.locator('input[name="email"]').fill(EMAIL)
  await contacts.locator('input[name="phone"]').fill(BUYER.phone)
  await contacts.locator('button[type="submit"]').click()
  await contacts.waitFor({ state: "detached", timeout: 15000 }).catch(() => {})
  await page.waitForLoadState("networkidle")

  await page.locator('[data-testid="checkout-address-row"]').click()
  const sheet = page.locator('[role="dialog"]')
  if (street) await sheet.locator('input[name="address_1"]').fill(street)
  await sheet.locator('input[name="postal_code"]').fill(INDEX)
  await sheet.locator('input[name="city"]').fill(CITY)
  // Close the city suggestions by leaving the field, not with Escape, which closes the sheet.
  await sheet.locator("h2, [id^='headlessui-dialog-title']").first().click()
  await sheet.locator('select[name="province"]').selectOption({ label: REGION })
  await sheet.locator('button[type="submit"]').click()
  await page.waitForTimeout(2500)
  await page.waitForLoadState("networkidle")
  return page
}

/** Opens and addresses a cart through the store API, then the checkout on it. */
const apiCheckout = async (context, address) => {
  const { cart } = await store("POST", "/store/carts", {
    region_id: russia.id,
    email: EMAIL,
    items: [{ variant_id: variantId, quantity: 1 }],
  })
  const shipping_address = { ...BUYER, country_code: "ru", ...address }
  await store("POST", `/store/carts/${cart.id}`, { shipping_address, billing_address: shipping_address })
  const { shipping_options } = await store("GET", `/store/shipping-options?cart_id=${cart.id}`)
  const courier = shipping_options.find((option) => COURIER.test(option.name))
  await store("POST", `/store/carts/${cart.id}/shipping-methods`, { option_id: courier.id })
  await context.addCookies([{ name: "_medusa_cart_id", value: cart.id, domain: HOST, path: "/" }])
  const page = await context.newPage()
  await page.goto(`${BASE}/ru/checkout`, { waitUntil: "networkidle" })
  return page
}

const CARTS = {
  "form-full": (context) => formCheckout(context, { street: STREET }),
  "form-no-street": (context) => formCheckout(context, { street: "" }),
  "api-no-province": (context) => apiCheckout(context, { address_1: STREET, city: CITY, postal_code: INDEX }),
  "api-no-street": (context) => apiCheckout(context, { city: CITY, postal_code: INDEX, province: REGION }),
}

const browser = await chromium.launch()
const runs = []
for (const [name, open] of Object.entries(CARTS)) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: width < 1024 ? 844 : 900 },
      locale: "ru-RU",
    })
    const page = await open(context)
    const cart = await cartOf(page)
    const run = {
      cart: name,
      width,
      url: page.url(),
      cartAddressMissing: missingFields(cart?.shipping_address),
      red: await redSentences(page),
      payDisabled: await payDisabled(page),
      shot: `shots/${TAG}-${name}-${width}.png`,
    }
    await page.screenshot({ path: path.join(HERE, run.shot), fullPage: true })
    runs.push(run)
    console.log(
      `${name} ${width}: cart address missing [${run.cartAddressMissing.join(", ")}]; pay disabled ${run.payDisabled}; ` +
        (run.red.length ? run.red.map((r) => `${r.testid} ${r.color}: «${r.text.replace(/\n/g, " / ")}»`).join("; ") : "no red sentence")
    )
    await context.close()
  }
}
await browser.close()

fs.writeFileSync(
  path.join(HERE, `repro-${TAG}.json`),
  JSON.stringify({ tag: TAG, base: BASE, measuredAt: new Date().toISOString(), runs }, null, 2) + "\n"
)
