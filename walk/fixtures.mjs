// The upready-store part of devops' ui-walk runner (t-2026-10-03-01): fixtures for the scenario graph
// of the cherkashino.com purchase (pilot-tree-cherkashino-purchase.json). The runner calls
// reset(), seed(path), login(actor) and api(step); the values of seed() fill the graph's {fx.*}
// and `stand` fills {stand.*}.
//
// Plain Node 20+, no dependencies. No secret lives in this file: JWT_SECRET and DATABASE_URL are
// read from the stand's backend env file at run time and never printed. Ids are looked up by the
// shop handle. Nothing here starts, stops or migrates the stand, and reset() never touches the DB.
import crypto from "node:crypto"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const env = process.env

/**
 * Live mode runs the same graph against https://cherkashino.com: no database and no JWT secret.
 * The owner's session token comes from a file the lead gives (WALK_OWNER_TOKEN_FILE), never minted
 * here; the buyer registers with a disposable mail.tm inbox; the shop's card and manager contact
 * come from the public GET /storefront/by-host. On by WALK_MODE=live or an https storefront.
 */
export const LIVE = (env.WALK_MODE ?? (/^https:/.test(env.WALK_STOREFRONT ?? "") ? "live" : "stand")) === "live"

/** Where the stand is. Every value can be overridden by the environment. Live has no default panel URL. */
export const stand = LIVE
  ? {
      storefront: env.WALK_STOREFRONT ?? "https://cherkashino.com",
      backend: env.WALK_BACKEND ?? "https://shipshift.dev",
      panel: env.WALK_PANEL,
    }
  : {
      storefront: env.WALK_STOREFRONT ?? "http://cherkashino-com.localhost:8700",
      backend: env.WALK_BACKEND ?? "http://localhost:9700",
      panel: env.WALK_PANEL ?? "http://localhost:5700",
    }

const SHOP_HANDLE = env.WALK_SHOP ?? "cherkashino-com"
const STAND_ENV = env.WALK_STAND_ENV ?? "/Users/ivanprotsko/upready/worktrees/upready-store/stand/ivan-1001/apps/backend/.env"
const PSQL = env.WALK_PSQL ?? (fs.existsSync("/opt/homebrew/opt/postgresql@16/bin/psql") ? "/opt/homebrew/opt/postgresql@16/bin/psql" : "psql")
const TMP = env.WALK_TMP ?? path.join(os.tmpdir(), "upready-walk")

const PRODUCTS = {
  course: { handle: "course-ochishchenie-pecheni-cherkashino", title: "Очищение печени — Полный курс" },
  goods: { handle: "nabor-dlya-ochischeniya-limfy-cherkashino", title: "Набор для очищения лимфы" },
}
const ADDRESS = { line1: "ул. Тверская, д. 1, кв. 1", postalCode: "125009", city: "Москва", province: "Москва" }

// ───────── stand secrets and the database, read at run time ─────────

let standEnvCache = null
function standEnv() {
  if (standEnvCache) return standEnvCache
  const text = fs.readFileSync(STAND_ENV, "utf8")
  standEnvCache = Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")])
  )
  return standEnvCache
}

function dbUrl() {
  const url = env.WALK_DB_URL ?? standEnv().DATABASE_URL
  if (!url) throw new Error(`no database: set WALK_DB_URL or DATABASE_URL in ${STAND_ENV}`)
  return url
}

/** One query, rows as arrays of strings. Every value put into SQL is checked against a strict pattern first. */
function sql(query) {
  // Up to three tries: under load the stand's Postgres sometimes refuses one connection.
  for (let attempt = 1; ; attempt++) {
    try {
      const out = execFileSync(PSQL, [dbUrl(), "-At", "-F", "\t", "-c", query], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      return out.split("\n").filter(Boolean).map((line) => line.split("\t"))
    } catch (err) {
      if (attempt >= 3) throw err
      execFileSync("sleep", [String(attempt)])
    }
  }
}
const safe = (value, pattern, what) => {
  if (!pattern.test(String(value))) throw new Error(`refusing to put ${what} into SQL: ${value}`)
  return String(value)
}
const HANDLE = /^[a-z0-9-]+$/
const ORDER_ID = /^order_[A-Z0-9]+$/

// ───────── owner session: a JWT for the shop's admin, the way the panel's own login ends ─────────

const b64url = (input) => Buffer.from(input).toString("base64url")
function signJwt(payload, secret, ttlSeconds = 3600) {
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }))
  const sig = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")
  return `${head}.${body}.${sig}`
}

