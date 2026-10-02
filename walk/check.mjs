// Checks walk/fixtures.mjs against the RUNNING stand: seed (with a buyer account), login(owner) with
// the panel open on an order, one capture through api(), login(buyer) and reset(). It never starts
// or stops the stand. The capture goes to the newest uncaptured transfer order of a walk test buyer
// (demo.buyer…@example.com) for the pilot's products; with none on the stand it says so and skips.
// Run through run-queue: node /Users/ivanprotsko/upready/projects/devops/staff/tools/run-queue.mjs run
//   --task o-20260921-01 --cwd <worktree> -- node walk/check.mjs
import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import * as fixtures from "./fixtures.mjs"

const require = createRequire(process.env.WALK_PLAYWRIGHT_FROM ?? "/Users/ivanprotsko/upready/projects/upready-store/package.json")
const { chromium } = require("playwright")
const OUT = path.join(process.env.WALK_TMP ?? path.join(os.tmpdir(), "upready-walk"), "check")
fs.mkdirSync(OUT, { recursive: true })

const results = []
const step = async (name, fn) => {
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail })
    console.log("ok  ", name, detail ?? "")
  } catch (e) {
    results.push({ name, ok: false, detail: e.message.split("\n")[0] })
    console.log("FAIL", name, e.message.split("\n")[0])
  }
}

// The same database the fixtures use, for the two lookups only this check needs.
const standEnv = Object.fromEntries(
  fs.readFileSync(process.env.WALK_STAND_ENV ?? "/Users/ivanprotsko/upready/worktrees/upready-store/stand/ivan-1001/apps/backend/.env", "utf8")
    .split("\n").map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")])
)
const psql = process.env.WALK_PSQL ?? "/opt/homebrew/opt/postgresql@16/bin/psql"
const sql = (q) => execFileSync(psql, [process.env.WALK_DB_URL ?? standEnv.DATABASE_URL, "-At", "-c", q], { encoding: "utf8" }).trim()

let fx
let orderId = null
const browser = await chromium.launch()
try {
  await step("seed (path that signs in, so the buyer account is created)", async () => {
    fx = await fixtures.seed([{ from: "C.login", branch: "login-ok" }])
    return `buyer ${fx.buyer.email}, lesson1 ${fx.course.lesson1}, card kind ${fx.shop.manualKinds.card}, receipts ${Object.values(fx.receipt).map((p) => `${path.basename(p)} ${fs.statSync(p).size}B`).join(", ")}`
  })

  await step("find an uncaptured walk test order", async () => {
    const handles = [fx.course.handle, fx.goods.handle].map((h) => `'${h}'`).join(",")
    orderId = sql(`
      select o.id from "order" o
      join order_payment_collection opc on opc.order_id = o.id
      join payment p on p.payment_collection_id = opc.payment_collection_id and p.deleted_at is null
      where o.email like 'demo.buyer%@example.com' and o.deleted_at is null and o.canceled_at is null
        and p.provider_id = 'pp_system_default' and p.captured_at is null and p.canceled_at is null
        and exists (select 1 from order_item oi join order_line_item li on li.id = oi.item_id
                    join product pr on pr.id = li.product_id where oi.order_id = o.id and pr.handle in (${handles}))
      order by o.created_at desc limit 1`) || null
    return orderId ?? "none on the stand: the capture steps below are skipped"
  })

  let owner
  await step("login(owner): panel session in a second context", async () => {
    owner = await fixtures.login("owner", { browser })
    await owner.page.goto(`${fixtures.stand.panel}/orders${orderId ? `/${orderId}` : ""}`, { waitUntil: "networkidle" })
    await owner.page.waitForTimeout(2000)
    await owner.page.screenshot({ path: path.join(OUT, "owner-before.png") })
    const url = owner.page.url()
    if (/login/.test(url)) throw new Error(`panel sent the owner to ${url}`)
    if (orderId && !(await owner.page.getByRole("button", { name: "Подтвердить оплату" }).count())) throw new Error("no «Подтвердить оплату» on the order")
    return url.replace(/^https?:\/\/[^/]+/, "")
  })

  if (orderId) {
    const run = { orderId }
    await step("api(capture) as the owner", async () => {
      const r = await fixtures.api({ do: "api", method: "POST", url: "{stand.backend}/tenants/payments/{run.paymentId}/capture", as: "owner" }, { run, fx })
      const captured = sql(`select captured_at is not null from payment where id = '${run.paymentId}'`)
      if (captured !== "t") throw new Error(`payment ${run.paymentId} not captured after ${r.status}`)
      return `${orderId} payment ${run.paymentId}: ${r.status}, captured`
    })
    await step("panel shows «Оплачен» after the capture", async () => {
      await owner.page.reload({ waitUntil: "networkidle" })
      await owner.page.waitForTimeout(2000)
      await owner.page.screenshot({ path: path.join(OUT, "owner-after.png") })
      if (!(await owner.page.getByText("Оплачен").count())) throw new Error("no «Оплачен»")
      return path.join(OUT, "owner-after.png")
    })
  }
  await owner?.context.close()

  await step("login(buyer): storefront account opens without the login form", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await fixtures.login("buyer", { context, fx })
    const page = await context.newPage()
    await page.goto(`${fixtures.stand.storefront}/ru/account`, { waitUntil: "networkidle" })
    await page.screenshot({ path: path.join(OUT, "buyer-account.png") })
    if (await page.getByTestId("login-page").count()) throw new Error("login form shown: the cookie was not accepted")
    await fixtures.reset({ context })
    const left = (await context.cookies()).length
    await context.close()
    if (left) throw new Error(`reset left ${left} cookies`)
    return "account page shown; reset cleared the cookies"
  })
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
fs.writeFileSync(path.join(OUT, "check.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 1))
console.log(failed.length ? `${failed.length} failed` : "all passed", "·", path.join(OUT, "check.json"))
process.exit(failed.length ? 1 : 0)
