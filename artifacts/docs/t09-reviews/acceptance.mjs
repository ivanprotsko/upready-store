#!/usr/bin/env node
/**
 * Acceptance of t09-reviews against a live stand (rule 18f): a customer leaves
 * a review on the storefront, the page does NOT show it, the shop owner
 * publishes it in the panel, and the page then shows it with the new average.
 *
 *   node artifacts/docs/t09-reviews/acceptance.mjs
 *
 * Environment (defaults are the stand this task was measured on):
 *   BACKEND_URL     http://localhost:9109
 *   STOREFRONT_URL  http://cherkashino.localhost:8043
 *   PANEL_URL       http://localhost:5209
 *   PRODUCT_HANDLE  naturalnyy-sorbent-ot-otravleniy-ot-temperatury-cherkashino
 *   PRODUCT_ID      prod_01M29Q5B9CYCJPW20X8TFMY3QR
 *   PUBLISHABLE_KEY the cherkashino key from GET /storefront/by-host
 *   OWNER_EMAIL / OWNER_PASSWORD  the tenant admin
 *   SHOTS           where the PNGs land
 *
 * Every check prints PASS or FAIL with the numbers it compared; exit code 0
 * means every check passed. The average is computed here from the ratings the
 * API returns and compared against the one the PAGE shows, so a rounding bug
 * on either side fails the run instead of hiding behind a screenshot.
 */
import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL("../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url)
    .pathname
const { chromium } = require(PLAYWRIGHT)

const BACKEND = process.env.BACKEND_URL || "http://localhost:9109"
const STOREFRONT = process.env.STOREFRONT_URL || "http://cherkashino.localhost:8043"
const PANEL = process.env.PANEL_URL || "http://localhost:5209"
const HANDLE =
  process.env.PRODUCT_HANDLE || "naturalnyy-sorbent-ot-otravleniy-ot-temperatury-cherkashino"
const PRODUCT_ID = process.env.PRODUCT_ID || "prod_01M29Q5B9CYCJPW20X8TFMY3QR"
const OWNER_EMAIL = process.env.OWNER_EMAIL || "owner-cherkashino@example.test"
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "supersecret1"
const SHOTS = process.env.SHOTS || new URL("./shots", import.meta.url).pathname

const BUYER_EMAIL = process.env.BUYER_EMAIL || "t09-buyer@example.test"
const BUYER_PASSWORD = process.env.BUYER_PASSWORD || "supersecret1"
const REVIEW_BODY =
  "Заказала после совета врача, пришло быстро, упаковка целая. Помогло, беру ещё. (t09 acceptance)"
const REVIEW_RATING = 4

fs.mkdirSync(SHOTS, { recursive: true })

let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures += 1
}

const shot = async (page, name) => {
  const file = path.join(SHOTS, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  console.log(`      shot → ${file}`)
  return file
}

const json = async (url, init) => {
  const res = await fetch(url, init)
  const text = await res.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: res.status, body }
}

const publishableKey = async () => {
  if (process.env.PUBLISHABLE_KEY) return process.env.PUBLISHABLE_KEY
  const host = new URL(STOREFRONT).hostname
  const { body } = await json(`${BACKEND}/storefront/by-host?host=${host}`)
  return body.publishable_key
}

/** The average of the ratings the API returns, rounded the way the page rounds. */
const handAverage = (ratings) =>
  ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null