let ownerIdsCache = null
/**
 * An admin of the shop and the auth identity it signs in with, by the shop handle. One person may
 * administer several shops with one identity, and that identity's app_metadata then points at an
 * admin row of another shop, so the link is the admin's e-mail as the emailpass provider identity.
 * The first admin by creation wins; WALK_OWNER_ADMIN picks another one.
 */
export function ownerIds() {
  if (ownerIdsCache) return ownerIdsCache
  const handle = safe(SHOP_HANDLE, HANDLE, "shop handle")
  const pick = env.WALK_OWNER_ADMIN ? `and ta.id = '${safe(env.WALK_OWNER_ADMIN, /^tenadm_[A-Z0-9]+$/, "admin id")}'` : ""
  const rows = sql(`
    select ta.id, pi.auth_identity_id
    from tenant t
    join tenant_admin ta on ta.tenant_id = t.id and ta.deleted_at is null
    join provider_identity pi on pi.provider = 'emailpass' and lower(pi.entity_id) = lower(ta.email) and pi.deleted_at is null
    where t.handle = '${handle}' and t.deleted_at is null ${pick}
    order by ta.created_at
    limit 1`)
  if (!rows.length) throw new Error(`no admin with an emailpass identity for shop ${SHOP_HANDLE}`)
  ownerIdsCache = { adminId: rows[0][0], authIdentityId: rows[0][1] }
  return ownerIdsCache
}

/**
 * A bearer token the backend accepts as the shop admin (actor_type "tenant"). Never printed.
 * Live: read from the lead's token file, never minted.
 */
export function ownerToken() {
  if (LIVE) {
    const file = env.WALK_OWNER_TOKEN_FILE
    if (!file) throw new Error("live: set WALK_OWNER_TOKEN_FILE to the owner token file the lead gives")
    const token = fs.readFileSync(file, "utf8").trim()
    if (!token) throw new Error(`live: the owner token file is empty`)
    return token
  }
  const secret = standEnv().JWT_SECRET
  if (!secret) throw new Error(`JWT_SECRET is not set in ${STAND_ENV}`)
  const { adminId, authIdentityId } = ownerIds()
  return signJwt(
    { actor_id: adminId, actor_type: "tenant", auth_identity_id: authIdentityId, auth_provider: "emailpass", app_metadata: { tenant_id: adminId }, user_metadata: {} },
    secret
  )
}

// ───────── shop data the graph shows: lessons, the shop's card, the manager contact ─────────

function shopData() {
  const course = safe(PRODUCTS.course.handle, HANDLE, "product handle")
  const goods = safe(PRODUCTS.goods.handle, HANDLE, "product handle")
  const found = new Set(sql(`select handle from product where handle in ('${course}', '${goods}') and deleted_at is null`).map((r) => r[0]))
  for (const handle of [course, goods]) if (!found.has(handle)) throw new Error(`product ${handle} is not on the stand`)

  const lesson = sql(`
    select l.id from product p
    join course c on c.product_id = p.id and c.deleted_at is null
    join lesson l on l.course_id = c.id and l.deleted_at is null
    where p.handle = '${course}' and p.deleted_at is null
    order by l."order" limit 1`)

  const handle = safe(SHOP_HANDLE, HANDLE, "shop handle")
  const manual = sql(`select coalesce(metadata->'manual_payment', 'null') from tenant where handle = '${handle}' and deleted_at is null`)
  const doc = manual.length ? JSON.parse(manual[0][0]) : null
  const card = doc?.manager?.cards?.[0] ?? null

  return shopFields(lesson[0]?.[0] ?? null, doc)
}

