#!/usr/bin/env node
// order-smoke.mjs — the order matrix of rule 5ze (t-2026-10-04-23), through the Store API of one
// instance. Runs next to ru-smoke.sh after every deploy that touches cart, shipping, payment or
// checkout, and before a shop is shown or handed over:
//
//   node deploy/scripts/order-smoke.mjs --stand --dry-run          # local stand, no orders placed
//   node deploy/scripts/order-smoke.mjs --stand                    # local stand, orders placed and cancelled
//   node deploy/scripts/order-smoke.mjs --api https://api.cherkashino.ru --host cherkashino.ru
//
// There is no default live target: a live run names its --api and --host on purpose.
//
// For each cart shape it builds the cart the way the storefront does (rule 5ze item 1), takes it
// to the payment step with the manual method, checks the total (a cart that ships nothing has no
// shipping charge), places the order and checks it exists. Every cart carries
// metadata.order_smoke = true, which the order inherits, and every order placed is cancelled at
// the end through the admin API.
//
// Shapes: physical_only, course_only, mixed, physical_removed (physical item + shipping, then the
// physical item removed), quantity_change (quantity changed after shipping), region_change
// (region switched after shipping; SKIP when the instance has one region).
//
// Options:
//   --stand                     http://localhost:9700, host cherkashino-ru.localhost (ru-smoke.sh's stand)
//   --api URL --host HOST       the backend origin and the shop host its publishable key is read for
//   --publishable-key KEY       instead of /storefront/by-host
//   --country CC                the region the carts open in (default: the region holding ru, else the first)
//   --other-country CC          the region region_change switches to (default: de, else any other region)
//   --dry-run                   stop before placing an order; needs no admin token
//   --only a,b                  run only these shapes
//   --physical-variant ID / --course-variant ID / --shipping-option ID / --provider ID
// Env:
//   ORDER_SMOKE_ADMIN_TOKEN     admin JWT, or a secret API key (sk_…), to cancel the orders.
//                               Without it the script places no orders and exits 2.
//
// Prints one line per shape, «OK», «FAIL» or «SKIP», and exits 1 if any shape failed. Prints no
// secrets; the buyer is order-smoke+<time>@example.com with a test address.

export const SHAPES = [
  "physical_only",
  "course_only",
  "mixed",
  "physical_removed",
  "quantity_change",
  "region_change",
];

const DIGITAL_SHAPES = new Set(["course_only", "physical_removed"]);

export class UsageError extends Error {}

