// Замер: отвечает ли /calculator/tarifflist на from/to, заданные ИМЕНЕМ города.
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
const env = {}
for (const l of readFileSync(path.join(homedir(), "upready/.env.keys"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l); if (m) env[m[1]] = m[2].trim()
}
const BASE = "https://api.edu.cdek.ru/v2"
const auth = await (await fetch(`${BASE}/oauth/token?parameters`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "client_credentials", client_id: env.CDEK_API_ACCOUNT, client_secret: env.CDEK_API_PASSWORD }),
})).json()
console.log("oauth:", auth.access_token ? `ok (${auth.expires_in}s)` : JSON.stringify(auth).slice(0, 200))
const call = async (label, from, to) => {
  const r = await fetch(`${BASE}/calculator/tarifflist`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${auth.access_token}` },
    body: JSON.stringify({ type: 1, currency: 1, lang: "rus", from_location: from, to_location: to, packages: [{ weight: 1000 }] }),
  })
  const t = await r.text()
  let tariffs = null
  try { tariffs = (JSON.parse(t).tariff_codes ?? []).length } catch {}
  console.log(`${label}: HTTP ${r.status} тарифов=${tariffs} ${r.ok ? "" : t.slice(0, 220)}`)
}
await call("по ИМЕНИ  {city:'Москва'} → {city:'Москва'}", { city: "Москва" }, { city: "Москва" })
await call("по ИМЕНИ  Москва → Новосибирск", { city: "Москва" }, { city: "Новосибирск" })
await call("по КОДУ   44 → 44", { code: 44 }, { code: 44 })
await call("по КОДУ   44 → 270 (Новосибирск)", { code: 44 }, { code: 270 })