const shopFields = (lesson1, doc) => {
  const card = doc?.manager?.cards?.[0] ?? null
  return {
    lesson1,
    card: card ? { bank: card.bank, number: card.number, holder: card.holder ?? null } : null,
    telegram: doc?.manager?.telegram ?? null,
    manualKinds: { card: Boolean(doc?.manager?.enabled && doc?.manager?.cards?.length), crypto: Boolean(doc?.crypto?.enabled) },
  }
}

/** Live: the same fields from the public by-host answer; the first lesson only from WALK_LESSON1. */
async function shopDataLive() {
  return shopFields(env.WALK_LESSON1 ?? null, (await byHost()).manual_payment ?? null)
}

// ───────── receipt files, written at run time ─────────

// A 1×1 PNG: a real image the backend's type check accepts.
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")

function receiptFiles() {
  fs.mkdirSync(TMP, { recursive: true })
  const ok = path.join(TMP, "receipt-ok.png")
  const tooLarge = path.join(TMP, "receipt-11mb.jpg")
  const wrongType = path.join(TMP, "receipt.txt")
  if (!fs.existsSync(ok)) fs.writeFileSync(ok, PNG_1PX)
  if (!fs.existsSync(tooLarge) || fs.statSync(tooLarge).size !== 11 * 1024 * 1024) {
    // JPEG start and end markers around zeros: 11 MB, over the 10 MB limit the form and the backend both check.
    const buf = Buffer.alloc(11 * 1024 * 1024)
    buf.set([0xff, 0xd8, 0xff, 0xe0], 0)
    buf.set([0xff, 0xd9], buf.length - 2)
    fs.writeFileSync(tooLarge, buf)
  }
  if (!fs.existsSync(wrongType)) fs.writeFileSync(wrongType, "not a receipt\n")
  return { ok, tooLarge, wrongType }
}

// ───────── buyer accounts through the same Store API calls the storefront's signup makes ─────────

let byHostCache = null
async function byHost() {
  if (byHostCache) return byHostCache
  const host = new URL(stand.storefront).host
  const res = await fetch(`${stand.backend}/storefront/by-host?host=${encodeURIComponent(host)}`)
  if (!res.ok) throw new Error(`by-host ${host}: ${res.status}`)
  byHostCache = (await res.json()) ?? {}
  return byHostCache
}
async function publishableKey() {
  const key = (await byHost()).publishable_key
  if (!key) throw new Error(`by-host ${new URL(stand.storefront).host}: no publishable key`)
  return key
}

// ───────── live: a disposable mail.tm inbox per buyer, so the shop's e-mails can be read ─────────

