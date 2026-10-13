// Build sections.json, themes.json, roles.json and signals.json from crawl.json (scripts/crawl.mjs output).
// map.json is hand-written (scripts/map-rows.mjs) and only checked here. Section names follow the Shopify line's
// vocabulary (templates/research-shopify, PR #353) wherever the type is the same, so the two catalogues merge.
// Usage: node build.mjs <crawl.json> <targets.json> <outDir>
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"
import { ROLES_BY_SECTION, ROLE_DEFS } from "./roles-table.mjs"
import { MAP } from "./map-rows.mjs"
const [crawlFile, targetsFile, out] = process.argv.slice(2)
const crawl = JSON.parse(fs.readFileSync(crawlFile, "utf8"))
const targets = JSON.parse(fs.readFileSync(targetsFile, "utf8"))
const here = path.dirname(fileURLToPath(import.meta.url))
const base16 = path.join(here, "..", "from-2026-09-16")

// ── InSales: widget type (class widget-type_system_widget_v4_<type>_<variant>) → section ──────────────────────────
const INSALES = {
  header: "header", footer: "footer", bottom_navigation_bar: "bottom-nav", callback_modal: "callback", preorder: "preorder",
  notification_add_to_cart: "cart-notification", button_on_top: "back-to-top", breadcrumbs: "breadcrumbs", page_title: "page-title",
  marquee: "scrolling-text", catalog: "main-collection-product-grid", heading: "rich-text", text: "rich-text", article_previews: "featured-blog",
  feedback: "contact-form", filter_sort: "collection-filters", sidebar_filter: "collection-filters", product: "main-product",
  product_info: "product-tabs", products_related: "related-products", products_similar: "related-products", stories: "stories",
  special_products: "featured-collection", special_products_tabs: "featured-collections-tabs", page_banner: "image-banner",
  promo_slider: "slideshow", slider: "slideshow", shops: "store-locations", subcollections: "collection-list", collections_on_index: "collection-list",
  collection_list: "collection-list", advantages: "multicolumn", benefits: "multicolumn", reviews: "testimonials", shop_reviews: "testimonials",
  video: "video", video_list: "video", faq: "collapsible-content", accordion: "collapsible-content", subscribe: "newsletter", newsletter: "newsletter",
  timer: "countdown", countdown: "countdown", image_text: "image-with-text", image_with_text: "image-with-text", gallery: "image-gallery",
  map: "store-locations", contacts: "contacts", brands: "logo-list", products_viewed: "recently-viewed", recently_viewed: "recently-viewed",
  compare: "compare", favorites: "wishlist", cart: "main-cart", search: "search-results", blog: "main-blog", article: "main-article",
  instagram: "image-gallery", promo_banner: "image-banner", banner: "image-banner", counter: "stats", numbers: "stats",
  pagination: "pagination", banner_top: "announcement-bar", collection_sort: "collection-filters", collections_and_subcollections: "collection-list",
  collections_menu: "collection-menu", sidebar_collections_menu: "collection-menu", sidebar_social: "social-links", special_categories: "collection-list",
  video_clip: "video", viewed_products: "recently-viewed", simple_text: "rich-text", infinity_products_button: "pagination",
  application_form: "newsletter", shop: "testimonials" // Vibe: «Отзывы клиентов» / «Получите скидку 20% на первый заказ · Подписаться»
}
const TECH_INSALES = /^(alerts|stiker_|sticker_|scripts|html|cookie|age_)/ // technical, not a visible section
const insalesBase = (code) => code.replace(/^(system_)?widget_v4_/, "").replace(/_[0-9a-f]{32}$/, "").replace(/(_\d+)+$/, "")

// ── heading rules shared by Tilda records and ambiguous InSales widgets (banner_list, html blocks) ─────────────────
const HEAD = [
  [/отзыв|reviews?\b|testimonial|говорят о нас/i, "testimonials"],
  [/частые вопросы|вопрос|faq/i, "collapsible-content"],
  [/как (сделать|оформить|заказать|мы работаем|купить)|этап|шаг[аи]? |how (to|it) /i, "steps"],
  [/оплата и доставка|доставка и оплата|доставк|delivery|shipping/i, "delivery-payment"],
  [/почему|преимуществ|выбирают|why (us|choose)|наши плюсы/i, "multicolumn"],
  [/соцсет|social|следите за нами/i, "social-links"],
  [/контакт|свяжитесь|где (нас найти|купить)|contacts?\b|адрес|\+\d[\d ()-]{6,}/i, "contacts"],
  [/партн[её]р|бренд|partners|brands/i, "logo-list"],
  [/подпис|рассылк|subscribe|newsletter|будьте в курсе/i, "newsletter"],
  [/блог|стать[ия]|журнал|новост|journal|blog|news/i, "featured-blog"],
  [/категори|разделы каталога|collections\b/i, "collection-list"],
  [/идеи для|instagram|инстаграм|лукбук|lookbook|@\w/i, "image-gallery"],
  [/о (магазине|нас|бренде|компании)|about|наша история|история бренда/i, "image-with-text"],
  [/скидк|промокод|акци|sale\b|\d+ ?%/i, "promo-banner"]
]
const byHeading = (h) => { if (!h) return null; for (const [rx, s] of HEAD) if (rx.test(h)) return s; return null }

