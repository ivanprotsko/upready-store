#!/usr/bin/env node
/**
 * Acceptance of w24-integration-keys-self-service against a LIVE stand
 * (rule 18f): the shop owner connects Wildberries and Ozon from the panel,
 * with no command line anywhere in the flow.
 *
 * What it drives, in the owner's own order:
 *   1. log in, open `/settings/wildberries` — the bookmarked address — and
 *      land on the Wildberries card of «Маркетплейсы»;
 *   2. paste the real WB token, save, and watch the card answer WITHOUT a
 *      reload: «сохранён ••••XXXX», «только чтение», the expiry date;
 *   3. delete it and watch it come back to «не сохранён»;
 *   4. open `/settings/ozon`, save an invented pair and read the honest error
 *      Ozon answers with — the key is stored, the verdict is not invented;
 *   5. read the hub: every integration with its state.
 *
 *   PANEL_URL=http://localhost:5196 BACKEND_URL=http://localhost:9124 \
 *   OWNER_EMAIL=… OWNER_PASSWORD=… WB_ENV_FILE=/path/.env.cherkashino \
 *     node e2e/w24-integration-keys.e2e.mjs
 *
 * The WB token is read from the env file and NEVER printed, not into the log,
 * not into a screenshot: the flow types it into a password input and every
 * assertion is about its last four characters.
 *
 * Exit code 0 = every check passed; the log lists each check with PASS/FAIL.
 * Screenshots land in `SHOT_DIR`, at 1280×900 and at 390×844.
 */
