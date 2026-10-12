// Roles per section. Vocabulary: the ui-upready-dev-monorepo registry analyser
// (packages/registry-crawler/data/analysis/tier2-role-taxonomy.md, scripts/build-training-dataset.ts), taken as the
// Shopify line already resolved it (roles-shopify.json = templates/research-shopify roles.json, commit c70ff7ba), so
// both catalogues speak one vocabulary. Words the analyser lacks are extensions; the new ones are listed below.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"
const here = path.dirname(fileURLToPath(import.meta.url))
const shopify = JSON.parse(fs.readFileSync(path.join(here, "roles-shopify.json"), "utf8")).map(({ sections, ...d }) => d)

const EXT = [
  ["story-circle", "round story thumbnail that opens a full-screen story (InSales «Истории», Instagram-like)"],
  ["step", "numbered step of a «how to order» row: number, title, text"],
  ["payment-badge", "payment method mark: СБП, Мир, ЮKassa, Долями/Сплит, cards"],
  ["delivery-badge", "delivery service mark or line: СДЭК, Почта России, Boxberry, courier, pickup"],
  ["marketplace-badge", "link-badge to the same shop on Ozon, Wildberries, Яндекс Маркет"],
  ["one-click-buy", "«Купить в 1 клик» button that opens a name+phone form instead of the cart"],
  ["phone-form", "short form of name + phone (callback, preorder, one-click) sent to the manager"],
  ["map", "embedded map (Яндекс Карты, 2ГИС) with shop or pickup points"],
  ["bonus-badge", "bonus/cashback note on a card or in a bar («Дарим 5000 бонусов»)"],
  ["stock-badge", "in stock / out of stock / preorder marker on a product"],
  ["compare-toggle", "add-to-compare control on a product card"],
  ["wishlist-toggle", "add-to-favourites control on a product card"],
  ["drawer", "side panel over the page (cart, favourites)"]
].map(([role, note]) => ({ role, from: "extension", analyserNodes: null, inTaxonomy: false, note }))
// In the analyser's taxonomy (tier2-role-taxonomy.md §4 «Hero/Marketing roles — CONFIRMED») but not used by the Shopify line.
const MORE = ["stat", "stat-value", "stat-label"].map((role) => ({ role, from: "analyser", analyserNodes: null, inTaxonomy: true, note: "tier2-role-taxonomy.md §4, stats blocks" }))
export const ROLE_DEFS = [...shopify, ...MORE, ...EXT]

export const ROLES_BY_SECTION = {
  header: ["logo", "nav", "nav-link", "mobile-menu", "icon-button", "input"],
  footer: ["logo", "nav-column", "nav-link", "social-link", "legal-links", "payment-badge"],
  "bottom-nav": ["nav", "icon-button", "badge"],
  "scrolling-text": ["marquee", "description", "bonus-badge"],
  "announcement-bar": ["description", "nav-link", "trigger"],
  stories: ["section-header", "story-circle", "card-image", "dialog"],
  "collection-list": ["section-header", "card", "card-image", "card-title"],
  "logo-list": ["section-header", "brand-logo", "brand-slider"],
  "promo-grid": ["card", "card-image", "headline", "description", "cta-primary"],
  "promo-banner": ["hero-image", "headline", "description", "cta-primary"],
  "rich-text": ["heading", "description", "cta-primary"],
  "featured-collection": ["section-header", "product-card", "price", "badge", "stock-badge", "cta-secondary"],
  "featured-collections-tabs": ["section-header", "tab-list", "tab-trigger", "tab-content", "product-card", "price"],
  "image-banner": ["hero-image", "headline", "description", "cta-group", "cta-primary"],
  slideshow: ["hero-image", "headline", "description", "cta-primary", "trigger"],
  "featured-blog": ["section-header", "card", "card-image", "card-title", "description"],
  "contact-form": ["section-header", "form", "input", "label", "cta-primary"],
  callback: ["dialog", "phone-form", "input", "cta-primary", "close-button"],
  preorder: ["dialog", "phone-form", "input", "cta-primary", "close-button"],
  "cart-notification": ["dialog", "product-card", "price", "cta-primary", "cta-secondary"],
  "cart-drawer": ["drawer", "product-card", "price", "quantity-input", "form", "input", "cta-primary"],
  wishlist: ["drawer", "product-card", "price", "cta-primary"],
  "back-to-top": ["icon-button"],
  breadcrumbs: ["breadcrumb"],
  "page-title": ["heading"],
  "collection-filters": ["filter", "sort", "trigger"],
  "main-collection-product-grid": ["product-card", "price", "badge", "stock-badge", "filter", "sort", "pagination"],
  "main-product": ["media", "heading", "price", "variant-picker", "quantity-input", "cta-primary", "one-click-buy", "star-rating", "compare-toggle", "wishlist-toggle"],
  "product-tabs": ["tab-list", "tab-trigger", "tab-content"],
  "related-products": ["section-header", "product-card", "price"],
  "recently-viewed": ["section-header", "product-card", "price"],
  multicolumn: ["section-header", "feature-card", "icon-wrapper", "icon", "card-title", "description"],
  testimonials: ["section-header", "testimonial-card", "quote-text", "author-info", "star-rating"],
  "image-with-text": ["media", "heading", "description", "cta-primary"],
  "image-gallery": ["section-header", "media", "social-link"],
  video: ["video-player", "headline", "description"],
  "collapsible-content": ["section-header", "trigger", "content"],
  countdown: ["countdown", "heading", "description", "cta-primary"],
  newsletter: ["section-header", "newsletter-form", "input", "cta-primary"],
  contacts: ["section-header", "heading", "description", "social-link"],
  "store-locations": ["section-header", "map", "card", "description"],
  "delivery-payment": ["section-header", "feature-card", "delivery-badge", "payment-badge", "description", "trigger"],
  steps: ["section-header", "step", "card-title", "description"],
  popup: ["dialog", "close-button", "form", "cta-primary"],
  stats: ["stat", "stat-value", "stat-label"],
  compare: ["table", "table-row", "product-card"],
  "main-cart": ["product-card", "price", "quantity-input", "cta-primary"],
  "search-results": ["input", "product-card", "price"],
  "main-blog": ["card", "card-image", "card-title", "pagination"],
  "main-article": ["heading", "content", "media"],
  pagination: ["pagination", "trigger"],
  "collection-menu": ["nav", "nav-link"],
  "social-links": ["section-header", "social-link", "icon"],
  "featured-product": ["media", "heading", "price", "variant-picker", "cta-primary"]
}