// Set by hand after looking at the crop: the widget type says one thing, the shop uses it for another.
const MANUAL = {
  "Loft|home|system_widget_v4_benefits_3": "testimonials" // two buyer quotes with first names and photos, no heading
}

function classify(source, s, idx, all, pageKind, theme) {
  const manual = MANUAL[`${theme}|${pageKind}|${s.code}`]; if (manual) return manual
  if (source === "insales") {
    const b = insalesBase(s.code)
    if (TECH_INSALES.test(b)) return null
    if (b === "banner_list" || b === "banner_list_slider" || b === "html" || b === "custom") {
      if (/бренд|brand/i.test(s.h || s.text.slice(0, 40))) return "logo-list"
      if (s.n.collectionLinks >= 2) return "collection-list"
      return byHeading(s.h) || "promo-grid"
    }
    return INSALES[b] || "insales:" + b
  }
  // Tilda: record type numbers carry no public names, so the record is classified by its markup and heading.
  const code = s.code
  if (["T215", "T270", "T123", "T898"].includes(code) && s.textLen < 5) return null // anchor, scroll helper, raw html with nothing visible
  if (code === "T706") return "cart-drawer"
  if (code === "T1002") return "wishlist"
  if (/t-popup|t390|t702|t1093/.test(s.inner) && s.height === 0) return "popup"
  if (/t190__button|t190\b/.test(s.inner)) return "back-to-top"
  if (/\bt188\b|t-sociallinks/.test(s.inner)) return "social-links"
  const firstReal = all.findIndex((x) => !["T215", "T270", "T706", "T1002"].includes(x.code))
  if (idx === firstReal && (s.n.menu > 0 || /tmenu|t-menu|t1272|t228|t454|t446|t456|t257|t461|t462/.test(s.inner))) return "header"
  const visible = all.filter((x) => x.height > 0)
  if (s === visible[visible.length - 1] && (/©|все права|all rights/i.test(s.text) || s.textLen < 400)) return "footer"
  if (s.n.timer > 0) return "countdown"
  if (/t-catalog|t-store/.test(s.inner) || s.n.productLinks >= 4) return s.n.filter >= 10 || s.n.sort > 0 ? "main-collection-product-grid" : "featured-collection"
  if (/js-product-single/.test(s.inner)) return "featured-product"
  if (/t-slds/.test(s.inner) && s.n.img >= 2 && idx <= firstReal + 2) return "slideshow"
  if (s.n.form > 0 && s.n.textarea > 0) return "contact-form"
  if (s.n.form > 0 && s.n.email > 0 && s.n.tel === 0) return "newsletter"
  const h = byHeading(s.h)
  if (s.n.map > 0) return "store-locations"
  if (h === "social-links") return s.n.img >= 3 ? "image-gallery" : "social-links"
  if (h) return h
  if (s.n.price >= 20 && /t754|t776|t786|t1025|js-product/.test(s.inner)) return "featured-collection"
  if (s.n.video > 0) return "video"
  if (/t-cover/.test(s.inner) || (idx <= firstReal + 2 && s.height > 500)) return "image-banner"
  if (s.n.form > 0 && (s.n.tel > 0 || s.n.textarea > 0)) return "contact-form"
  if (s.n.img >= 2 && s.textLen > 0 && s.textLen < 80 && s.n.price === 0 && s.n.slider === 0) return "collection-list" // titled image tiles that link on
  if (s.n.slider > 0 && s.n.img >= 3) return s.textLen > 60 ? "slideshow" : "image-gallery"
  if (s.n.img >= 1 && s.textLen > 60) return "image-with-text"
  if (s.n.img >= 3) return "image-gallery"
  if (s.textLen > 30) return "rich-text"
  return null
}