const mailTm = async (urlPath, { method = "GET", body, token } = {}) => {
  const res = await fetch(`https://api.mail.tm${urlPath}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`mail.tm ${method} ${urlPath}: ${res.status}`)
  return json
}
/** A new mail.tm address and its password; the inbox is read with mailTm('/messages', { token }). */
async function mailTmInbox(prefix) {
  const domain = (await mailTm("/domains"))?.["hydra:member"]?.[0]?.domain
  if (!domain) throw new Error("mail.tm: no domain")
  const address = `${prefix}${Date.now().toString(36)}${crypto.randomInt(100, 999)}@${domain}`
  const password = `Mt-${crypto.randomBytes(9).toString("base64url")}`
  await mailTm("/accounts", { method: "POST", body: { address, password } })
  return { address, password }
}

async function storeFetch(urlPath, { method = "GET", body, token } = {}) {
  const headers = { "content-type": "application/json", "x-publishable-api-key": await publishableKey() }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetch(`${stand.backend}${urlPath}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  return { ok: res.ok, status: res.status, json }
}

/** A customer token for the buyer, registering the account first when it does not exist. */
async function buyerToken(buyer) {
  const login = await storeFetch("/auth/customer/emailpass", { method: "POST", body: { email: buyer.email, password: buyer.password } })
  if (login.ok && login.json?.token) return login.json.token
  const reg = await storeFetch("/auth/customer/emailpass/register", { method: "POST", body: { email: buyer.email, password: buyer.password } })
  if (!reg.ok || !reg.json?.token) throw new Error(`buyer register: ${reg.status}`)
  const created = await storeFetch("/store/customers", {
    method: "POST",
    token: reg.json.token,
    body: { email: buyer.email, first_name: buyer.firstName, last_name: buyer.lastName, phone: buyer.phone, metadata: { locale: "ru", walk: true } },
  })
  if (!created.ok) throw new Error(`buyer create: ${created.status}`)
  const again = await storeFetch("/auth/customer/emailpass", { method: "POST", body: { email: buyer.email, password: buyer.password } })
  if (!again.ok || !again.json?.token) throw new Error(`buyer login after register: ${again.status}`)
  return again.json.token
}

// Edges of the pilot graph that sign in with {fx.buyer.email}, so the account must exist before the path runs.
const SIGN_IN_BRANCHES = new Set(["login-ok", "wrong-password", "retry"])
function pathSignsIn(walkPath) {
  const edges = Array.isArray(walkPath) ? walkPath : walkPath?.edges
  if (!Array.isArray(edges)) return true // unknown shape: prepare the account rather than fail the path
  return edges.some((e) => typeof e !== "object" || (SIGN_IN_BRANCHES.has(e.branch) && String(e.from).includes("login")))
}
const pathRegisters = (walkPath) => {
  const edges = Array.isArray(walkPath) ? walkPath : walkPath?.edges
  return !Array.isArray(edges) || edges.some((e) => typeof e !== "object" || e.branch === "register-ok")
}

// ═════════ the hooks ═════════

/**
 * A fresh browser state: no cart cookie, buyer signed out. The runner already opens a new context
 * per path; given that context, this also clears its cookies. It never writes to the database.
 */
export async function reset({ context } = {}) {
  if (context) await context.clearCookies()
}

/**
 * The fixtures of one path, the graph's {fx.*}. A unique buyer per call, so paths never share a
 * cart, an account or an order. When the path signs in with {fx.buyer.email}, that account is
 * created first through the Store API; the registration edges use {fx.buyer.newEmail} instead.
 */
export async function seed(walkPath) {
  const ts = `${Date.now()}${crypto.randomInt(100, 999)}`
  const shop = LIVE ? await shopDataLive() : shopData()
  // Live: real inboxes on mail.tm (the access e-mail and the shop's letters can be read there);
  // the second one is made only for a path that registers with {fx.buyer.newEmail}.
  const inbox = LIVE ? await mailTmInbox("cherkwalk") : null
  const newInbox = LIVE && pathRegisters(walkPath) ? await mailTmInbox("cherkwalknew") : null
  const buyer = {
    email: inbox?.address ?? `demo.buyer+${ts}@example.com`,
    newEmail: newInbox?.address ?? (LIVE ? null : `demo.buyer+${ts}-new@example.com`),
    ...(inbox ? { mailbox: { address: inbox.address, password: inbox.password } } : {}),
    password: `Walk-${ts}-pass`,
    wrongPassword: `Wrong-${ts}-pass`,
    firstName: "Анна",
    lastName: "Иванова",
    phone: "+79000000000",
  }
  if (pathSignsIn(walkPath)) await buyerToken(buyer)
  return {
    course: { ...PRODUCTS.course, lesson1: shop.lesson1 },
    goods: { ...PRODUCTS.goods },
    buyer,
    address: { ...ADDRESS },
    receipt: receiptFiles(),
    card: shop.card,
    manager: { telegram: shop.telegram },
    rejectReason: "На чеке другая сумма",
    shop: { handle: SHOP_HANDLE, manualKinds: shop.manualKinds },
  }
}

/**
 * Sign an actor in.
 * - owner: a second browser context with a panel session (a JWT for the shop admin traded for the
 *   backend's session cookie at POST /auth/session). Needs `browser`. Returns { context, page }.
 * - buyer: the given context gets the storefront's `_medusa_jwt` cookie for fx.buyer, registering the
 *   account first when needed. Needs `context` and `fx`. Returns { context }.
 */
export async function login(actor, { browser, context, fx, contextOptions } = {}) {
  if (actor === "owner") {
    if (!browser) throw new Error("login(owner) needs { browser }")
    const ctx = await browser.newContext(contextOptions ?? { viewport: { width: 1440, height: 900 } })
    const res = await ctx.request.post(`${stand.backend}/auth/session`, { headers: { authorization: `Bearer ${ownerToken()}` } })
    if (!res.ok()) {
      await ctx.close()
      throw new Error(`owner session: ${res.status()}`)
    }
    const page = await ctx.newPage()
    return { context: ctx, page }
  }
  if (actor === "buyer") {
    if (!context || !fx?.buyer) throw new Error("login(buyer) needs { context, fx }")
    const token = await buyerToken(fx.buyer)
    await context.addCookies([{ name: "_medusa_jwt", value: token, url: stand.storefront, httpOnly: true, sameSite: "Lax" }])
    return { context }
  }
  throw new Error(`login: unknown actor ${actor}`)
}

/** The payment of an order, for {run.paymentId}. Live: through the owner's API, no database. */
export async function paymentIdOf(orderId) {
  const id = safe(orderId, ORDER_ID, "order id")
  if (LIVE) {
    const res = await fetch(`${stand.backend}/tenants/orders/${id}?fields=id,*payment_collections,*payment_collections.payments`, {
      headers: { authorization: `Bearer ${ownerToken()}` },
    })
    if (!res.ok) throw new Error(`live: payment of ${id}: ${res.status}`)
    const order = (await res.json())?.order
    const payment = (order?.payment_collections ?? []).flatMap((pc) => pc.payments ?? []).at(-1)
    if (!payment?.id) throw new Error(`live: no payment for ${id}`)
    return payment.id
  }
  const rows = sql(`
    select p.id from payment p
    join payment_collection pc on pc.id = p.payment_collection_id
    join order_payment_collection opc on opc.payment_collection_id = pc.id
    where opc.order_id = '${id}' and p.deleted_at is null
    order by p.created_at desc limit 1`)
  if (!rows.length) throw new Error(`no payment for ${id}`)
  return rows[0][0]
}

const fill = (template, values) =>
  template.replace(/\{([a-z]+)\.([A-Za-z0-9_.]+)\}/g, (whole, root, key) => {
    const value = key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), values[root])
    return value == null ? whole : String(value)
  })