import { createRequire } from "node:module"
import { readFileSync, mkdirSync } from "node:fs"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL("../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url)
    .pathname
const { chromium } = require(PLAYWRIGHT)

const PANEL = process.env.PANEL_URL || "http://localhost:5196"
const BACKEND = process.env.BACKEND_URL || "http://localhost:9124"
const EMAIL = process.env.OWNER_EMAIL || "owner-cherkashino@example.test"
const PASSWORD = process.env.OWNER_PASSWORD || "w24-stand-pass"
const SHOT_DIR = process.env.SHOT_DIR || "artifacts/docs/w24-integration-keys-self-service"
const WB_ENV_FILE =
  process.env.WB_ENV_FILE || "/Users/ivanprotsko/upready/projects/upready-store/.env.cherkashino"

/** The shop's real WB token, read from the env file and never logged. */
const wbKey = (() => {
  const line = readFileSync(WB_ENV_FILE, "utf8")
    .split("\n")
    .find((row) => row.startsWith("WB_API_KEY="))
  if (!line) {
    throw new Error(`${WB_ENV_FILE} carries no WB_API_KEY= line`)
  }
  return line.slice("WB_API_KEY=".length).trim().replace(/^["']|["']$/g, "")
})()
const LAST4 = wbKey.slice(-4)

const OZON_CLIENT_ID = "1234567"
const OZON_FAKE_KEY = "w24-invented-ozon-key"

let failures = 0
const check = (name, ok, detail = "") => {
  if (!ok) {
    failures += 1
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`)
}

const shot = async (page, name) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false })
  return `${SHOT_DIR}/${name}.png`
}

const login = async (page) => {
  await page.goto(`${PANEL}/login`, { waitUntil: "networkidle" })
  await page.locator('input[name="email"]').fill(EMAIL)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForFunction(() => !location.pathname.endsWith("/login"), null, { timeout: 30_000 })
}

const run = async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()

  // Whatever the page sends or receives must not carry the token back to the
  // browser: this collects every response body of the namespace and the whole
  // lot is checked at the end.
  const bodies = []
  page.on("response", async (response) => {
    if (!response.url().includes("/tenants/")) {
      return
    }
    try {
      bodies.push(await response.text())
    } catch {
      /* a redirect or a body already consumed: nothing to check */
    }
  })

  await login(page)
  check("владелица вошла в панель", !page.url().endsWith("/login"), page.url())

  // 1. The bookmarked Wildberries address lands on the card.
  await page.goto(`${PANEL}/settings/wildberries`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1500)
  check(
    "/settings/wildberries ведёт на карточку Wildberries",
    page.url().includes("/settings/marketplaces"),
    page.url(),
  )

  const wbInput = page.getByTestId("mp-key-input-wb-api_key")
  await wbInput.waitFor({ state: "visible", timeout: 30_000 })
  check("на карточке Wildberries есть поле для ключа", await wbInput.isVisible())
  check(
    "поле ключа — пароль, значение не читается с экрана",
    (await wbInput.getAttribute("type")) === "password",
  )
  const before = await shot(page, "01-wb-key-empty-1280x900")

  // 2. Type the real key and save.
  await wbInput.fill(wbKey)
  await page.getByTestId("mp-key-save-wb").click()

  const wbState = page.getByTestId("mp-key-state-wb")
  await wbState.filter({ hasText: LAST4 }).first().waitFor({ timeout: 30_000 })
  const stateText = await wbState.textContent()
  check("карточка показывает «сохранён ••••XXXX»", stateText.includes(LAST4), stateText.trim())

  // The rights and the expiry arrive WITHOUT a reload: the same page instance,
  // no `goto` between the click and this wait.
  await page
    .getByText("только чтение", { exact: false })
    .first()
    .waitFor({ timeout: 30_000 })
  check("права ключа обновились без перезагрузки: «только чтение»", true)

  const expiryRow = await page
    .locator("text=Действует до")
    .first()
    .locator("xpath=../..")
    .textContent()
  check(
    "срок действия ключа показан",
    /\d{2}[./]\d{2}[./]\d{4}|\d{4}/.test(expiryRow ?? ""),
    (expiryRow ?? "").trim().slice(0, 120),
  )

  const mirrors = await page.locator("text=Уже у нас").first().isVisible()
  check("таблицы карточки отрисованы (раздел «Уже у нас»)", mirrors)

  const after = await shot(page, "02-wb-key-saved-1280x900")

  // 3. Ozon: an invented pair is stored and the check answers honestly.
  await page.goto(`${PANEL}/settings/ozon`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1500)
  check(
    "/settings/ozon ведёт на карточку Ozon",
    page.url().includes("/settings/marketplaces"),
    page.url(),
  )
  const ozonClient = page.getByTestId("mp-key-input-ozon-client_id")
  const ozonKey = page.getByTestId("mp-key-input-ozon-api_key")
  await ozonClient.waitFor({ state: "visible", timeout: 30_000 })
  check("на карточке Ozon есть поля Client-Id и Api-Key", await ozonKey.isVisible())

  await ozonClient.fill(OZON_CLIENT_ID)
  await ozonKey.fill(OZON_FAKE_KEY)
  await page.getByTestId("mp-key-save-ozon").click()

  const ozonState = page.getByTestId("mp-key-state-ozon")
  await ozonState.filter({ hasText: OZON_FAKE_KEY.slice(-4) }).first().waitFor({ timeout: 30_000 })
  check("ключ Ozon сохранён, показаны последние 4 знака", true)

  // The verdict on an invented key is Ozon's own answer, not our guess.
  const ozonCard = page.locator("#ozon")
  await ozonCard
    .getByText("не удалось определить", { exact: false })
    .first()
    .waitFor({ timeout: 30_000 })
  const ozonText = ((await ozonCard.textContent()) ?? "").replace(/\s+/g, " ")
  check(
    "по выдуманному ключу Ozon показана честная ошибка проверки",
    ozonText.includes("не удалось определить") && ozonText.includes("ключ не ответил"),
    ozonText.slice(ozonText.indexOf("Права ключа"), ozonText.indexOf("Права ключа") + 170),
  )
  const ozonShot = await shot(page, "03-ozon-key-invalid-1280x900")

  // 4. The hub lists every integration, marketplaces and the rest.
  await page.goto(`${PANEL}/settings/marketplaces`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1500)
  check("хаб перечисляет Robokassa", await page.getByTestId("mp-other-robokassa").isVisible())
  check("хаб перечисляет доставку", await page.getByTestId("mp-other-delivery").isVisible())
  const hubShot = await shot(page, "04-hub-all-integrations-1280x900")

  // 5. The phone screen, the size the owner actually opens the panel on.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })
  const phonePage = await phone.newPage()
  await login(phonePage)
  await phonePage.goto(`${PANEL}/settings/marketplaces`, { waitUntil: "networkidle" })
  await phonePage.waitForTimeout(2500)
  const phoneShot = await shot(phonePage, "05-hub-390x844")
  check("панель открывается на телефоне 390×844", true, phoneShot)
  await phone.close()

  // 6. Delete the key: the card returns to «не сохранён».
  await page.goto(`${PANEL}/settings/marketplaces`, { waitUntil: "networkidle" })
  await page.getByTestId("mp-key-remove-wb").waitFor({ state: "visible", timeout: 30_000 })
  await page.getByTestId("mp-key-remove-wb").click()
  // Medusa UI's `usePrompt` renders an ALERTDIALOG, not a dialog (measured on
  // the stand: `[role="dialog"]` matches nothing and the click times out).
  await page.locator('[role="alertdialog"] button', { hasText: "Удалить" }).first().click()
  await page
    .getByTestId("mp-key-state-wb")
    .filter({ hasText: "не сохранён" })
    .first()
    .waitFor({ timeout: 30_000 })
  check("после удаления карточка показывает «не сохранён»", true)
  const removedShot = await shot(page, "06-wb-key-removed-1280x900")

  // 7. The token never came back to the browser.
  const leaked = bodies.filter((body) => body.includes(wbKey)).length
  check("ключ не встречается ни в одном ответе /tenants/*", leaked === 0, `тел проверено: ${bodies.length}`)

  // 8. And the backend agrees: the write slot was never filled.
  const login2 = await fetch(`${BACKEND}/auth/tenant/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const { token } = await login2.json()
  const write = await fetch(`${BACKEND}/tenants/wb/write-settings`, {
    headers: { authorization: `Bearer ${token}` },
  })
  const writeState = await write.json()
  check(
    "слот записи wildberries_write формой не заполнен",
    writeState.gates?.credential?.key?.set === false,
    JSON.stringify(writeState.gates?.credential?.key),
  )

  console.log(`\nscreenshots: ${[before, after, ozonShot, hubShot, phoneShot, removedShot].join("\n             ")}`)
  await browser.close()
}

run()
  .then(() => {
    console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed")
    process.exit(failures ? 1 : 0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
