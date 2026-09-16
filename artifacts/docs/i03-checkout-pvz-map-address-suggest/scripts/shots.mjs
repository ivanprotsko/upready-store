/**
 * i03 — приёмка на реальности: живой стенд, живые точки СДЭК, живая Яндекс-карта.
 * Ничего не мокается. Пишет скриншоты и печатает замеры (правило 18f).
 *   node shots.mjs <baseURL> <outDir>
 */
import fs from "node:fs"
import { chromium, devices } from "playwright"

const BASE = process.argv[2]
const OUT = process.argv[3]
fs.mkdirSync(OUT, { recursive: true })

const ADDRESS = { address1: "Тверская улица, 12с1", city: "Москва", postal: "125009", province: "г Москва" }
const log = (...a) => console.log(...a)

async function reachShipping(page) {
  await page.goto(`${BASE}/ru/store`, { waitUntil: "domcontentloaded" })
  await page.getByTestId("product-title").first().click()
  await page.getByTestId("product-container").waitFor({ timeout: 30000 })
  const add = page.getByTestId("add-product-button")
  const groups = page.getByTestId("product-options")
  for (let i = 0; i < 5 && !(await add.isEnabled()); i++) {
    for (let g = 0; g < (await groups.count()); g++) {
      const opt = groups.nth(g).locator('[data-testid="option-button"]:not([disabled])').first()
      if (await opt.count()) await opt.click()
    }
    await page.waitForTimeout(400)
  }
  await add.click()
  await page.waitForTimeout(2500)
  await page.goto(`${BASE}/ru/checkout`, { waitUntil: "domcontentloaded" })
  log(`страница чекаута: ${new URL(page.url()).pathname}`)

  // Клик по строке контактов до гидратации попадает в мёртвую разметку —
  // повторяем, пока лист не откроется (та же ловушка, что в tests/stands).
  const contactsRow = page.getByTestId("checkout-contacts-row")
  await contactsRow.waitFor({ timeout: 30000 })
  const firstName = page.getByTestId("shipping-first-name-input")
  for (let attempt = 0; attempt < 5; attempt++) {
    await contactsRow.click()
    if (await firstName.waitFor({ timeout: 4000 }).then(() => true).catch(() => false)) break
    await page.waitForTimeout(1000)
  }
  await firstName.fill("Иван")
  await page.getByTestId("shipping-last-name-input").fill("Покупатель")
  await page.getByTestId("shipping-email-input").fill("i03-buyer@upready.dev")
  await page.getByTestId("shipping-phone-input").fill("+79990000000")
  await page.locator('form button[type="submit"]:visible').last().click()
  await page.getByTestId("shipping-first-name-input").waitFor({ state: "hidden", timeout: 30000 })
}

async function fillAddress(page, { shotSuggest }) {
  const sheet = page.locator("#headlessui-portal-root")
  await page.getByTestId("checkout-address-row").click()
  const addNew = sheet.getByRole("button", { name: /новый адрес/i })
  if ((await addNew.count()) && (await addNew.isVisible())) await addNew.click()
  await sheet.locator('input[name="address_1"]').waitFor({ timeout: 20000 })
  await sheet.locator('input[name="address_1"]').fill(ADDRESS.address1)

  // Подсказка города: печатаем по буквам и снимаем открытый список — живой СДЭК.
  const city = sheet.getByTestId("address-city-suggest")
  await city.click()
  await city.pressSequentially("Москв", { delay: 90 })
  await sheet.getByTestId("address-city-suggest-option").first().waitFor({ timeout: 20000 })
  const suggestions = await sheet.getByTestId("address-city-suggest-option").allInnerTexts()
  log(`подсказки по «Москв» (живой СДЭК): ${suggestions.length} → ${suggestions.map((s) => s.split("\n")[0]).join(" | ")}`)
  if (shotSuggest) await page.screenshot({ path: shotSuggest })
  await city.press("ArrowDown")
  await city.press("Enter")
  const picked = await city.inputValue()
  log(`поле города после выбора клавиатурой: «${picked}»`)
  if (picked !== "Москва") throw new Error(`клавиатурный выбор дал «${picked}», ожидали «Москва»`)

  await sheet.locator('input[name="postal_code"]').fill(ADDRESS.postal)
  const sel = sheet.getByTestId("address-province-select")
  if (await sel.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false)) {
    await sel.selectOption(ADDRESS.province)
  }
  await sheet.locator('form button[type="submit"]:visible').last().click()
  await sheet.locator('input[name="address_1"]').waitFor({ state: "hidden", timeout: 30000 })
}

const totalText = async (page) => {
  const el = page.getByTestId("cart-total").first()
  return (await el.count()) ? (await el.innerText()).replace(/\s+/g, " ") : "(нет data-testid=cart-total)"
}

async function run(kind, viewport, device) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ ...(device ?? {}), viewport })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  log(`\n=== ${kind} ${viewport.width}x${viewport.height} ===`)

  await reachShipping(page)
  await fillAddress(page, { shotSuggest: `${OUT}/${kind}-01-address-suggest.png` })

  const before = await totalText(page)
  log(`итог до выбора пункта: ${before}`)

  const card = page
    .getByTestId("delivery-option-radio")
    .filter({ hasText: /СДЭК/i })
    .filter({ hasText: /пункт|постамат/i })
    .first()
  await card.waitFor({ timeout: 30000 })
  log(`карточка способа: ${(await card.innerText()).replace(/\s+/g, " ")}`)
  await card.click()

  const sheet = page.locator("#headlessui-portal-root")
  await sheet.getByTestId("cdek-point-city").waitFor({ timeout: 30000 })
  await sheet.getByTestId("cdek-point-count").waitFor({ timeout: 40000 })
  log(`в листе: ${await sheet.getByTestId("cdek-point-count").innerText()}`)

  if (kind === "mobile") {
    await sheet.getByTestId("cdek-point-tab-map").click()
  }
  // Ждём саму Яндекс-карту: контейнер, который создаёт ymaps.Map.
  await page.waitForFunction(() => !!document.querySelector(".ymaps-2-1-79-map, [class*='ymaps'][class*='map']"), null, { timeout: 40000 })
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${OUT}/${kind}-02-pickup-map.png` })
  const markers = await page.evaluate(
    () => document.querySelectorAll("[class*='ymaps'][class*='placemark'], ymaps [class*='icon']").length
  )
  log(`DOM-элементов меток/кластеров на карте: ${markers}`)

  if (kind === "mobile") await sheet.getByTestId("cdek-point-tab-list").click()
  const firstRow = sheet.getByTestId("cdek-point-row").first()
  const chosenName = (await firstRow.innerText()).split("\n")[0]
  await firstRow.getByTestId("cdek-point-choose").click()
  await sheet.getByTestId("cdek-point-city").waitFor({ state: "hidden", timeout: 40000 })
  await page.waitForTimeout(2500)

  const after = await totalText(page)
  log(`выбран пункт: ${chosenName}`)
  log(`итог после выбора пункта: ${after}`)
  const row = page.getByTestId("checkout-shipping-row").first()
  if (await row.count()) log(`строка доставки: ${(await row.innerText()).replace(/\s+/g, " ")}`)
  await page.screenshot({ path: `${OUT}/${kind}-03-after-choose.png`, fullPage: false })

  await browser.close()
}

await run("desktop", { width: 1280, height: 900 })
await run("mobile", { width: 390, height: 844 }, devices["Pixel 5"])
log("\nготово")