// setting type from its observed value (InSales CSS custom properties, Tilda data-* and record classes)
function settingType(name, v) {
  const x = String(v).trim().replace(/^['"]|['"]$/g, "")
  if (/^(true|false)$/.test(x) || /^(hide|show|enable|disable|with|use)[-_]/.test(name) || /^(witharrows|withbullets|stretched|centered|fullscreen|imgleft|imgright|withshadow|with-arrows)$/.test(name)) return "checkbox"
  if (/^#[0-9a-f]{3,8}$/i.test(x) || /^(rgba?|hsla?|linear-gradient)\(/i.test(x) || /(^|[-_])(bg|color|colour)([-_]|$)/.test(name) && !/ratio|size/.test(name)) return "color"
  if (/^https?:\/\/.+\.(png|jpe?g|svg|webp|gif)(\?.*)?$/i.test(x) || /(^|[-_])(img|image|logo|icon)$/.test(name) && /^(https?:|url\(|\/)/.test(x)) return "image_picker"
  if (/^https?:\/\//.test(x)) return "url"
  if (/^-?\d+(\.\d+)?(px|rem|em|vw|vh|%|deg|s|ms|fr)?$/.test(x)) return "range"
  if (/^[a-z][a-z0-9-]{0,20}$/i.test(x)) return "select"
  return "text"
}

const sections = new Map() // key source|section → row
const themes = []
const signalsOut = []
const sourcesOut = []
const cropIndex = [] // home-page sections with their classification, for scripts/pick-shots.mjs
const kinds = ["home", "collection", "product"]
for (const t of targets) {
  const c = crawl[t.slug]; if (!c || !c.pages?.home?.sections?.length) continue
  const pages = {}
  for (const kind of kinds) {
    const p = c.pages[kind]; if (!p) { pages[kind] = []; continue }
    const list = []
    p.sections.forEach((s, idx) => {
      const sec = classify(t.source, s, idx, p.sections, kind, t.theme); if (!sec) return
      list.push(sec)
      if (kind === "home") cropIndex.push({ source: t.source, slug: t.slug, theme: t.theme, i: s.i, code: s.code, section: sec, height: s.height })
      const key = t.source + "|" + sec
      const row = sections.get(key) || { source: t.source, section: sec, roles: [], settings: new Map(), blocks: new Set(), themes: new Set(), frequency: 0, evidence: [] }
      row.themes.add(t.theme)
      row.blocks.add(t.source === "insales" ? "widget:" + s.code.replace(/^(system_)?widget_v4_/, "") : "record:" + s.code)
      for (const st of s.settings) {
        if (["record-type", "animationappear", "parenttplid", "already-loaded-first-products", "slider-initialized", "slider-totalslides", "slider-pos", "slider-cycle", "slider-animated", "input-ready", "input-lid", "field-async"].includes(st.name)) continue
        const prev = row.settings.get(st.name); row.settings.set(st.name, { name: st.name, type: prev?.type || settingType(st.name, st.value), n: (prev?.n || 0) + 1 })
      }
      if (row.evidence.length < 8 && !row.evidence.some((e) => e.theme === t.theme)) {
        const what = t.source === "insales" ? `widget ${s.code}` : `record ${s.code} (#${s.id})`
        row.evidence.push({ theme: t.theme, url: p.url, note: `${t.theme}, ${kind} page, ${what}, ${s.height} px high${s.h ? `, heading «${s.h.slice(0, 60)}»` : ""}; ${s.settings.length} settings read from the markup` })
      }
      sections.set(key, row)
    })
    pages[kind] = list
    for (const [sig, hits] of Object.entries(p.signals || {})) for (const hit of hits) {
      const s = p.sections[hit.i]; const sec = s ? classify(t.source, s, hit.i, p.sections, kind, t.theme) : null
      signalsOut.push({ source: t.source, theme: t.theme, page: kind, url: p.url, signal: sig, section: sec || (s ? "(technical) " + s.code : null), snippet: hit.snippet })
    }
  }
  // themes.json: price and notable from the 16.09 theme pages (InSales) or tilda-index.json (Tilda); styles from the niche
  let price = "?", notable = [], styles = []
  if (t.source === "insales") {
    const tsv = fs.readFileSync(path.join(base16, "templates-index.tsv"), "utf8").split("\n").map((l) => l.split("\t"))
    const row = tsv.find((r) => r[0] === "insales" && r[1] === t.theme)
    price = row ? row[5] + " (insales.ru theme page, 16.09.2026)" : "?"; styles = row ? [row[4]] : []
    notable.push("4th-generation InSales theme: the feature list on its theme page is word for word the same as the other nine")
  } else {
    const idx = JSON.parse(fs.readFileSync(path.join(base16, "tilda-index.json"), "utf8")).rows.find((r) => r.demo.endsWith("/" + t.slug))
    price = "included in a paid Tilda plan (tilda.cc/ru/tpls, 16.09.2026)"; styles = [idx?.category || "Интернет-магазин"]
    if (idx?.descr) notable.push(idx.descr)
    notable.push("one long page: catalogue, product popups (#!/tproduct/…), cart and checkout form all live on it")
  }
  const counts = {}; for (const s of pages.home) counts[s] = (counts[s] || 0) + 1
  for (const [s, n] of Object.entries(counts)) if (n >= 2 && !["rich-text"].includes(s)) notable.push(`${s} used ${n} times on the home page`)
  const rare = pages.home.filter((s) => ["stories", "callback", "preorder", "countdown", "store-locations", "steps", "delivery-payment", "featured-collections-tabs", "logo-list", "scrolling-text", "image-gallery", "video"].includes(s))
  if (rare.length) notable.push("has " + [...new Set(rare)].join(", "))
  themes.push({ theme: t.theme, price, pages: { home: pages.home, product: pages.product, collection: pages.collection }, styles, notable })
  const tsvRow = t.source === "insales" ? fs.readFileSync(path.join(base16, "templates-index.tsv"), "utf8").split("\n").map((l) => l.split("\t")).find((r) => r[0] === "insales" && r[1] === t.theme) : null
  sourcesOut.push({ source: t.source, theme: t.theme, page: t.source === "insales" ? tsvRow?.[2] || null : `https://tilda.cc/tpls/page/?q=${t.slug}`, demo: c.demo, crawled: Object.fromEntries(Object.entries(c.pages).map(([k, v]) => [k, { url: v.url, status: v.status }])) })
}

const rows = [...sections.values()].map((r) => {
  const roles = ROLES_BY_SECTION[r.section] || ["section-header", "content"]
  return {
    source: r.source, section: r.section, roles,
    settings: [...r.settings.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 40).map(({ name, type }) => ({ name, type })),
    blocks: [...r.blocks].sort(), themes: [...r.themes].sort(), frequency: r.themes.size,
    evidence: r.evidence.map(({ url, note }) => ({ url, note }))
  }
}).sort((a, b) => a.source.localeCompare(b.source) || b.frequency - a.frequency || a.section.localeCompare(b.section))

const usedRoles = new Set(rows.flatMap((r) => r.roles))
const roles = ROLE_DEFS.filter((d) => usedRoles.has(d.role)).map((d) => ({ ...d, sections: [...new Set(rows.filter((r) => r.roles.includes(d.role)).map((r) => r.section))] }))
const missing = [...usedRoles].filter((r) => !ROLE_DEFS.find((d) => d.role === r)); if (missing.length) { console.log("roles without a definition:", missing.join(" ")); process.exitCode = 1 }
const unknown = rows.filter((r) => r.section.includes(":")); if (unknown.length) console.log("unclassified:", unknown.map((r) => r.section).join(" "))

const found = new Set(rows.map((r) => r.section))
const map = MAP.filter((m) => found.has(m.section)).map(({ section, ours, gap, priority }) => ({ section, ours, gap, priority }))
const noRow = [...found].filter((s) => !MAP.find((m) => m.section === s)); if (noRow.length) { console.log("sections without a map row:", noRow.join(" ")); process.exitCode = 1 }
fs.writeFileSync(path.join(out, "map.json"), JSON.stringify(map, null, 1) + "\n")
fs.writeFileSync(path.join(out, "sections.json"), JSON.stringify(rows, null, 1) + "\n")
fs.writeFileSync(path.join(out, "themes.json"), JSON.stringify(themes, null, 1) + "\n")
fs.writeFileSync(path.join(out, "roles.json"), JSON.stringify(roles, null, 1) + "\n")
for (const t of targets.filter((x) => !crawl[x.slug]?.pages?.home?.sections?.length)) sourcesOut.push({ source: t.source, theme: t.theme, demo: t.demo, crawled: crawl[t.slug]?.pages || null, left_out: t.note || "no sections found" })
if (process.env.CROP_INDEX) fs.writeFileSync(process.env.CROP_INDEX, JSON.stringify(cropIndex, null, 1))
fs.writeFileSync(path.join(out, "sources.json"), JSON.stringify(sourcesOut, null, 1) + "\n")
fs.writeFileSync(path.join(out, "signals.json"), JSON.stringify(signalsOut, null, 1) + "\n")
console.log(`${rows.length} section rows (${rows.filter((r) => r.source === "insales").length} insales, ${rows.filter((r) => r.source === "tilda").length} tilda), ${themes.length} themes, ${roles.length} roles, ${signalsOut.length} signal hits`)
for (const r of rows) console.log(r.source.padEnd(8), String(r.frequency).padStart(2), r.section, "|", r.blocks.slice(0, 5).join(" "))
