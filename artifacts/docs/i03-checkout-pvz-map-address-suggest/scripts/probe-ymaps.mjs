// Замер: отвечают ли ymaps.suggest и ymaps.geocode на ключ 2.1 (IVANPROTSKO_YANDEX_MAP_KEY_ONE).
// Ключ читается из канона и НИКОГДА не печатается.
import fs from "node:fs"
import { chromium } from "playwright"

const keys = fs.readFileSync("/Users/ivanprotsko/upready/.env.keys", "utf8")
const m = keys.match(/^IVANPROTSKO_YANDEX_MAP_KEY_ONE=(.+)$/m)
if (!m) { console.log("KEY: absent"); process.exit(1) }
const key = m[1].trim().replace(/^["']|["']$/g, "")
console.log("KEY: present, length", key.length)

const origin = process.argv[2] || "http://localhost:8000"
const browser = await chromium.launch()
const page = await browser.newPage()
page.on("console", (msg) => console.log("  [console]", msg.text().slice(0, 300)))

await page.route(`${origin}/probe`, (route) =>
  route.fulfill({ contentType: "text/html", body: "<!doctype html><title>probe</title><div id=m></div>" })
)
await page.goto(`${origin}/probe`)

const result = await page.evaluate(async (apikey) => {
  const out = {}
  await new Promise((resolve, reject) => {
    const s = document.createElement("script")
    s.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apikey)}&lang=ru_RU`
    s.onload = resolve
    s.onerror = () => reject(new Error("script error"))
    document.head.appendChild(s)
  })
  await new Promise((r) => window.ymaps.ready(r))
  out.apiLoaded = !!window.ymaps?.Map
  out.hasSuggest = typeof window.ymaps.suggest === "function"
  out.hasGeocode = typeof window.ymaps.geocode === "function"

  try {
    const s = await window.ymaps.suggest("Москва, Тверская", { results: 7 })
    out.suggest = { ok: true, count: s.length, first: s.slice(0, 3).map((x) => x.displayName) }
  } catch (e) { out.suggest = { ok: false, error: String(e?.message ?? e) } }

  try {
    const res = await window.ymaps.geocode("Москва, Тверская улица, 1", { results: 1 })
    const obj = res.geoObjects.get(0)
    out.geocode = obj
      ? { ok: true, text: obj.getAddressLine(), coords: obj.geometry.getCoordinates(),
          meta: (() => { const d = obj.properties.get("metaDataProperty").GeocoderMetaData.Address
                         return { postal: d.postal_code ?? null, comps: d.Components.map(c => `${c.kind}=${c.name}`) } })() }
      : { ok: true, empty: true }
  } catch (e) { out.geocode = { ok: false, error: String(e?.message ?? e) } }

  return out
}, key)

console.log(JSON.stringify(result, null, 2))
await browser.close()
