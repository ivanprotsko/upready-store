// t15-product-attributes, раунд 3: путь ВЛАДЕЛИЦЫ через клик, а не по прямому адресу.
//
// Товар → секция «Характеристики» → меню → «Заполнить» → ящик открылся (а не страница
// ошибки) → меняем объём → «Сохранить» → значение видно в секции товара и на карточке
// товара на витрине.
//
//   node artifacts/docs/t15-product-attributes/drawer-check.mjs
//
// Почему не Docker и почему скрипт лежит вне apps/**: memory/upready-store-playwright-native-chrome-2026-09-15.md
import { mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const OUT = dirname(fileURLToPath(import.meta.url))
const requireFromStorefront = createRequire(
  resolve(OUT, "../../../apps/storefront/package.json")
)
const { chromium } = requireFromStorefront("@playwright/test")

const PANEL = process.env.PANEL_URL ?? "http://localhost:5152"
const STORE = process.env.STORE_URL ?? "http://localhost:8152"
const EMAIL = process.env.PANEL_EMAIL ?? "admin@t15shop.test"
const PASSWORD = process.env.PANEL_PASSWORD ?? "supersecret"
const PRODUCT_HANDLE = "cube-1-t15shop"
const PRODUCT_TITLE = /Cube No\. 1/
/** Новое значение объёма: отличается от прежних 100, чтобы правка была видна. */
const NEW_VOLUME = process.env.NEW_VOLUME ?? "320"

mkdirSync(OUT, { recursive: true })

const main = async () => {
  const browser = await chromium.launch({ channel: "chrome" })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()

  const consoleErrors = []
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text().slice(0, 200))
    }
  })

  await page.goto(`${PANEL}/login`, { waitUntil: "networkidle" })
  await page.locator('input[autocomplete="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 })

  await page.goto(`${PANEL}/products`, { waitUntil: "networkidle" })
  await page.getByRole("link", { name: PRODUCT_TITLE }).first().click()
  await page.waitForTimeout(1_500)

  // Меню секции «Характеристики» — то же, что открывает владелица.
  const section = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: "Характеристики", exact: true }) })
    .last()
  await section.scrollIntoViewIfNeeded()
  await section.getByRole("button").first().click()
  await page.waitForTimeout(400)
  const items = await page.getByRole("menuitem").allInnerTexts()
  console.log("menu items:", JSON.stringify(items))
  await page.getByRole("menuitem", { name: "Заполнить" }).click()
  await page.waitForTimeout(1_200)

  const body = await page.locator("body").innerText()
  const isErrorPage = body.includes("Произошла ошибка") || body.includes("useRouteModal")
  console.log("url:", page.url())
  console.log("ERROR PAGE:", isErrorPage, "| useRouteModal in DOM:", body.includes("useRouteModal"))
  console.log(
    "drawer visible:",
    await page.getByRole("heading", { name: "Характеристики товара" }).isVisible()
  )

  if (isErrorPage) {
    await page.screenshot({ path: `${OUT}/11-panel-values-drawer-still-broken.png` })
    throw new Error("экран заполнения всё ещё падает")
  }

  await page.screenshot({ path: `${OUT}/04-panel-product-values-drawer.png` })

  // Пишем новое значение и сохраняем.
  const volume = page.locator('[data-testid="attribute-obem"]')
  console.log("поле «Объём» до правки:", await volume.inputValue())
  await volume.fill(NEW_VOLUME)
  await page.locator('[data-testid="save-attributes"]').click()
  await page.waitForTimeout(2_000)

  const afterSave = await page.locator("body").innerText()
  console.log("ящик закрылся:", !afterSave.includes("Характеристики товара"))
  console.log(
    "в секции товара «Объём»:",
    /Объём\s*\n?\s*([0-9]+ мл)/.exec(afterSave)?.[1] ?? "(не найдено)"
  )
  await page.screenshot({ path: `${OUT}/12-panel-product-section-after-save.png` })

  // Витрина: то же значение на карточке товара.
  const shop = await context.newPage()
  await shop.goto(`${STORE}/ru/products/${PRODUCT_HANDLE}`, { waitUntil: "networkidle" })
  const block = shop.locator('[data-testid="product-attributes"]')
  await block.scrollIntoViewIfNeeded()
  const blockText = (await block.innerText()).replace(/\n+/g, " | ")
  console.log("карточка товара:", blockText)
  await shop.screenshot({ path: `${OUT}/13-pdp-cube-1-after-save.png` })

  console.log("ошибки в консоли панели:", consoleErrors.length ? consoleErrors : "нет")

  await browser.close()
}

main().catch((error) => {
  console.error(String(error))
  process.exit(1)
})