export function parseArgs(argv) {
  const opts = { dryRun: false, only: [...SHAPES] };
  const value = (i, name) => {
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) throw new UsageError(`${name} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--stand":
        opts.api ??= "http://localhost:9700";
        opts.host ??= "cherkashino-ru.localhost";
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--api":
        opts.api = value(i++, arg).replace(/\/$/, "");
        break;
      case "--host":
        opts.host = value(i++, arg);
        break;
      case "--publishable-key":
        opts.publishableKey = value(i++, arg);
        break;
      case "--only": {
        const only = value(i++, arg).split(",").map((s) => s.trim()).filter(Boolean);
        const unknown = only.filter((s) => !SHAPES.includes(s));
        if (unknown.length) throw new UsageError(`unknown shape(s): ${unknown.join(", ")}`);
        opts.only = only;
        break;
      }
      case "--physical-variant":
        opts.physicalVariant = value(i++, arg);
        break;
      case "--course-variant":
        opts.courseVariant = value(i++, arg);
        break;
      case "--shipping-option":
        opts.shippingOption = value(i++, arg);
        break;
      case "--provider":
        opts.provider = value(i++, arg);
        break;
      case "--country":
        opts.country = value(i++, arg).toLowerCase();
        break;
      case "--other-country":
        opts.otherCountry = value(i++, arg).toLowerCase();
        break;
      default:
        throw new UsageError(`unknown argument: ${arg}`);
    }
  }
  if (!opts.api) throw new UsageError("name the instance: --stand, or --api URL --host HOST");
  if (!opts.publishableKey && !opts.host) throw new UsageError("--host or --publishable-key is required");
  return opts;
}

// A course by the o24 marker, or a product with no shipping profile, whose lines Medusa marks
// requires_shipping = false (the stand's «Очищение печени» is the second kind). The missing
// profile counts only where the API shows profiles at all (`profilesKnown`).
export const isDigitalProduct = (product, profilesKnown = false) =>
  product?.metadata?.digital === "true" || (profilesKnown && !product?.shipping_profile);
const isDigitalOption = (option) => option?.metadata?.digital_delivery === "true";
const isPickupOption = (option) => option?.service_zone?.fulfillment_set?.type === "pickup";
const optionAmount = (option) => Number(option?.amount ?? option?.calculated_price?.calculated_amount ?? 0);

/** A courier option the script can attach with no extra data: not pickup, not digital, flat and paid first. */
export function chooseCourier(options, wanted) {
  if (wanted) return options.find((o) => o.id === wanted) ?? null;
  const couriers = options.filter((o) => !isPickupOption(o) && !isDigitalOption(o));
  return (
    couriers.find((o) => o.price_type === "flat" && optionAmount(o) > 0) ??
    couriers.find((o) => o.price_type === "flat") ??
    couriers[0] ??
    null
  );
}

export const chooseDigital = (options) => options.find(isDigitalOption) ?? null;

export function addressFor(countryCode) {
  const base = { first_name: "Order", last_name: "Smoke", phone: "+70000000000", country_code: countryCode };
  return countryCode === "ru"
    ? { ...base, address_1: "ул. Тестовая, д. 1", city: "Москва", postal_code: "101000", province: "г Москва" }
    : { ...base, address_1: "1 Test Street", city: "Test City", postal_code: "10115", province: "" };
}

/** The checkout's own blank address for a cart that ships nothing (checkout-digital.ts). */
export const blankAddressFor = (countryCode) => ({
  ...addressFor(countryCode),
  address_1: "",
  city: "",
  postal_code: "",
  province: "",
});

/** What is wrong with a cart's totals before it is placed; an empty list is a pass. */
export function checkTotals(cart, { digital }) {
  const problems = [];
  const n = (v) => Number(v ?? 0);
  const paid = (cart.shipping_methods ?? []).filter((m) => n(m.amount) > 0);
  if (digital) {
    if (n(cart.shipping_total) !== 0) problems.push(`shipping_total ${n(cart.shipping_total)} on a cart that ships nothing`);
    if (paid.length) problems.push(`paid shipping method(s) ${paid.map((m) => m.name ?? m.id).join(", ")} on a cart that ships nothing`);
  } else if (!(cart.shipping_methods ?? []).length) {
    problems.push("no shipping method on a cart that ships");
  }
  const expected = n(cart.item_total) + n(cart.shipping_total) - n(cart.discount_total);
  if (Math.abs(n(cart.total) - expected) > 0.01) {
    problems.push(`total ${n(cart.total)} ≠ items ${n(cart.item_total)} + shipping ${n(cart.shipping_total)} − discount ${n(cart.discount_total)}`);
  }
  return problems;
}

class ApiError extends Error {
  constructor(status, message) {
    super(`${status} ${message}`);
    this.status = status;
  }
}

function client(api, publishableKey, adminToken) {
  const call = async (method, path, { body, query, admin } = {}) => {
    const url = new URL(`${api}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    const headers = { "content-type": "application/json" };
    if (admin) {
      headers.authorization = adminToken.startsWith("sk_")
        ? `Basic ${Buffer.from(`${adminToken}:`).toString("base64")}`
        : `Bearer ${adminToken}`;
    } else if (publishableKey) {
      headers["x-publishable-api-key"] = publishableKey;
    }
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) };
    }
    if (!res.ok) throw new ApiError(res.status, `${method} ${path}: ${data.message ?? res.statusText}`);
    return data;
  };
  return {
    get: (path, query) => call("GET", path, { query }),
    post: (path, body, query) => call("POST", path, { body, query }),
    del: (path) => call("DELETE", path),
    admin: (path, body) => call("POST", path, { body, admin: true }),
  };
}

const CART_FIELDS =
  "id,currency_code,region_id,total,item_total,shipping_total,discount_total,metadata,*items,+items.requires_shipping,*shipping_methods";
const OPTION_FIELDS = "+metadata,+data,+provider_id,+service_zone.fulfillment_set.type";

async function loadCatalog(store, regionId, opts) {
  const { products } = await store.get("/store/products", {
    region_id: regionId,
    limit: "100",
    fields:
      "id,title,+metadata,*shipping_profile,*variants,*variants.calculated_price,+variants.inventory_quantity,+variants.manage_inventory",
  });
  const profilesKnown = (products ?? []).some((p) => p.shipping_profile);
  const priced = (v) => Number(v?.calculated_price?.calculated_amount ?? 0) > 0;
  const inStock = (v) => v.manage_inventory === false || Number(v.inventory_quantity ?? 0) > 1;
  const pick = (wantDigital, wantedId) => {
    for (const p of products ?? []) {
      for (const v of p.variants ?? []) {
        if (wantedId ? v.id === wantedId : isDigitalProduct(p, profilesKnown) === wantDigital && priced(v) && (wantDigital || inStock(v))) {
          return { variant_id: v.id, title: p.title };
        }
      }
    }
    return null;
  };
  return { physical: pick(false, opts.physicalVariant), course: pick(true, opts.courseVariant) };
}

