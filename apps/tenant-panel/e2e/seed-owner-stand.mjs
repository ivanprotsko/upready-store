#!/usr/bin/env node
/**
 * Fills a LOCAL scratch stand with the life a real shop has, so the walker and
 * the audit look at screens with data on them: customers, orders in several
 * states, reviews waiting for moderation.
 *
 *   BACKEND_URL=http://localhost:9321 OWNER_EMAIL=… OWNER_PASSWORD=… \
 *     node apps/tenant-panel/e2e/seed-owner-stand.mjs
 *
 * It talks HTTP only, through the same routes the storefront and the panel
 * use: customers register and check out with the shop's publishable key, the
 * owner then packs, ships, delivers or cancels through `/tenants/*`. Nothing is
 * inserted into a table by hand, so every order it leaves is one the panel has
 * to be able to open. It refuses any backend that is not on localhost.
 *
 * Every step is logged with its HTTP status. A step that fails is reported and
 * counted; the run exits 1 when any did, and keeps going so one refusal does
 * not leave the stand half empty.
 */
const BACKEND = (process.env.BACKEND_URL || "").replace(/\/$/, "")
const EMAIL = process.env.OWNER_EMAIL || "owner-cherkashino@example.test"
const PASSWORD = process.env.OWNER_PASSWORD
const RUN = Date.now().toString(36)

if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BACKEND)) {
  console.error("BACKEND_URL must be a localhost stand, e.g. http://localhost:9321")
  process.exit(2)
}
if (!PASSWORD) {
  console.error("OWNER_PASSWORD is required")
  process.exit(2)
}

let failures = 0
const call = async (method, path, { body, token, key } = {}) => {
  const headers = { "content-type": "application/json" }
  if (token) headers.authorization = `Bearer ${token}`
  if (key) headers["x-publishable-api-key"] = key
  const response = await fetch(BACKEND + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    data = { raw: text.slice(0, 200) }
  }
  const ok = response.status < 400
  if (!ok) {
    failures += 1
  }
  console.log(
    `${ok ? "ok  " : "FAIL"} ${response.status} ${method} ${path.split("?")[0]}` +
      (ok ? "" : `  ${JSON.stringify(data).slice(0, 240)}`)
  )
  return { ok, status: response.status, data }
}

const SHOPPERS = [
  { first: "Мария", last: "Кузнецова", city: "Казань", province: "Республика Татарстан", street: "ул. Баумана, 12, кв. 40", zip: "420111", phone: "+79170000101" },
  { first: "Алексей", last: "Смирнов", city: "Новосибирск", province: "Новосибирская область", street: "Красный проспект, 77, кв. 5", zip: "630099", phone: "+79130000102" },
  { first: "Екатерина", last: "Волкова", city: "Самара", province: "Самарская область", street: "ул. Ленинградская, 3", zip: "443010", phone: "+79270000103" },
  { first: "Дмитрий", last: "Соколов", city: "Екатеринбург", province: "Свердловская область", street: "ул. Малышева, 51, оф. 210", zip: "620075", phone: "+79220000104" },
  { first: "Анна-Виктория", last: "Константинопольская-Задунайская", city: "Петропавловск-Камчатский", province: "Камчатский край", street: "проспект 50 лет Октября, 15/2, корпус 3, квартира 118", zip: "683024", phone: "+79140000105" },
]

/** What the owner does with each order after it lands, in order of creation. */
const FATES = ["leave", "leave", "leave", "pack", "pack", "ship", "ship", "deliver", "cancel", "leave"]

const REVIEW_TEXTS = [
  { rating: 5, title: "Очень довольна", body: "Заказываю второй раз, пришло быстро, упаковано аккуратно. Спасибо!" },
  { rating: 4, body: "Хороший товар, но доставка шла дольше, чем обещали." },
  { rating: 2, title: "Помятая коробка", body: "Сам товар в порядке, а коробка приехала мятая. Хотелось бы упаковку получше." },
  { rating: 5, body: "Всё отлично." },
]

