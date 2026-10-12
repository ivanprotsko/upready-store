// Copy the chosen home shots and one crop per frequent section (one per source where both have it) into shots/.
// No browser here: the images were taken by crawl.mjs. Usage: node pick-shots.mjs <crawl outDir> <crop-index.json> <folder>
import fs from "node:fs"; import path from "node:path"
const [crawlDir, indexFile, folder] = process.argv.slice(2)
const HOME = { insales: ["cream", "minimalism", "base", "bubble", "fine", "grand", "moon", "stories"], tilda: ["plantsshopru", "homegoodsru", "jewelryru", "furnitureru", "shetukaru", "floristsru", "mythsru", "cannyonlinestoreru"] }
const HIDDEN = new Set(["callback", "preorder", "cart-notification", "cart-drawer", "wishlist", "back-to-top", "bottom-nav", "popup"])
const homeDir = path.join(folder, "shots/home"), secDir = path.join(folder, "shots/sections")
fs.mkdirSync(homeDir, { recursive: true }); fs.mkdirSync(secDir, { recursive: true })
for (const [src, slugs] of Object.entries(HOME)) for (const slug of slugs) for (const w of [1280, 360]) {
  const f = `${src}-${slug}-${w}.jpg`; fs.copyFileSync(path.join(crawlDir, "full", f), path.join(homeDir, f))
}
const sections = JSON.parse(fs.readFileSync(path.join(folder, "sections.json"), "utf8"))
const freq = {}; for (const s of sections) freq[s.section] = (freq[s.section] || 0) + s.frequency
const top15 = Object.entries(freq).filter(([s]) => !HIDDEN.has(s)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 15).map(([s]) => s)
// and the sections the report's build list names, so every listed block has a picture of the original
const EXTRA = ["stories", "scrolling-text", "featured-collections-tabs", "steps", "delivery-payment", "testimonials", "store-locations", "contacts", "image-with-text", "collapsible-content", "image-gallery", "newsletter", "contact-form", "featured-blog", "video", "promo-banner"]
const top = [...top15, ...EXTRA.filter((s) => freq[s] && !top15.includes(s))]
// collection/product-page sections are cropped by crop-pages.mjs into <crawl outDir>/../crops2 under their final names
const extraDir = path.join(crawlDir, "..", "crops2")
if (fs.existsSync(extraDir)) for (const f of fs.readdirSync(extraDir).filter((f) => f.endsWith(".jpg"))) fs.copyFileSync(path.join(extraDir, f), path.join(secDir, f))
const idx = JSON.parse(fs.readFileSync(indexFile, "utf8"))
const crops = fs.readdirSync(path.join(crawlDir, "sec"))
const picked = []
top.forEach((sec, n) => {
  for (const src of ["insales", "tilda"]) {
    // a crop of moderate height with the most bytes (most content), from a shop that also has home shots first
    const cands = idx.filter((x) => x.section === sec && x.source === src && x.height >= 60 && x.height <= 1800)
      .map((x) => ({ ...x, file: crops.find((f) => f === `${src}-${x.slug}--${String(x.i).padStart(2, "0")}--${x.code}.jpg`) })).filter((x) => x.file)
      .map((x) => ({ ...x, bytes: fs.statSync(path.join(crawlDir, "sec", x.file)).size, shot: HOME[src].includes(x.slug) }))
      .sort((a, b) => (b.shot - a.shot) || (b.bytes - a.bytes))
    const c = cands[0]; if (!c) continue
    const to = `${String(n + 1).padStart(2, "0")}-${sec}--${src}-${c.slug}.jpg`
    fs.copyFileSync(path.join(crawlDir, "sec", c.file), path.join(secDir, to)); picked.push({ to, from: c.file, height: c.height })
  }
})
for (const p of picked) console.log(p.to, "<-", p.from, p.height + "px")
console.log(picked.length, "crops for", top.length, "sections:", top.join(" "))