async function runShape(shape, ctx) {
  const { store, region, otherRegion, catalog, opts } = ctx;
  const needsPhysical = shape !== "course_only";
  const needsCourse = ["course_only", "mixed", "physical_removed"].includes(shape);
  if (needsPhysical && !catalog.physical) return { status: "FAIL", note: "no priced physical product in stock" };
  if (needsCourse && !catalog.course) return { status: "FAIL", note: "no priced course (metadata.digital = true or no shipping profile)" };
  if (shape === "region_change" && !otherRegion) return { status: "SKIP", note: "the instance has one region" };

  const country = region.countries?.[0]?.iso_2;
  const items = [
    ...(needsPhysical ? [{ variant_id: catalog.physical.variant_id, quantity: 1 }] : []),
    ...(needsCourse ? [{ variant_id: catalog.course.variant_id, quantity: 1 }] : []),
  ];
  let { cart } = await store.post("/store/carts", {
    region_id: region.id,
    email: `order-smoke+${Date.now()}@example.com`,
    metadata: { order_smoke: true, order_smoke_shape: shape },
    items,
  });
  const cartId = cart.id;
  const options = async () =>
    (await store.get("/store/shipping-options", { cart_id: cartId, fields: OPTION_FIELDS })).shipping_options ?? [];
  const attach = async (option) => store.post(`/store/carts/${cartId}/shipping-methods`, { option_id: option.id });
  const attachCourier = async () => {
    const courier = chooseCourier(await options(), opts.shippingOption);
    if (!courier) throw new Error("no courier shipping option for this cart");
    await attach(courier);
  };
  const attachDigitalIfNone = async () => {
    const { cart: now } = await store.get(`/store/carts/${cartId}`, { fields: CART_FIELDS });
    if ((now.shipping_methods ?? []).length) return;
    const digital = chooseDigital(await options());
    if (digital) await attach(digital);
  };

  if (shape === "course_only") {
    await store.post(`/store/carts/${cartId}`, { shipping_address: blankAddressFor(country), billing_address: blankAddressFor(country) });
    await attachDigitalIfNone();
  } else {
    await store.post(`/store/carts/${cartId}`, { shipping_address: addressFor(country), billing_address: addressFor(country) });
    await attachCourier();
  }

  if (shape === "physical_removed") {
    ({ cart } = await store.get(`/store/carts/${cartId}`, { fields: CART_FIELDS }));
    const line = cart.items.find((i) => i.variant_id === catalog.physical.variant_id);
    await store.del(`/store/carts/${cartId}/line-items/${line.id}`);
    // What the storefront does after the last physical line goes (t-2026-10-04-23).
    await store.post(`/store/carts/${cartId}/drop-shipping`, {});
    await attachDigitalIfNone();
  }

  if (shape === "quantity_change") {
    ({ cart } = await store.get(`/store/carts/${cartId}`, { fields: CART_FIELDS }));
    await store.post(`/store/carts/${cartId}/line-items/${cart.items[0].id}`, { quantity: 2 });
    ({ cart } = await store.get(`/store/carts/${cartId}`, { fields: CART_FIELDS }));
    if (!(cart.shipping_methods ?? []).length) await attachCourier();
  }

  if (shape === "region_change") {
    const otherCountry = otherRegion.countries?.[0]?.iso_2;
    await store.post(`/store/carts/${cartId}`, { region_id: otherRegion.id });
    await store.post(`/store/carts/${cartId}`, { shipping_address: addressFor(otherCountry), billing_address: addressFor(otherCountry) });
    ({ cart } = await store.get(`/store/carts/${cartId}`, { fields: CART_FIELDS }));
    if (!(cart.shipping_methods ?? []).length) await attachCourier();
  }

  ({ cart } = await store.get(`/store/carts/${cartId}`, { fields: CART_FIELDS }));
  const { payment_providers: providers } = await store.get("/store/payment-providers", { region_id: cart.region_id });
  const provider =
    opts.provider ??
    providers?.find((p) => p.id === "pp_system_default")?.id ??
    providers?.find((p) => /manual|system_default/i.test(p.id))?.id;
  const noProvider = `no manual payment provider (have: ${(providers ?? []).map((p) => p.id).join(", ") || "none"})`;
  if (!provider && !opts.dryRun) return { status: "FAIL", cartId, note: noProvider };
  if (provider) {
    const { payment_collection: collection } = await store.post("/store/payment-collections", { cart_id: cartId });
    await store.post(`/store/payment-collections/${collection.id}/payment-sessions`, { provider_id: provider });
  }

  ({ cart } = await store.get(`/store/carts/${cartId}`, { fields: CART_FIELDS }));
  if (shape === "region_change" && cart.region_id !== otherRegion.id) {
    return { status: "FAIL", cartId, note: `region did not switch (${cart.region_id})` };
  }
  const problems = checkTotals(cart, { digital: DIGITAL_SHAPES.has(shape) });
  if (problems.length) return { status: "FAIL", cartId, note: problems.join("; ") };
  const summary = `total ${cart.total} ${cart.currency_code} (shipping ${cart.shipping_total})`;
  if (opts.dryRun) {
    return { status: "OK", cartId, note: `${summary}; dry run, not placed${provider ? "" : `; ${noProvider}, a real run fails here`}` };
  }

  const placed = await store.post(`/store/carts/${cartId}/complete`, {});
  if (placed.type !== "order") {
    return { status: "FAIL", cartId, note: `not placed: ${placed.error?.message ?? placed.type}` };
  }
  const order = placed.order;
  const notes = [summary, `order ${order.id}`];
  if (Math.abs(Number(order.total) - Number(cart.total)) > 0.01) {
    return { status: "FAIL", cartId, orderId: order.id, note: `order total ${order.total} ≠ cart total ${cart.total}` };
  }
  if (order.metadata?.order_smoke !== true) notes.push("order metadata lacks order_smoke");
  return { status: "OK", cartId, orderId: order.id, note: notes.join("; ") };
}

