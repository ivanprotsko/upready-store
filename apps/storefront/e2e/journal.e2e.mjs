#!/usr/bin/env node
/**
 * End-to-end acceptance of the shop's journal (b18-blog-full), driving the two
 * real surfaces in the order a shop owner uses them: write an article in the
 * tenant panel, then read it on the storefront.
 *
 *   PANEL_URL=http://localhost:5118 \
 *   SHOP_URL=http://cherkashino.localhost:8118 \
 *   PANEL_EMAIL=owner-cherkashino@example.test PANEL_PASSWORD=… \
 *   SHOTS_DIR=../../artifacts/docs/b18-blog-full/shots \
 *     node e2e/journal.e2e.mjs
 *
 * What it proves, and why each check is here rather than in the seam suite
 * (`apps/backend/integration-tests/http/tenants-articles-status.spec.ts`,
 * which covers the API's own rules):
 *
 *  - «Новая статья» opens a PAGE with the title as its first field, and one
 *    save writes the whole article. This is the defect the task was opened for
 *    (Ivan, 2026-09-16 08:31): the journal's only entry point used to be a
 *    strip of inputs asking for a URL slug, and a shop with no articles had no
 *    page to write on at all.
 *  - the address is derived from a RUSSIAN title and is accepted by the
 *    backend. Round 1 of this acceptance found `toSlugWhileTyping` appending a
 *    trailing hyphen to every Cyrillic title, which the slug pattern refuses —
 *    three articles created in the UI, zero saved, and no error anywhere.
 *  - the markdown preview renders beside the field, and a picture uploaded
 *    INTO the text is `![…](…)` in the body and an `<img>` that actually
 *    loaded on the page (naturalWidth > 0, not «the tag is there»).
 *  - a draft is invisible to a visitor and its address is a 404.
 *  - renaming the address moves the article; the old address stops answering.
 *  - delete removes it from the list and from the site.
 *
 * Every count that matters is asserted, and a failed step STOPS the run: round
 * 1 recorded three zeroes and read as «nothing to see» (rule 20a).
 *
 * Exit 0 = every check passed. Screenshots land in SHOTS_DIR.
 */
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { deflateSync } from "node:zlib"
import os from "node:os"
import path from "node:path"

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.PLAYWRIGHT ||
  new URL("../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright", import.meta.url)
    .pathname
const { chromium } = require(PLAYWRIGHT)

const PANEL = process.env.PANEL_URL || "http://localhost:5118"
const SHOP = process.env.SHOP_URL || "http://cherkashino.localhost:8118"
const EMAIL = process.env.PANEL_EMAIL || "owner-cherkashino@example.test"
const PASSWORD = process.env.PANEL_PASSWORD || "w13-acceptance-scratch"
const SHOTS = process.env.SHOTS_DIR || path.resolve("../../artifacts/docs/b18-blog-full/shots")

mkdirSync(SHOTS, { recursive: true })

/**
 * The two pictures this run uploads are GENERATED, not committed: a fixture PNG
 * is a binary in git history (rule 21f), and all these have to be is a valid
 * image of a known size. Written to a temp dir as a solid-colour truecolour
 * PNG, so the page assertions can read the natural size back.
 */
const crc32 = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return (buf) => {
    let c = -1
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
})()

const pngChunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const solidPng = (width, height, [r, g, b]) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 3] = r
    row[2 + x * 3] = g
    row[3 + x * 3] = b
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ])
}

const FIXTURES = path.join(os.tmpdir(), "journal-e2e-fixtures")
mkdirSync(FIXTURES, { recursive: true })
writeFileSync(path.join(FIXTURES, "journal-cover.png"), solidPng(1200, 675, [15, 118, 110]))
writeFileSync(path.join(FIXTURES, "journal-inline.png"), solidPng(900, 500, [31, 41, 55]))

// The three articles this run writes. Slugs are derived by the panel from the
// titles, so they are spelled out here only to be read back on the storefront.
const SLUG = "peptidy-e2e"
const DRAFT_SLUG = "chernovik-e2e"
const RENAMED = "peptidy-e2e-korotko"

