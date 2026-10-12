// Classify every .shopify-section in saved HTML into a type hint. Exports hint(el) -> {hint, via}.
import { parseHTML } from "linkedom" // htmlparser2 underneath; node-html-parser silently dropped sections from raw Shopify HTML
const SKIP_TAGS = new Set(["link", "style", "script", "noscript", "svg", "path", "g", "template"])
// Dawn-family DOM signatures, checked in order (first match wins).
const DAWN_SIGS = [
  ["announcement-bar", (c, t) => c.has("announcement-bar") || c.has("utility-bar")],
  ["header", (c, t) => t.has("sticky-header") || c.has("header-wrapper") || c.has("header__heading")],
  ["footer", (c, t) => c.has("footer") && (c.has("footer__content-top") || c.has("footer__content-bottom"))],
  ["main-product", (c, t, el, page) => page === "product" && (c.has("product__info-wrapper") || t.has("product-info")) && /__main\b/.test(el.id)],
  ["featured-product", (c, t) => c.has("featured-product") || (t.has("product-info") && c.has("product--no-media")) ],
  ["related-products", (c, t) => t.has("product-recommendations") && c.has("related-products")],
  ["complementary-products", (c, t) => t.has("product-recommendations") && c.has("complementary-products")],
  ["main-collection-banner", (c) => c.has("collection-hero")],
  ["main-collection-product-grid", (c, t) => c.has("product-grid-container") || t.has("facet-filters-form") || c.has("facets-container")],
  ["slideshow", (c, t) => t.has("slideshow-component")],
  ["image-banner", (c) => c.has("banner") && c.has("banner__content")],
  ["collage", (c) => c.has("collage")],
  ["multirow", (c) => c.has("multirow")],
  ["image-with-text", (c) => c.has("image-with-text")],
  ["multicolumn", (c) => c.has("multicolumn")],
  ["video", (c) => c.has("video-section")],
  ["newsletter", (c) => c.has("newsletter")],
  ["email-signup-banner", (c) => c.has("email-signup-banner")],
  ["collapsible-content", (c) => c.has("collapsible-content")],
  ["collection-list", (c) => c.has("collection-list")],
  ["featured-blog", (c) => c.has("blog") || c.has("blog__posts") || c.has("blog-placeholder")],
  ["contact-form", (c) => c.has("contact")],
  ["rich-text", (c) => c.has("rich-text")],
  ["featured-collection", (c) => c.has("collection") && (c.has("product-grid") || c.has("product-card-wrapper"))],
  ["text-and-image", (c) => c.has("feature-row")],
  ["page", (c) => c.has("page-title")],
  ["apps", (c) => c.has("shopify-app-block")],
]
export function sectionsOf(html, page) {
  const { document } = parseHTML(html)
  return [...document.querySelectorAll(".shopify-section")].map((el, i) => {
    const cls = new Set(), tags = new Set(); let dst = el.getAttribute("data-section-type") || null
    for (const d of el.querySelectorAll("*")) {
      const t = d.tagName?.toLowerCase(); if (!t || SKIP_TAGS.has(t)) continue
      if (t.includes("-")) tags.add(t); dst ??= d.getAttribute("data-section-type") || null
      for (const c of (d.getAttribute("class") || "").split(/\s+/)) if (c) cls.add(c)
    }
    const wrap = el.getAttribute("class") || ""
    const key = el.id.replace(/^shopify-section-(template|sections)--\d+__/, "").replace(/^shopify-section-/, "")
    const group = (wrap.match(/shopify-section-group-([a-z-]+)/) || [])[1] || null
    const h = el.querySelector("h1,h2,h3")?.textContent.trim().replace(/\s+/g, " ").slice(0, 80) || null
    // Every candidate, strongest first: the theme's own wrapper class, the section key a preset gave it, data-section-type, then the Dawn DOM signature.
    const hints = []
    const m = wrap.match(/shopify-section--([a-z0-9-]+)/); if (m) hints.push({ hint: m[1], via: "wrapper class shopify-section--" + m[1] })
    const keyWord = key.replace(/_(?=[A-Za-z0-9]*[A-Z0-9])[A-Za-z0-9]{6}$/, "") // random 6-char suffix has a capital or digit; "_banner" is a word.replace(/_\d+$/, "")
    const keyIsWord = /[a-z]{3,}/.test(keyWord) && !/^[0-9a-f]{16,}$/.test(keyWord) && !/^[0-9a-f]{8}-/.test(keyWord)
    if (keyIsWord) hints.push({ hint: keyWord.replace(/_/g, "-"), via: "section key " + key })
    if (dst) hints.push({ hint: dst, via: "data-section-type=" + dst })
    for (const [type, f] of DAWN_SIGS) if (f(cls, tags, el, page)) { hints.push({ hint: type, via: "DOM signature (Dawn family)" }); break }
    const { hint = null, via = null } = hints[0] || {}
    return { i, key, group, hint, via, hints, h, wrap: wrap.replace(/\bshopify-section\b/, "").trim(), tags: [...tags].slice(0, 8), cls: [...cls].slice(0, 30) }
  })
}
