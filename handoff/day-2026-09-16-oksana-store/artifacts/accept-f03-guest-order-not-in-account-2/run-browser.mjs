const { chromium } = await import('playwright')
const ART = "/Users/ivanprotsko/upready/projects/upready-store/handoff/day-2026-09-16-oksana-store/artifacts/accept-f03-guest-order-not-in-account-2"
const BASE = "http://cherkashino.localhost:8087"
const OWNER = process.env.OWNER_EMAIL
const STRANGER = process.env.STRANGER_EMAIL
const PASS = "upready-acc2-2026"
const ORDER_ID = process.env.ORDER_ID

const browser = await chromium.launch()

async function register(page, email, first) {
  await page.goto(`${BASE}/ru/account`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector('[data-testid="login-page"], [data-testid="register-page"], [data-testid="orders-page-wrapper"]', { timeout: 60000 })
  await page.waitForTimeout(4000)
  for (let i = 0; i < 10; i++) {
    if (await page.locator('[data-testid="register-page"]').count()) break
    await page.locator('[data-testid="login-page"] [data-testid="register-button"]').click({ timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(1500)
  }
  await page.waitForSelector('[data-testid="register-page"]', { timeout: 30000 })
  await page.fill('[data-testid="first-name-input"]', first)
  await page.fill('[data-testid="last-name-input"]', "Приёмщик")
  await page.fill('[data-testid="email-input"]', email)
  await page.fill('[data-testid="phone-input"]', "+79990000002")
  await page.fill('[data-testid="password-input"]', PASS)
  await page.locator('[data-testid="register-page"] [data-testid="register-button"]').click()
  await page.waitForURL(/\/ru\/account(\/|$)/, { timeout: 60000 })
  await page.waitForTimeout(2500)
  console.log(`registered ${email}: url=${page.url()}`)
}

async function ordersReport(page, tag) {
  await page.goto(`${BASE}/ru/account/orders`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector('[data-testid="order-card"], [data-testid="no-orders-container"], [data-testid="claim-orders-block"]', { timeout: 60000 })
  await page.waitForTimeout(1500)
  const cards = await page.locator('[data-testid="order-card"]').count()
  console.log(`[${tag}] order cards: ${cards}`)
  if (cards) {
    const txt = (await page.locator('[data-testid="order-card"]').first().innerText()).replace(/\n+/g, " | ")
    console.log(`[${tag}] first card: ${txt}`)
  }
  const empty = await page.locator('[data-testid="no-orders-container"]').count()
  console.log(`[${tag}] empty block: ${empty}`)
  return cards
}

// ---- owner
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" })
const A = await ctxA.newPage()
A.on("console", m => { if (m.type() === "error") console.log("  [browser-error]", m.text().slice(0, 200)) })
await register(A, OWNER, "Иван")
const n = await ordersReport(A, "owner")
await A.screenshot({ path: `${ART}/01-account-orders-1280x900.png` })
console.log("SHOT 01")

if (ORDER_ID) {
  await A.goto(`${BASE}/ru/account/orders/details/${ORDER_ID}`, { waitUntil: "domcontentloaded" })
  await A.waitForTimeout(3000)
  const body = (await A.locator("body").innerText()).replace(/\n+/g, " | ")
  console.log("[owner] order detail status:", A.url())
  console.log("[owner] order detail text:", body.slice(0, 1200))
  await A.screenshot({ path: `${ART}/03-order-detail-1280x900.png`, fullPage: true })
  console.log("SHOT 03")
}

const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ru-RU",
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" })
const M = await ctxM.newPage()
await M.goto(`${BASE}/ru/account`, { waitUntil: "domcontentloaded" })
await M.waitForSelector('[data-testid="login-page"]', { timeout: 60000 })
await M.waitForTimeout(4000)
await M.fill('[data-testid="login-page"] [data-testid="email-input"]', OWNER)
await M.fill('[data-testid="login-page"] [data-testid="password-input"]', PASS)
await M.locator('[data-testid="sign-in-button"]').click()
await M.waitForTimeout(6000)
console.log("mobile login url:", M.url())
const nm = await ordersReport(M, "owner-mobile")
await M.screenshot({ path: `${ART}/02-account-orders-390x844.png` })
console.log("SHOT 02")

// ---- stranger
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ru-RU" })
const B = await ctxB.newPage()
await register(B, STRANGER, "Пётр")
const nb = await ordersReport(B, "stranger")
const claimBtn = B.locator('[data-testid="claim-orders-button"]')
if (await claimBtn.count()) {
  await claimBtn.click()
  await B.waitForTimeout(4000)
  const none = await B.locator('[data-testid="claim-orders-none"]').count()
  const claimed = await B.locator('[data-testid="claim-orders-claimed"]').count()
  const failed = await B.locator('[data-testid="claim-orders-failed"]').count()
  console.log(`[stranger] claim result: none=${none} claimed=${claimed} failed=${failed}`)
  if (none) console.log("[stranger] claim text:", await B.locator('[data-testid="claim-orders-none"]').innerText())
  if (claimed) console.log("[stranger] claim text:", await B.locator('[data-testid="claim-orders-claimed"]').innerText())
  console.log(`[stranger] order cards after claim: ${await B.locator('[data-testid="order-card"]').count()}`)
}
await B.screenshot({ path: `${ART}/04-stranger-account-orders-1280x900.png` })
console.log("SHOT 04")
if (ORDER_ID) {
  await B.goto(`${BASE}/ru/account/orders/details/${ORDER_ID}`, { waitUntil: "domcontentloaded" })
  await B.waitForTimeout(3000)
  console.log("[stranger] direct order URL →", B.url())
  console.log("[stranger] direct order text:", (await B.locator("body").innerText()).replace(/\n+/g," | ").slice(0, 400))
  await B.screenshot({ path: `${ART}/06-stranger-direct-order-url-1280x900.png` })
  console.log("SHOT 06")
}
await browser.close()
console.log(`SUMMARY owner=${n} ownerMobile=${nm} stranger=${nb}`)
