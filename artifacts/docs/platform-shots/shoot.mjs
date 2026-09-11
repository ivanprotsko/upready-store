// Screenshots for the W7 "Магазины" (tenants) admin section.
// Re-runnable: `node artifacts/docs/platform-shots/shoot.mjs`.
//
// Playwright note: the brief pointed at
// /Users/ivanprotsko/upready/node_modules/playwright, but that path is a dangling symlink on
// this machine (no playwright devDependency at the ~/upready root). A working install (1.63.0)
// is present transitively in THIS worktree's own pnpm store, so this script imports it from
// there instead — same namespace-import-then-assert pattern the brief asked for.
const pwPkg =
  "/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-platform/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs"
const pw = await import(pwPkg)
const { chromium } = pw
if (!chromium) throw new Error("chromium export missing")

const BASE_URL = "http://localhost:9025"
const ADMIN_EMAIL = "admin@upready.dev"
const ADMIN_PASSWORD = "supersecret"
const OUT_DIR = new URL(".", import.meta.url).pathname

const HANDLE = `w7-shot-${Date.now().toString(36)}`

async function main() {
  // Full "chromium" revision is not cached on this machine, only chromium-headless-shell —
  // verified with `ls ~/Library/Caches/ms-playwright` before writing this script.
  const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  // The orchestrator's `medusa develop` restarts on every file the other night workers
  // (W1/W2/W3) write — sometimes several times a minute — so a plain `page.goto` can land
  // mid-restart. Retry on connection-refused instead of failing the whole run.
  async function gotoRetry(url, opts) {
    for (let i = 0; i < 15; i++) {
      try {
        await page.goto(url, opts)
        return
      } catch (err) {
        if (!/ERR_CONNECTION_REFUSED/.test(err.message) || i === 14) throw err
        await new Promise((r) => setTimeout(r, 2000))
      }
    }
  }

  try {
    // 1. Log in through the UI. NOTE: `/\/app(\/.*)?$/` trivially matches the CURRENT
    // "/app/login" URL too, so waiting on it resolves instantly and races the login POST —
    // wait for that response explicitly, then for the URL to actually leave "/login".
    await gotoRetry(`${BASE_URL}/app/login`, { waitUntil: "load" })
    await page.getByPlaceholder(/email/i).fill(ADMIN_EMAIL)
    await page.getByPlaceholder(/password/i).fill(ADMIN_PASSWORD)
    const loginResponse = page.waitForResponse(
      (res) => res.url().includes("/auth/user/emailpass") && res.request().method() === "POST"
    )
    await page.getByRole("button", { name: /continue|log in|sign in/i }).click()
    await loginResponse
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 })

    // 2. List page. Wait for the actual GET /admin/tenants response (not just the "Магазины"
    // heading) before screenshotting — otherwise the shot catches the DataTable's loading
    // skeleton instead of real rows.
    const tenantsListResponse = page.waitForResponse(
      (res) => /\/admin\/tenants(\?|$)/.test(res.url()) && res.request().method() === "GET"
    )
    await gotoRetry(`${BASE_URL}/app/tenants`, { waitUntil: "load" })
    const apiErrored = await page
      .getByText(/failed|error|unauthorized/i)
      .first()
      .isVisible()
      .catch(() => false)
    if (apiErrored) {
      console.log("SHOTS: pending-api")
      await page.screenshot({ path: `${OUT_DIR}01-list.png` })
      await browser.close()
      return
    }
    await page.waitForSelector("text=Магазины", { timeout: 20000 })
    await tenantsListResponse
    await page.waitForSelector("text=Домен", { timeout: 20000 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT_DIR}01-list.png` })

    // 3. Create modal.
    await page.getByRole("button", { name: "Создать магазин" }).click()
    await page.waitForSelector("text=Новый магазин")
    await page.screenshot({ path: `${OUT_DIR}02-create.png` })

    // The name must be unique too (createTenantWorkflow provisions a same-named fulfillment
    // set/warehouse) — a fixed name collided with a previous run's leftover tenant.
    await page.getByPlaceholder("Cool Store").fill(`W7 Screenshot Shop ${HANDLE}`)
    await page.getByPlaceholder("cool-store").fill(HANDLE)
    await page.getByPlaceholder("owner@shop.com").fill(`${HANDLE}@example.com`)
    await page.getByPlaceholder("не короче 8 символов").fill("supersecret123")
    await page.getByRole("button", { name: "Создать", exact: true }).click()

    // 4. Detail page after creation.
    await page.waitForURL(/\/app\/tenants\/ten_/, { timeout: 15000 })
    await page.waitForSelector("text=Администраторы")
    await page.screenshot({ path: `${OUT_DIR}03-detail.png` })

    // 5. Admin edit drawer.
    await page.getByRole("button", { name: "Изменить", exact: true }).first().click()
    await page.waitForSelector("text=Сменить email и пароль")
    await page.screenshot({ path: `${OUT_DIR}04-admin-edit.png` })
    await page.keyboard.press("Escape")

    // 6. Delete prompt.
    await page.getByRole("button", { name: "Удалить магазин" }).click()
    await page.waitForSelector("text=Удалить магазин?")
    await page.screenshot({ path: `${OUT_DIR}05-delete-prompt.png` })
    await page.getByRole("button", { name: "Удалить", exact: true }).click()

    // 7. Archived state.
    await page.waitForSelector("text=Архивирован", { timeout: 20000 })
    await page.screenshot({ path: `${OUT_DIR}06-archived.png` })

    console.log("SHOTS: 6 files")
  } catch (err) {
    await page.screenshot({ path: `${OUT_DIR}_debug-fail.png` }).catch(() => {})
    throw err
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
