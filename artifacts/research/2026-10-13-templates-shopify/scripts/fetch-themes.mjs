// Fetch themes.shopify.com theme pages, one at a time, >=1.5 s apart; stop on 403/429. Usage: node fetch-themes.mjs <outDir> <slug...>
import fs from "node:fs"; import path from "node:path"
const [out, ...slugs] = process.argv.slice(2)
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
const log = path.join(out, "fetch-log.jsonl")
for (const slug of slugs) {
  const f = path.join(out, slug + ".html")
  if (fs.existsSync(f)) continue
  const url = `https://themes.shopify.com/themes/${slug}`
  const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en" }, redirect: "follow" })
  const body = await r.text()
  fs.appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), url, final: r.url, status: r.status, bytes: body.length }) + "\n")
  console.log(r.status, slug, r.url, body.length)
  if (r.status === 403 || r.status === 429) { console.log("STOP on", r.status); process.exit(3) }
  if (r.ok) fs.writeFileSync(f, body)
  await new Promise((s) => setTimeout(s, 1500))
}
