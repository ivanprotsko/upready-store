/**
 * f12-owner-raw-keys — full walkthrough per prompts/f12-owner-raw-keys.md
 * "Приёмка (замером, на живой панели)". Visits every screen the task names,
 * measures innerText against the task's three regexes, screenshots each,
 * and writes one raw JSON per screen plus a summary.
 */
import { PANEL, launch, login, measureScreen, save, shot } from "./lib.mjs"

/**
 * The panel's session-auth SDK sets an httpOnly cookie the browser context
 * already carries after `login()` — a bare `fetch()` from Node has no such
 * cookie, so the first product/order id is read through the PAGE's own
 * `window.__sdk` (exposed by `lib/client/client.ts` for exactly this kind of
 * console poking) instead of a second, unauthenticated HTTP client.
 */
async function getFirstIds(page) {
  return page.evaluate(async () => {
    const sdk = window.__sdk
    const products = await sdk.client.fetch("/tenants/products?limit=1")
    const orders = await sdk.client.fetch("/tenants/orders?limit=1")
    return {
      productId: products.products?.[0]?.id,
      orderId: orders.orders?.[0]?.id,
    }
  })
}

async function main() {
  const { browser, page, errors } = await launch()
  await login(page)
  const { productId, orderId } = await getFirstIds(page)
  console.log("productId:", productId, "orderId:", orderId)

  const screens = [
    { name: "s01-home", path: "/" },
    { name: "s02-products", path: "/products" },
    { name: "s03-product-detail", path: productId ? `/products/${productId}` : null },
    { name: "s04-orders", path: "/orders" },
    { name: "s05-order-detail", path: orderId ? `/orders/${orderId}` : null },
    { name: "s06-promotions-create-type", path: "/promotions/create" },
    { name: "s07-categories", path: "/categories" },
    { name: "s08-pages", path: "/pages" },
    { name: "s09-home-settings", path: "/home-settings" },
    { name: "s10-shipping", path: "/shipping" },
    { name: "s11-settings-domains", path: "/settings/domains" },
    { name: "s12-settings-locale", path: "/settings/locale" },
    { name: "s13-settings-payments", path: "/settings/payments" },
    { name: "s14-settings-notifications", path: "/settings/notifications" },
  ]

  const results = []
  for (const screen of screens) {
    if (!screen.path) {
      results.push({ name: screen.name, skipped: true, reason: "no id found" })
      continue
    }
    try {
      await page.goto(PANEL + screen.path, { waitUntil: "networkidle", timeout: 30000 })
      const measurement = await measureScreen(page, screen.name)
      await shot(page, screen.name)
      save(screen.name, measurement)
      results.push(measurement)
      console.log(
        screen.name,
        "rawKeys=" + measurement.rawKeyMatches.length,
        "machineValues=" + measurement.machineValueMatches.length,
        "titleHasMedusa=" + measurement.hasMedusaInTitle
      )
    } catch (e) {
      results.push({ name: screen.name, error: String(e).slice(0, 300) })
      console.log(screen.name, "ERROR", String(e).slice(0, 200))
    }
  }

  // Step "Подробности" of /promotions/create — click the first template card
  // to advance past the type-select step, per the task's inventory table.
  try {
    await page.goto(PANEL + "/promotions/create", { waitUntil: "networkidle" })
    await page.click("text=/Скидка/", { timeout: 10000 })
    const measurement = await measureScreen(page, "s06b-promotions-create-details")
    await shot(page, "s06b-promotions-create-details")
    save("s06b-promotions-create-details", measurement)
    results.push(measurement)
    console.log(
      "s06b-promotions-create-details",
      "rawKeys=" + measurement.rawKeyMatches.length,
      "machineValues=" + measurement.machineValueMatches.length
    )
  } catch (e) {
    results.push({ name: "s06b-promotions-create-details", error: String(e).slice(0, 300) })
    console.log("s06b-promotions-create-details ERROR", String(e).slice(0, 200))
  }

  save("s99-console-errors", errors)
  save("s00-summary", {
    total: results.length,
    withRawKeys: results.filter((r) => r.rawKeyMatches?.length).length,
    withMachineValues: results.filter((r) => r.machineValueMatches?.length).length,
    titleHasMedusaAnywhere: results.some((r) => r.hasMedusaInTitle),
    consoleErrorCount: errors.length,
    results,
  })

  await browser.close()

  const failed = results.filter(
    (r) => r.rawKeyMatches?.length || r.machineValueMatches?.length || r.hasMedusaInTitle
  )
  if (failed.length) {
    console.log("\nFAILED screens:")
    for (const f of failed) {
      console.log(
        " -",
        f.name,
        f.rawKeyMatches?.length ? `rawKeys=${JSON.stringify(f.rawKeyMatches)}` : "",
        f.machineValueMatches?.length ? `machineValues=${JSON.stringify(f.machineValueMatches)}` : "",
        f.hasMedusaInTitle ? "titleHasMedusa" : ""
      )
    }
    process.exitCode = 1
  } else {
    console.log("\nALL SCREENS CLEAN")
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
