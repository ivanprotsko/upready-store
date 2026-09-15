/**
 * Reads the delivery methods a real buyer is offered in one tenant's shop, the
 * way the checkout reads them: the shop's own publishable key from
 * `/storefront/by-host`, a real cart with a real line item, then
 * `GET /store/shipping-options?cart_id=…`.
 *
 *   node probe-shipping-options.mjs cherkashino.shipshift.dev
 *   BACKEND=https://shipshift.dev node probe-shipping-options.mjs zolotaya-nit-1057.shipshift.dev
 *
 * Prints one JSON document: the tenant, the cart, and every option with the
 * name, the price, and the description the checkout shows under the name.
 */
const backend = process.env.BACKEND ?? "https://shipshift.dev"
const host = process.argv[2]
if (!host) {
  console.error("usage: node probe-shipping-options.mjs <tenant host>")
  process.exit(2)
}

const get = async (path, headers = {}) => {
  const res = await fetch(`${backend}${path}`, { headers })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`GET ${path} -> ${res.status} ${text.slice(0, 300)}`)
  }
  return JSON.parse(text)
}

const post = async (path, body, headers = {}) => {
  const res = await fetch(`${backend}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`POST ${path} -> ${res.status} ${text.slice(0, 300)}`)
  }
  return JSON.parse(text)
}

const config = await get(`/storefront/by-host?host=${encodeURIComponent(host)}`)
const key = config.publishable_key
if (!key) {
  throw new Error(`${host} has no publishable key: ${JSON.stringify(config).slice(0, 300)}`)
}
const auth = { "x-publishable-api-key": key, "x-medusa-locale": process.env.LOCALE ?? "ru" }

// The store has one region per country (241 of them) and /store/regions pages
// at 50 by default, so ask for all of them and pick by the country the buyer
// ships to, not by whichever page the currency happens to land on.
const { regions } = await get("/store/regions?limit=250", auth)
const country = (process.env.COUNTRY ?? "ru").toLowerCase()
const region =
  regions.find((r) => (r.countries ?? []).some((c) => c.iso_2 === country)) ??
  regions.find((r) => r.currency_code === (process.env.CURRENCY ?? "rub")) ??
  regions[0]

// A variant without a price in this region is refused by the cart («do not
// have a price»), so pick the first one the region actually prices.
const { products } = await get(
  `/store/products?limit=20&region_id=${region.id}&fields=*variants.calculated_price`,
  auth,
)
let product = null
let variant = null
for (const candidate of products ?? []) {
  const priced = (candidate.variants ?? []).find((v) => v.calculated_price?.calculated_amount != null)
  if (priced) {
    product = candidate
    variant = priced
    break
  }
}
if (!variant) {
  throw new Error(`${host} has no priced variant in region ${region.id} to build a cart from`)
}

const { cart } = await post("/store/carts", { region_id: region.id }, auth)
await post(`/store/carts/${cart.id}/line-items`, { variant_id: variant.id, quantity: 1 }, auth)

const { shipping_options: options } = await get(`/store/shipping-options?cart_id=${cart.id}`, auth)

console.log(
  JSON.stringify(
    {
      host,
      tenant: { handle: config.handle ?? null, name: config.name ?? config.shop_name ?? null },
      region: { id: region.id, currency_code: region.currency_code },
      cart: { id: cart.id, product: product.title, variant: variant.id },
      shipping_options: options.map((option) => ({
        id: option.id,
        name: option.name,
        amount: option.amount,
        price_type: option.price_type,
        type: option.type ? { label: option.type.label, code: option.type.code, description: option.type.description } : null,
        data: option.data
          ? {
              description: option.data.description ?? null,
              delivery_hint: option.data.delivery_hint ?? null,
              tariff: option.data.tariff ?? null,
              tariff_source: option.data.tariff_source ?? null,
              sort_order: option.data.sort_order ?? null,
            }
          : null,
      })),
    },
    null,
    2,
  ),
)