const results = []
const record = (name, value, ok) => {
  results.push({ name, value, ok })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${JSON.stringify(value)}`)
}
const must = (name, value, expected) => {
  const ok = typeof expected === "function" ? expected(value) : value === expected
  record(name, value, ok)
  if (!ok) {
    throw new Error(`${name} — получено ${JSON.stringify(value)}`)
  }
  return value
}
const note = (name, value) => record(name, value, true)

const BODY = [
  "## Что такое пептиды",
  "",
  "Пептиды — короткие цепочки аминокислот.",
  "",
  "- короткие цепочки",
  "- работают точечно",
  "",
  "> Важно: подбирать курс должен врач.",
  "",
  "---",
  "",
  "Подробности — на [странице доставки](/delivery).",
].join("\n")

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ru-RU" })
const page = await ctx.newPage()

const shopStatus = async (p) => (await fetch(SHOP + p, { redirect: "manual" })).status

try {
  // ---------- вход
  await page.goto(`${PANEL}/login`, { waitUntil: "networkidle", timeout: 90000 })
  await page.fill('input[name="email"], input[type="email"]', EMAIL)
  await page.fill('input[name="password"], input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 60000 })
  await page.waitForTimeout(1500)
  note("panel-login", page.url())

  // ---------- 1. пустой журнал предлагает СТРАНИЦУ, а не адрес
  await page.goto(`${PANEL}/journal`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1200)
  must("new-article-button", await page.getByTestId("article-new").isVisible(), true)

  await page.getByTestId("article-new").click()
  await page.waitForTimeout(1500)
  must("editor-is-a-page", page.url(), (u) => u.endsWith("/journal/new"))
  must("first-field-is-title", await page.getByTestId("article-title-input").isVisible(), true)

  // ---------- 2. пишем статью целиком
  await page.getByTestId("article-title-input").fill("Пептиды E2E")
  await page.waitForTimeout(400)
  must(
    "slug-derived-from-russian-title",
    await page.getByTestId("article-slug-input").inputValue(),
    (v) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)
  )
  await page.getByTestId("article-slug-input").fill(SLUG)

  await page.getByTestId("article-body-input").fill(BODY)
  await page.waitForTimeout(500)
  must(
    "preview-renders-blocks",
    await page.getByTestId("article-preview").locator("p, ul, blockquote, hr").count(),
    (n) => n >= 4
  )

  await page.getByTestId("article-body-input").click()
  await page.getByTestId("article-body-input").press("End")
  await page.setInputFiles(
    '[data-testid="article-body-image-input"]',
    path.join(FIXTURES, "journal-inline.png")
  )
  await page.waitForTimeout(4000)
  must(
    "inline-image-in-markdown",
    await page.getByTestId("article-body-input").inputValue(),
    (v) => /!\[[^\]]*\]\([^)]+\)/.test(v)
  )
  must("inline-image-in-preview", await page.getByTestId("article-preview").locator("img").count(), 1)

  await page.setInputFiles(
    '[data-testid="article-cover-input"]',
    path.join(FIXTURES, "journal-cover.png")
  )
  await page.waitForTimeout(4000)
  must("cover-uploaded", await page.getByTestId("article-cover-preview").isVisible(), true)

  await page.getByTestId("article-excerpt-input").fill("Короткий разбор про пептиды.")
  await page.getByTestId("article-category-input").fill("Здоровье E2E")

  await page.getByTestId("article-status-select").click()
  await page.waitForTimeout(400)
  await page.getByRole("option", { name: "Опубликована" }).click()
  await page.waitForTimeout(300)

  await page.getByTestId("article-save").click()
  await page.waitForTimeout(4500)
  must("saved-and-left-the-form", page.url(), (u) => u.endsWith(`/journal/${SLUG}`))
  await page.screenshot({ path: `${SHOTS}/e2e-01-panel-saved.png` })

  // ---------- 3. черновик
  await page.goto(`${PANEL}/journal/new`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1200)
  await page.getByTestId("article-title-input").fill("Черновик E2E")
  await page.getByTestId("article-slug-input").fill(DRAFT_SLUG)
  await page.getByTestId("article-body-input").fill("Текст ещё пишется.")
  await page.getByTestId("article-save").click()
  await page.waitForTimeout(4000)
  must("draft-saved", page.url(), (u) => u.endsWith(`/journal/${DRAFT_SLUG}`))

  // ---------- 4. витрина: статья видна, черновик нет
  await new Promise((r) => setTimeout(r, 2500))
  const shop = await ctx.newPage()
  await shop.goto(`${SHOP}/ru/journal`, { waitUntil: "networkidle", timeout: 90000 })
  await shop.waitForTimeout(1200)
  const feedText = await shop.locator("body").innerText()
  must("feed-shows-the-article", feedText.includes("Пептиды E2E"), true)
  must("feed-hides-the-draft", feedText.includes("Черновик E2E"), false)
  must("feed-shows-reading-time", /\d+\s*мин чтения/.test(feedText), true)
  must(
    "feed-shows-the-category-chip",
    await shop.getByTestId("journal-category-chip").filter({ hasText: "Здоровье E2E" }).count(),
    1
  )
  await shop.screenshot({ path: `${SHOTS}/e2e-02-shop-feed.png` })

  await shop.goto(`${SHOP}/ru/journal/${SLUG}`, { waitUntil: "networkidle" })
  await shop.waitForTimeout(1200)
  must("article-title-on-site", (await shop.getByTestId("journal-article-title").textContent())?.trim(), "Пептиды E2E")
  must("article-breadcrumbs", await shop.getByTestId("journal-breadcrumbs").isVisible(), true)
  must("article-share", await shop.getByTestId("journal-article-share").isVisible(), true)
  must("article-inline-image-rendered", await shop.locator('[data-testid="markdown-image"]').count(), 1)

  // Каждая картинка ДОЛЖНА была загрузиться: тег без пикселей — это дырка.
  const broken = await shop.evaluate(() =>
    [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src)
  )
  must("no-broken-images", broken, (list) => list.length === 0)
  await shop.screenshot({ path: `${SHOTS}/e2e-03-shop-article.png`, fullPage: true })

  must("draft-address-is-404", await shopStatus(`/ru/journal/${DRAFT_SLUG}`), 404)

  // ---------- 5. переименование адреса
  await page.goto(`${PANEL}/journal/${SLUG}`, { waitUntil: "networkidle" })
  await page.waitForTimeout(2500)
  await page.getByTestId("article-slug-input").fill(RENAMED)
  await page.getByTestId("article-save").click()
  await page.waitForTimeout(4500)
  must("renamed-in-panel", page.url(), (u) => u.endsWith(`/journal/${RENAMED}`))
  await new Promise((r) => setTimeout(r, 2500))
  must("new-address-opens", await shopStatus(`/ru/journal/${RENAMED}`), 200)
  must("old-address-gone", await shopStatus(`/ru/journal/${SLUG}`), 404)

  // ---------- 6. удаление
  await page.goto(`${PANEL}/journal`, { waitUntil: "networkidle" })
  await page.waitForTimeout(2000)
  const before = await page.getByTestId("article-row").count()
  const row = page.getByTestId("article-row").filter({ hasText: "Пептиды E2E" })
  await row.locator("button").last().click()
  await page.waitForTimeout(600)
  await page.getByRole("menuitem", { name: "Удалить" }).click()
  await page.waitForTimeout(900)
  await page.getByRole("button", { name: "Удалить" }).click()
  await page.waitForTimeout(3000)
  must("row-gone-from-list", await page.getByTestId("article-row").count(), before - 1)
  await new Promise((r) => setTimeout(r, 2500))
  must("deleted-address-is-404", await shopStatus(`/ru/journal/${RENAMED}`), 404)

  // ---------- уборка за собой: черновик этого прогона
  await page.goto(`${PANEL}/journal`, { waitUntil: "networkidle" })
  await page.waitForTimeout(1500)
  const draftRow = page.getByTestId("article-row").filter({ hasText: "Черновик E2E" })
  if (await draftRow.count()) {
    await draftRow.locator("button").last().click()
    await page.waitForTimeout(600)
    await page.getByRole("menuitem", { name: "Удалить" }).click()
    await page.waitForTimeout(900)
    await page.getByRole("button", { name: "Удалить" }).click()
    await page.waitForTimeout(2500)
  }
  note("cleanup-draft-removed", await draftRow.count())
} finally {
  writeFileSync(`${SHOTS}/../e2e-journal-results.json`, JSON.stringify(results, null, 2))
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} проверок прошли`)
process.exit(failed.length ? 1 : 0)