/**
 * The graph's `api` steps.
 * - POST …/tenants/payments/{run.paymentId}/capture as the owner: what «Подтвердить оплату» calls.
 *   {run.paymentId} is looked up from {run.orderId} when the runner has not captured it; the value
 *   is written back into `run`.
 * - STUB: not supported. The receipt upload goes from the browser to a Next server action and from
 *   there to the backend, so a browser-side stub cannot make the backend fail; the step throws with
 *   that reason and the path stays unreached until the stand has a fault switch.
 * Returns { status, body }.
 */
export async function api(step, { run = {}, fx = {} } = {}) {
  if (step.method === "STUB") {
    throw new Error("unsupported: the receipt upload runs in a Next server action, so a browser stub cannot fail it; needs a backend fault switch")
  }
  // The runner fills {run.*} itself and stops on a missing value, so the graph names the order instead:
  // `url: …/tenants/payments/:paymentOfOrder/capture` with `order: "<order id>"`.
  if (step.url.includes(":paymentOfOrder")) {
    if (!step.order || !ORDER_ID.test(step.order)) throw new Error("api: :paymentOfOrder needs step.order with an order id")
    run.paymentId = await paymentIdOf(step.order)
    step = { ...step, url: step.url.replace(":paymentOfOrder", run.paymentId) }
  }
  if (step.url.includes("{run.paymentId}") && !run.paymentId) {
    if (!run.orderId) throw new Error("api: {run.paymentId} needs run.orderId")
    run.paymentId = await paymentIdOf(run.orderId)
  }
  const url = fill(step.url, { stand, run, fx })
  if (/\{[a-z]+\./.test(url)) throw new Error(`api: unresolved placeholder in ${step.url}`)
  if (step.as !== "owner") throw new Error(`api: only "as": "owner" is supported, got ${step.as}`)
  const res = await fetch(url, {
    method: step.method,
    headers: { "content-type": "application/json", authorization: `Bearer ${ownerToken()}` },
    body: step.method === "GET" ? undefined : JSON.stringify(step.body ?? {}),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`api ${step.method} ${url.replace(/^https?:\/\/[^/]+/, "")}: ${res.status} ${text.slice(0, 200)}`)
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: res.status, body }
}
