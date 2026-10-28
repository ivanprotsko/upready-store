// Mock Medusa backend for the t22 region popup stand: one tenant, cherkashino-com-like.
import http from "node:http"
const REDIRECTS = process.env.NO_REDIRECTS ? [] : [{ country: "ru", url: "https://cherkashino.ru/" }]
const region = (id, cur, isos) => ({ id, name: id, currency_code: cur, countries: isos.map((iso_2) => ({ iso_2, display_name: iso_2.toUpperCase() })), payment_providers: [] })
const REGIONS = [region("reg_rub", "rub", ["ru"]), region("reg_usd", "usd", ["us"]), region("reg_kzt", "kzt", ["kz"])]
const seen = new Set()
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  const send = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }
  const p = url.pathname
  if (p === "/storefront/by-host") return send(200, {
    tenant: { handle: "cherkashino-com", name: "Cherkashino" }, publishable_key: "pk_mock",
    theme: process.env.MODE ? { preset: null, mode: process.env.MODE } : null, primary_host: url.searchParams.get("host"),
    locale: { default_locale: "en", enabled_locales: ["en", "ru"], default_country: "us" },
    promo_code: { enabled: true }, region_redirects: REDIRECTS,
  })
  if (p === "/store/regions") return send(200, { regions: REGIONS, count: REGIONS.length })
  if (p.startsWith("/store/regions/")) return send(200, { region: REGIONS.find((r) => r.id === p.split("/")[3]) ?? REGIONS[1] })
  if (p === "/store/customers/me") return send(401, { message: "Unauthorized" })
  if (p === "/store/tenant/home" || p === "/store/tenant/seller" || p === "/store/telegram-bot") return send(404, { message: "Not found" })
  if (!seen.has(p)) { seen.add(p); console.log("mock: generic", req.method, p) }
  const key = p.split("/").filter(Boolean).pop()?.replace(/-/g, "_") ?? "items"
  send(200, { ...(key.endsWith("s") ? { [key]: [] } : {}), products: [], collections: [], product_categories: [], count: 0, offset: 0, limit: 0 })
}).listen(9100, () => console.log("mock backend on 9100"))