/** The owner's bearer token, used for the reset below and nothing else. */
const ownerToken = async () => {
  const { body } = await json(`${BACKEND}/auth/tenant/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  })
  return body?.token
}

/**
 * Removes the review a previous run of THIS script left behind, through the
 * owner's own `DELETE /tenants/reviews/:id`. Without it a second run would
 * measure a shop that already holds the review it is about to leave, and
 * «count went up by one» would stop meaning anything.
 */
const resetPreviousRun = async () => {
  const token = await ownerToken()
  if (!token) throw new Error("could not authenticate the shop owner")
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" }
  const { body } = await json(
    `${BACKEND}/tenants/reviews?product_id=${PRODUCT_ID}&limit=200`,
    { headers }
  )
  const leftovers = (body?.reviews ?? []).filter((review) => review.body === REVIEW_BODY)
  for (const review of leftovers) {
    await json(`${BACKEND}/tenants/reviews/${review.id}`, { method: "DELETE", headers })
  }
  if (leftovers.length) {
    console.log(`      reset: removed ${leftovers.length} review(s) left by an earlier run`)
  }
}

const run = async () => {
  const key = await publishableKey()
  const storeHeaders = { "x-publishable-api-key": key, "content-type": "application/json" }

  await resetPreviousRun()

  // ---- 0. a customer of this shop
  const register = await json(`${BACKEND}/auth/customer/emailpass/register`, {
    method: "POST",
    headers: storeHeaders,
    body: JSON.stringify({ email: BUYER_EMAIL, password: BUYER_PASSWORD }),
  })
  let token = register.body?.token
  if (!token) {
    const login = await json(`${BACKEND}/auth/customer/emailpass`, {
      method: "POST",
      headers: storeHeaders,
      body: JSON.stringify({ email: BUYER_EMAIL, password: BUYER_PASSWORD }),
    })
    token = login.body?.token
  }
  if (!token) throw new Error(`could not authenticate the buyer: ${JSON.stringify(register.body)}`)

  const me = await json(`${BACKEND}/store/customers/me`, { headers: { ...storeHeaders, authorization: `Bearer ${token}` } })
  if (me.status === 404 || !me.body?.customer) {
    await json(`${BACKEND}/store/customers`, {
      method: "POST",
      headers: { ...storeHeaders, authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: BUYER_EMAIL, first_name: "Мария", last_name: "Тестова" }),
    })
  }

  // ---- 1. the shop BEFORE
  const before = await json(
    `${BACKEND}/store/tenant/reviews?product_id=${PRODUCT_ID}&limit=50`,
    { headers: { ...storeHeaders, "x-medusa-locale": "ru" } }
  )
  const beforeRatings = before.body.reviews.map((r) => r.rating)
  const beforeAverage = handAverage(beforeRatings)
  check(
    "before: API average equals the hand average",
    before.body.summary.average === beforeAverage,
    `API ${before.body.summary.average}, hand ${beforeAverage} over [${beforeRatings.join(", ")}]`
  )

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "ru-RU" })
  const page = await context.newPage()

  await page.goto(`${STOREFRONT}/ru/products/${HANDLE}`, { waitUntil: "networkidle" })
  await page.locator("#product-reviews").scrollIntoViewIfNeeded()
  const shownBefore = await page.locator('[data-testid="product-reviews-summary"]').innerText()
  check(
    "before: the page shows the same average",
    shownBefore.includes(String(beforeAverage)),
    `page «${shownBefore.replace(/\s+/g, " ")}», hand ${beforeAverage}`
  )
  await shot(page, "01-pdp-before")

  // ---- 2. the customer leaves a review
  await page.goto(`${STOREFRONT}/ru/account`, { waitUntil: "networkidle" })
  await page.locator('input[name="email"]').waitFor({ timeout: 30000 })
  await page.fill('input[name="email"]', BUYER_EMAIL)
  await page.fill('input[name="password"]', BUYER_PASSWORD)
  await page.locator('button[data-testid="sign-in-button"], form button[type="submit"]').first().click()
  // The sign-in form is gone only once the account dashboard has rendered;
  // `networkidle` alone can resolve while the POST is still in flight, and the
  // next page then loads for an anonymous visitor (no review form).
  await page.locator('input[name="password"]').waitFor({ state: "detached", timeout: 30000 })
  await page.waitForLoadState("networkidle")
  check("the customer is signed in on the storefront", !(await page.locator('input[name="password"]').count()))

  await page.goto(`${STOREFRONT}/ru/products/${HANDLE}`, { waitUntil: "networkidle" })
  await page.locator('[data-testid="review-form"]').waitFor({ timeout: 30000 })
  await page.locator('[data-testid="review-form"]').scrollIntoViewIfNeeded()
  await page.locator(`[data-testid="review-rating-${REVIEW_RATING}"]`).click()
  await page.fill('[data-testid="review-author-input"] input, input[data-testid="review-author-input"]', "Мария Тестова")
  await page.fill('[data-testid="review-body-input"] textarea, textarea[data-testid="review-body-input"]', REVIEW_BODY)
  await shot(page, "02-form-filled")
  await page.locator('[data-testid="review-submit"]').click()
  await page.locator('[data-testid="review-pending-notice"]').waitFor({ timeout: 15000 })
  check("the storefront confirms the review is waiting for moderation", true, await page.locator('[data-testid="review-pending-notice"]').innerText())
  await shot(page, "03-review-pending")

  // ---- 3. it is NOT on the page
  const afterSubmit = await json(
    `${BACKEND}/store/tenant/reviews?product_id=${PRODUCT_ID}&limit=50`,
    { headers: { ...storeHeaders, "x-medusa-locale": "ru" } }
  )
  check(
    "a pending review is invisible on the storefront",
    afterSubmit.body.count === before.body.count &&
      !afterSubmit.body.reviews.some((r) => r.body === REVIEW_BODY),
    `count ${before.body.count} → ${afterSubmit.body.count}`
  )

  const anon = await context.browser().newContext({ viewport: { width: 1280, height: 1000 }, locale: "ru-RU" })
  const anonPage = await anon.newPage()
  await anonPage.goto(`${STOREFRONT}/ru/products/${HANDLE}`, { waitUntil: "networkidle" })
  const anonText = await anonPage.locator("#product-reviews").innerText()
  check(
    "the new text is nowhere on the product page while it is pending",
    !anonText.includes("t09 acceptance"),
    `«${REVIEW_BODY.slice(0, 40)}…» not rendered`
  )
  await anonPage.locator("#product-reviews").scrollIntoViewIfNeeded()
  await shot(anonPage, "04-pdp-while-pending")

  // ---- 4. the owner publishes it in the panel
  const panelPage = await (await context.browser().newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await panelPage.goto(`${PANEL}/login`, { waitUntil: "networkidle" })
  await panelPage.fill('input[name="email"]', OWNER_EMAIL)
  await panelPage.fill('input[name="password"]', OWNER_PASSWORD)
  await panelPage.locator('button[type="submit"]').first().click()
  // The login is a POST plus a redirect the router performs itself, so
  // `networkidle` can resolve while the page is still /login. Waiting for the
  // URL to LEAVE /login is the event that actually says "logged in".
  await panelPage.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 })
  await panelPage.goto(`${PANEL}/reviews?status=pending`, { waitUntil: "networkidle" })
  await panelPage.getByRole("button", { name: "Опубликовать" }).first().waitFor({ timeout: 30000 })
  await shot(panelPage, "05-panel-pending")

  const pendingRow = panelPage.locator("tr", { hasText: "t09 acceptance" }).first()
  await pendingRow.waitFor({ timeout: 30000 })
  check(
    "the panel lists the pending review",
    (await pendingRow.innerText()).includes("На проверке"),
    (await pendingRow.innerText()).replace(/\s+/g, " ").slice(0, 120)
  )
  await pendingRow.scrollIntoViewIfNeeded()
  const publishButton = pendingRow.getByRole("button", { name: "Опубликовать" })
  await publishButton.click()
  await panelPage.waitForTimeout(2500)
  await shot(panelPage, "06-panel-published")

  // ---- 5. the shop AFTER
  // No revalidation is triggered from here on purpose: publishing a review in
  // the panel has to clear the storefront's cache by itself
  // (`POST /tenants/reviews/:id` → `notifyStorefrontRevalidate`). A run that
  // had to nudge the cache would prove the API and hide the product.
  await panelPage.waitForTimeout(1500)

  const after = await json(
    `${BACKEND}/store/tenant/reviews?product_id=${PRODUCT_ID}&limit=50`,
    { headers: { ...storeHeaders, "x-medusa-locale": "ru" } }
  )
  const afterRatings = after.body.reviews.map((r) => r.rating)
  const afterAverage = handAverage(afterRatings)
  check(
    "after: the review is published and counted once",
    after.body.count === before.body.count + 1,
    `count ${before.body.count} → ${after.body.count}`
  )
  check(
    "after: API average equals the hand average",
    after.body.summary.average === afterAverage,
    `API ${after.body.summary.average}, hand ${afterAverage} over [${afterRatings.join(", ")}]`
  )

  const fresh = await (await context.browser().newContext({ viewport: { width: 1280, height: 1000 }, locale: "ru-RU" })).newPage()
  await fresh.goto(`${STOREFRONT}/ru/products/${HANDLE}`, { waitUntil: "networkidle" })
  await fresh.locator("#product-reviews").scrollIntoViewIfNeeded()
  const shownAfter = await fresh.locator('[data-testid="product-reviews-summary"]').innerText()
  const freshText = await fresh.locator("#product-reviews").innerText()
  check(
    "after: the page shows the new average",
    shownAfter.includes(String(afterAverage)),
    `page «${shownAfter.replace(/\s+/g, " ")}», hand ${afterAverage}`
  )
  check("after: the customer's review is on the page", freshText.includes("t09 acceptance"))
  await shot(fresh, "07-pdp-after")

  await browser.close()

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nevery check passed")
  process.exit(failures ? 1 : 0)
}

run().catch((error) => {
  console.error(error)
  process.exit(2)
})
