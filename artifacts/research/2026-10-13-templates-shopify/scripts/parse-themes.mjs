// Parse saved theme store pages into {slug,name,price,tagline,by,features{cat:[]},presets[],demo,version}. No reviews or reviewer names.
import fs from "node:fs"; import path from "node:path"
const dir = process.argv[2]; const out = process.argv[3]
const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
const rows = []
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".html"))) {
  const slug = f.replace(".html", ""); let s = fs.readFileSync(path.join(dir, f), "utf8")
  const demo = (s.match(/https:\/\/[a-z0-9-]+\.myshopify\.com\/?/) || [])[0] || null
  const presets = [...new Set([...s.matchAll(new RegExp(`/themes/${slug}/presets/([a-z0-9-]+)`, "g"))].map((m) => m[1]))]
  s = s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "")
  const lines = unesc(s.replace(/<[^>]+>/g, "\n")).split("\n").map((l) => l.trim()).filter((l) => l && !/[#\[\]{}=]|tw-|class=|aria-|"/.test(l))
  const iOv = lines.indexOf("Overview"); const name = lines[iOv - 1]
  const iTry = lines.indexOf("Try theme", iOv); const head = lines.slice(iTry + 1, iTry + 8)
  // head: [name, price, tagline, "by", vendor, ...]
  const paid = head[2] === "USD"; const price = paid ? head[1] + " USD" : head[1]; const tagline = paid ? head[3] : head[2]; const byAt = head.indexOf("by"); const by = byAt >= 0 ? head[byAt + 1] : null
  const iF = lines.indexOf("Features", lines.indexOf("WHAT'S INCLUDED")); const iR = lines.indexOf("Reviews", iF)
  const feat = lines.slice(iF + 1, iR); const cats = ["Cart and checkout", "Marketing and conversion", "Merchandising", "Product discovery"]
  const features = {}; let cur = null; const seen = new Set()
  for (const l of feat) { if (cats.includes(l) || /^[A-Z][a-z]+( [a-z]+)* and [a-z]+$/.test(l) && !features[l] && cats.includes(l)) { cur = l; features[cur] ??= []; continue } if (cur && !seen.has(cur + l)) { seen.add(cur + l); features[cur].push(l) } }
  const vi = lines.findIndex((l) => /^Version \d/.test(l))
  rows.push({ slug, name, price, tagline, by, demo, presets, features, version: vi >= 0 ? lines[vi].replace("Version ", "") : null, sourceUrl: `https://themes.shopify.com/themes/${slug}` })
}
fs.writeFileSync(out, JSON.stringify(rows, null, 1))
for (const r of rows) console.log(r.slug, "|", r.name, "|", r.price, "|", r.by, "|", r.demo, "|", r.presets.join(","), "|", Object.entries(r.features).map(([k, v]) => k + ":" + v.length).join(" "), "|", r.version, "|", r.tagline)