/** The region the carts open in and the one region_change switches to, each with its country. */
export function chooseRegions(regions, { country, otherCountry } = {}) {
  const holding = (cc) => regions.find((r) => (r.countries ?? []).some((c) => c.iso_2 === cc)) ?? null;
  const withCountry = regions.filter((r) => r.countries?.length);
  const region = country ? holding(country) : holding("ru") ?? withCountry[0] ?? null;
  if (!region) return { region: null, otherRegion: null };
  const pick = (r, cc) => (r ? { ...r, countries: r.countries.filter((c) => !cc || c.iso_2 === cc) } : null);
  const regionCountry = country ?? (holding("ru") === region ? "ru" : region.countries[0].iso_2);
  const other = otherCountry
    ? holding(otherCountry)
    : [holding("de"), ...withCountry].find((r) => r && r.id !== region.id) ?? null;
  const otherRegion = other && other.id !== region.id ? pick(other, otherCountry ?? (other === holding("de") ? "de" : null)) : null;
  return { region: pick(region, regionCountry), otherRegion };
}

async function resolveKey(api, opts) {
  if (opts.publishableKey) return opts.publishableKey;
  const res = await fetch(`${api}/storefront/by-host?host=${encodeURIComponent(opts.host)}`);
  const data = await res.json().catch(() => ({}));
  if (!data.publishable_key) throw new Error(`no publishable key for host ${opts.host} (${res.status})`);
  return data.publishable_key;
}

export async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`order-smoke: ${error.message}`);
      return 2;
    }
    throw error;
  }
  const adminToken = process.env.ORDER_SMOKE_ADMIN_TOKEN ?? "";
  if (!opts.dryRun && !adminToken) {
    console.error("order-smoke: ORDER_SMOKE_ADMIN_TOKEN is not set, so the test orders could not be cancelled; nothing placed (use --dry-run to stop before placing)");
    return 2;
  }

  console.log(`order-smoke: api=${opts.api} host=${opts.host ?? "-"} dry-run=${opts.dryRun} shapes=${opts.only.join(",")}`);
  const store = client(opts.api, await resolveKey(opts.api, opts), adminToken);
  const { regions } = await store.get("/store/regions", { limit: "500", fields: "id,name,currency_code,*countries" });
  const { region, otherRegion } = chooseRegions(regions ?? [], opts);
  if (!region) {
    console.log(`FAIL  setup: no region for ${opts.country ?? "any country"}`);
    return 1;
  }
  console.log(`order-smoke: region ${region.name} (${region.currency_code}); region_change → ${otherRegion?.name ?? "none"}`);
  const catalog = await loadCatalog(store, region.id, opts);
  const ctx = { store, region, otherRegion, catalog, opts };

  let failed = false;
  const orders = [];
  for (const shape of opts.only) {
    let result;
    try {
      result = await runShape(shape, ctx);
    } catch (error) {
      result = { status: "FAIL", note: error.message };
    }
    if (result.orderId) orders.push(result.orderId);
    if (result.status === "FAIL") failed = true;
    console.log(`${result.status.padEnd(5)} ${shape}: ${result.note}${result.cartId ? ` [${result.cartId}]` : ""}`);
  }

  for (const id of orders) {
    try {
      await store.admin(`/admin/orders/${id}/cancel`, {});
      console.log(`OK    cancel ${id}`);
    } catch (error) {
      failed = true;
      console.log(`FAIL  cancel ${id}: ${error.message} — cancel it by hand`);
    }
  }

  console.log(failed ? "order-smoke: FAILED — report «не выкачено» (rule 5ze item 5)" : "order-smoke: all shapes passed");
  return failed ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`order-smoke: ${error.message}`);
      process.exit(1);
    },
  );
}