const main = async () => {
  const login = await call("POST", "/auth/tenant/emailpass", {
    body: { email: EMAIL, password: PASSWORD },
  })
  const owner = login.data.token
  if (!owner) {
    throw new Error("the owner could not log in; nothing was seeded")
  }

  const me = await call("GET", "/tenants/me", { token: owner })
  const key = me.data.tenant_admin?.tenant?.api_key?.token
  if (!key) {
    throw new Error("GET /tenants/me carries no publishable key for this shop")
  }

  // The seed ships 241 regions, one page of them never reaches Russia. The
  // shop sells in its own country, which is whatever COUNTRY says (default ru).
  const wanted = (process.env.COUNTRY || "ru").toLowerCase()
  const regions = await call("GET", "/store/regions?limit=300&fields=id,name,currency_code,*countries", { key })
  const region = (regions.data.regions ?? []).find((r) =>
    (r.countries ?? []).some((c) => c.iso_2 === wanted)
  )
  if (!region) {
    throw new Error(`the shop has no region that sells to "${wanted}"; a cart cannot be created`)
  }
  const country = wanted
  console.log(`region ${region.name} ${region.currency_code} ${country}`)

  const catalog = await call(
    "GET",
    `/store/products?limit=40&region_id=${region.id}&fields=id,title,*variants,*variants.calculated_price`,
    { key }
  )
  const sellable = (catalog.data.products ?? []).filter((p) =>
    (p.variants ?? []).some((v) => v.calculated_price?.calculated_amount > 0)
  )
  if (sellable.length === 0) {
    throw new Error("the storefront catalog has no product with a price")
  }
  console.log(`sellable products on the storefront: ${sellable.length}`)

  const placed = []
  let n = 0
  for (const shopper of SHOPPERS) {
    const email = `shopper-${RUN}-${n}@example.test`
    const reg = await call("POST", "/auth/customer/emailpass/register", {
      body: { email, password: PASSWORD },
    })
    let customerToken = reg.data.token
    await call("POST", "/store/customers", {
      token: customerToken,
      key,
      body: { email, first_name: shopper.first, last_name: shopper.last, phone: shopper.phone },
    })
    // The registration token names no customer yet; a fresh login does.
    const relogin = await call("POST", "/auth/customer/emailpass", {
      body: { email, password: PASSWORD },
    })
    customerToken = relogin.data.token ?? customerToken

    for (let k = 0; k < 2; k += 1, n += 1) {
      const product = sellable[n % sellable.length]
      const variant = product.variants.find(
        (v) => v.calculated_price?.calculated_amount > 0
      )
      const cart = await call("POST", "/store/carts", {
        key,
        token: customerToken,
        body: { region_id: region.id },
      })
      const cartId = cart.data.cart?.id
      if (!cartId) continue
      await call("POST", `/store/carts/${cartId}/line-items`, {
        key,
        token: customerToken,
        body: { variant_id: variant.id, quantity: 1 + (n % 3) },
      })
      const address = {
        first_name: shopper.first,
        last_name: shopper.last,
        address_1: shopper.street,
        city: shopper.city,
        province: shopper.province,
        country_code: country,
        postal_code: shopper.zip,
        phone: shopper.phone,
      }
      await call("POST", `/store/carts/${cartId}`, {
        key,
        token: customerToken,
        body: { email, shipping_address: address, billing_address: address },
      })
      const options = await call("GET", `/store/shipping-options?cart_id=${cartId}`, {
        key,
        token: customerToken,
      })
      const option = options.data.shipping_options?.[n % Math.max(1, options.data.shipping_options?.length ?? 1)]
      if (option) {
        await call("POST", `/store/carts/${cartId}/shipping-methods`, {
          key,
          token: customerToken,
          body: { option_id: option.id },
        })
      }
      const collection = await call("POST", "/store/payment-collections", {
        key,
        token: customerToken,
        body: { cart_id: cartId },
      })
      const collectionId = collection.data.payment_collection?.id
      if (collectionId) {
        await call("POST", `/store/payment-collections/${collectionId}/payment-sessions`, {
          key,
          token: customerToken,
          body: { provider_id: "pp_system_default" },
        })
      }
      const done = await call("POST", `/store/carts/${cartId}/complete`, {
        key,
        token: customerToken,
      })
      if (done.data.type === "order") {
        placed.push({ id: done.data.order.id, productId: product.id, customerToken, shopper })
      } else if (done.ok) {
        // A 200 that is not an order: the cart came back with a payment error.
        failures += 1
        console.log(`FAIL the cart did not complete into an order: ${JSON.stringify(done.data).slice(0, 240)}`)
      }
    }
  }
  console.log(`orders placed through the storefront: ${placed.length}`)

  // The order.placed subscriber links an order to the shop asynchronously.
  for (let tries = 0; tries < 20; tries += 1) {
    const seen = await call("GET", "/tenants/orders?limit=50&fields=id", { token: owner })
    if ((seen.data.orders ?? []).length >= placed.length) break
    await new Promise((r) => setTimeout(r, 500))
  }

  for (const [i, order] of placed.entries()) {
    const fate = FATES[i % FATES.length]
    if (fate === "leave") continue
    if (fate === "cancel") {
      await call("POST", `/tenants/orders/${order.id}/cancel`, { token: owner })
      continue
    }
    const detail = await call(
      "GET",
      `/tenants/orders/${order.id}?fields=id,*items,*payment_collections.payments`,
      { token: owner }
    )
    const items = (detail.data.order?.items ?? []).map((it) => ({ id: it.id, quantity: it.quantity }))
    const payment = detail.data.order?.payment_collections?.[0]?.payments?.[0]
    if (payment?.id) {
      await call("POST", `/tenants/payments/${payment.id}/capture`, { token: owner })
    }
    const packed = await call("POST", `/tenants/orders/${order.id}/fulfillments`, {
      token: owner,
      body: { items },
    })
    if (fate === "pack" || !packed.ok) continue
    // The answer to the packing call carries no fulfillments (measured on the
    // stand), so the order is read again. A packed order without one is a
    // failure, never a reason to skip quietly: the first version of this script
    // skipped here and reported a clean run with no order ever shipped.
    const after = await call("GET", `/tenants/orders/${order.id}?fields=id,*fulfillments`, { token: owner })
    const fulfillment = (after.data.order?.fulfillments ?? []).find((f) => !f.shipped_at && !f.canceled_at)
    if (!fulfillment) {
      failures += 1
      console.log(`FAIL order ${order.id} was packed but shows no open fulfillment; it cannot be shipped`)
      continue
    }
    await call("POST", `/tenants/orders/${order.id}/fulfillments/${fulfillment.id}/shipments`, {
      token: owner,
      body: { items, labels: [{ tracking_number: `8004${1000 + i}`, tracking_url: "#", label_url: "#" }] },
    })
    if (fate === "deliver") {
      await call("POST", `/tenants/orders/${order.id}/fulfillments/${fulfillment.id}/mark-as-delivered`, {
        token: owner,
      })
    }
  }

  // Reviews come from customers who bought the product; they arrive unmoderated.
  for (const [i, review] of REVIEW_TEXTS.entries()) {
    const order = placed[i * 2]
    if (!order) continue
    await call("POST", "/store/tenant/reviews", {
      key,
      token: order.customerToken,
      body: {
        product_id: order.productId,
        rating: review.rating,
        ...(review.title ? { title: review.title } : {}),
        body: review.body,
        author_name: order.shopper.first,
      },
    })
  }

  console.log(`\n${failures === 0 ? "seeded, no failed step" : `seeded with ${failures} FAILED step(s)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`)
  process.exit(1)
})
