#!/usr/bin/env node
/**
 * The owner adds a product on a phone, from the login form, photos first:
 * menu → «Товары» → «Добавить товар» → three photos → the name → the price →
 * «Опубликовать», all on the first step of the wizard. Then the product is read
 * back where a buyer's browser gets it: the public `GET /store/products` the
 * storefront draws its catalogue from — it must be there with three photos, a
 * main photo and the price she typed. A screenshot is saved per step.
 *
 *   PANEL_URL=http://localhost:5381 BACKEND_URL=http://localhost:9321 \
 *   OWNER_EMAIL=… OWNER_PASSWORD=… \
 *   SHOT_DIR=artifacts/docs/t-2026-09-21-02/flow-product WIDTH=390 \
 *     node apps/tenant-panel/e2e/owner-product-flow.e2e.mjs
 *
 * It writes to the stand (one new published product per run), so it is for a
 * scratch database only. Exit code 1 when a step cannot be done or the public
 * answer does not carry the product as she made it.
 */
import { createRequire } from "node:module"
import { mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL("../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url)
    .pathname
const { chromium } = require(PLAYWRIGHT)

const PANEL = (process.env.PANEL_URL || "http://localhost:5180").replace(/\/$/, "")
const BACKEND = (process.env.BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
const EMAIL = process.env.OWNER_EMAIL || "owner-cherkashino@example.test"
const PASSWORD = process.env.OWNER_PASSWORD
const WIDTH = Number(process.env.WIDTH || 390)
const SHOT_DIR = resolve(process.env.SHOT_DIR || "artifacts/docs/t-2026-09-21-02/flow-product")

if (!PASSWORD) {
  console.error("OWNER_PASSWORD is required (the stand's owner password)")
  process.exit(2)
}

mkdirSync(SHOT_DIR, { recursive: true })
const phone = WIDTH <= 480
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: WIDTH, height: phone ? 844 : 900 },
  deviceScaleFactor: phone ? 2 : 1,
  isMobile: phone,
  hasTouch: phone,
  locale: "ru-RU",
})
const page = await context.newPage()
let n = 0
const shot = async (name) => {
  n += 1
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.waitForTimeout(700)
  const path = join(SHOT_DIR, `${String(n).padStart(2, "0")}-${name}-${WIDTH}.png`)
  await page.screenshot({ path })
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth)
  console.log(`step ${n} ${name}: scrollWidth=${overflow} ${path}`)
}

/** Three photos of a jar, drawn here so the script carries no binary files. */
const drawPhotos = async () => {
  const dir = mkdtempSync(join(tmpdir(), "owner-product-flow-"))
  const easel = await context.newPage()
  const files = []
  for (const [index, colour] of ["#d9e8c4", "#f3dfb8", "#c9dbe8"].entries()) {
    await easel.setContent(
      `<body style="margin:0"><div style="width:600px;height:600px;background:${colour};display:flex;align-items:center;justify-content:center;font:48px sans-serif">Фото ${index + 1}</div></body>`
    )
    const file = join(dir, `photo-${index + 1}.png`)
    await easel.locator("div").screenshot({ path: file })
    files.push(file)
  }
  await easel.close()
  return files
}

const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "")
const TITLE = `Бальзам проверочный ${stamp}`
const PRICE = "450"

try {
  const photos = await drawPhotos()

  await page.goto(`${PANEL}/login`)
  await page.locator('input[name="email"]').fill(EMAIL)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await shot("login")
  await page.locator('button[type="submit"]').click()
  await page.waitForFunction(() => !location.pathname.endsWith("/login"), null, { timeout: 30_000 })
  await shot("overview")

  if (phone) {
    await page.getByRole("button", { name: "Открыть меню" }).click()
    await shot("menu")
  }
  await page.getByRole("link", { name: /^Товары/ }).first().click()
  await page.waitForURL(/\/products$/)
  await shot("products")

  await page.getByRole("link", { name: "Добавить товар" }).first().click()
  await page.waitForURL(/\/products\/create$/)
  await shot("new-product")

  // Photos first: the first thing on the screen is the place for them.
  await page.locator('input[type="file"]').first().setInputFiles(photos)
  await shot("three-photos")

  await page.locator('#general input[name="title"]').fill(TITLE)
  const price = page.getByTestId("product-create-quick-price")
  await price.scrollIntoViewIfNeeded()
  await price.fill(PRICE)
  await shot("name-and-price")

  await page.getByRole("button", { name: "Опубликовать" }).click()
  await page.waitForURL(/\/products$/, { timeout: 60_000 })
  await shot("published")

  // The buyer's side: the public catalogue answer the storefront is drawn from.
  const login = await fetch(`${BACKEND}/auth/tenant/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then((r) => r.json())
  const me = await fetch(`${BACKEND}/tenants/me`, {
    headers: { authorization: `Bearer ${login.token}` },
  }).then((r) => r.json())
  const headers = { "x-publishable-api-key": me?.tenant_admin?.tenant?.api_key?.token }
  // A shop seeded with every country has more regions than one page holds.
  const regions = await fetch(`${BACKEND}/store/regions?limit=500`, { headers }).then((r) =>
    r.json()
  )
  const region = regions.regions?.find((one) => one.currency_code === "rub") ?? regions.regions?.[0]
  const query = new URLSearchParams({
    q: TITLE,
    region_id: region?.id ?? "",
    fields: "title,thumbnail,*images,*variants.calculated_price",
  })
  const answer = await fetch(`${BACKEND}/store/products?${query}`, { headers })
  const found = (await answer.json()).products?.find((one) => one.title === TITLE)
  const amount = found?.variants?.[0]?.calculated_price?.calculated_amount
  const ok =
    !!found && found.images?.length === 3 && !!found.thumbnail && Number(amount) === Number(PRICE)
  console.log(
    `public GET /store/products: ${answer.status}, found: ${!!found}, photos: ${found?.images?.length}, ` +
      `main photo: ${!!found?.thumbnail}, price: ${amount} ${region?.currency_code}`
  )
  await browser.close()
  process.exit(ok ? 0 : 1)
} catch (error) {
  await shot("FAILED").catch(() => {})
  console.error(error.message.split("\n")[0])
  await browser.close()
  process.exit(1)
}
