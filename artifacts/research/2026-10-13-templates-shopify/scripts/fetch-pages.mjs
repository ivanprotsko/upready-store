// Plain GET of each demo's product and collection page (URLs from the browser crawl) to classify sections offline.
// >=1.5 s between requests to a host; stop on 403/429. If the crawl found no product, take the first one from the collection HTML.
import fs from "node:fs"; import path from "node:path"
const [crawlJson, out] = process.argv.slice(2); const crawl = JSON.parse(fs.readFileSync(crawlJson, "utf8"))
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
const last = new Map(); const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(url) {
  const host = new URL(url).host; const w = 1500 - (Date.now() - (last.get(host) || 0)); if (w > 0) await sleep(w); last.set(host, Date.now())
  const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en" } }); const body = await r.text()
  fs.appendFileSync(path.join(out, "fetch-log.jsonl"), JSON.stringify({ at: new Date().toISOString(), url, final: r.url, status: r.status, bytes: body.length }) + "\n")
  if (r.status === 403 || r.status === 429) { console.log("STOP", r.status, url); process.exit(3) }
  return { status: r.status, url: r.url, body }
}
const urls = {}
for (const [slug, t] of Object.entries(crawl)) {
  urls[slug] = {}
  const c = t.pages.collection?.url || t.demo + "/collections/all"
  if (c) { const r = await get(c); fs.writeFileSync(path.join(out, `${slug}-collection.html`), r.body); urls[slug].collection = r.url
    let p = t.pages.product?.url
    if (!p) { const m = r.body.match(/href="(\/(?:[a-z-]+\/)?(?:collections\/[^"\/]+\/)?products\/[^"?#]+)/); if (m) p = new URL(m[1], t.demo).href }
    if (p) { const r2 = await get(p.split("?")[0]); fs.writeFileSync(path.join(out, `${slug}-product.html`), r2.body); urls[slug].product = r2.url }
  }
  console.log(slug, JSON.stringify(urls[slug]))
}
fs.writeFileSync(path.join(out, "urls.json"), JSON.stringify(urls, null, 1))
