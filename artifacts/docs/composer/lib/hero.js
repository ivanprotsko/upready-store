// composer/lib/hero.js — the six round-2 hero variants as an ES module.
// source: hero-lab-2/index.html @2211183, script lines 272-283 (pickHeadliner, pickShelf) and
// 297-385 (heroMarkup), verbatim; helpers come from blocks.js so both labs render from one set.
import { esc, media, money, countIn, clauses } from "./blocks.js"

function pickHeadliner(p) {
  const best = p.collections.find((c) => c.handle === "bestsellers" || c.handle === "the-foundation")
  const inBest = p.products.filter((x) => x.collections.includes(best?.handle))
  const pool = inBest.length ? inBest : p.products
  return { product: pool.find((x) => x.image) ?? pool[0], collection: best ?? p.collections[0] }
}
function pickShelf(p) {
  const { collection } = pickHeadliner(p)
  const inColl = p.products.filter((x) => x.image && x.collections.includes(collection?.handle))
  const pool = inColl.length >= 3 ? inColl : p.products.filter((x) => x.image)
  return pool.slice(0, 3)
}

export function heroMarkup(key, p) {
  const { product, collection } = pickHeadliner(p)
  const cl = clauses(p)

  if (key === "g") {
    return `<div class="hero g">
      <div class="pane">
        <span class="eyebrow">${esc(collection?.title ?? p.brand.name)}</span>
        <h2>${esc(product.title)}</h2>
        <p>${esc(product.subtitle ?? "")}</p>
        <div class="buyline"><span class="price">${esc(money(product.priceFrom))}</span>
          ${cl[0] ? `<span class="meta">${esc(cl[0])}</span>` : ""}</div>
        <div class="actions"><a class="btn" href="#">Add to bag</a>
          <a class="linkish" href="#">See all ${esc(product.category?.replace(/-/g, " ") ?? "products")} →</a></div>
      </div>
      <div class="shot">${product.image ? `<img src="${media(p, product.image)}" alt="" />` : ""}</div>
    </div>`
  }

  if (key === "h") {
    const shelf = pickShelf(p)
    return `<div class="hero h">
      <div class="shelf">
        ${shelf.map((x) => `<figure><img src="${media(p, x.image)}" alt="" /></figure>`).join("")}
      </div>
      <div class="pane">
        ${cl[0] ? `<span class="badge">${esc(cl[0])}</span>` : ""}
        <h2>${esc(collection?.title ?? p.brand.name)}</h2>
        <p>${esc(p.brand.tagline)}</p>
        <div class="buyline"><span class="price">from ${esc(money(Math.min(...shelf.map((x) => x.priceFrom))))}</span></div>
        <a class="btn" href="#">Shop ${esc((collection?.title ?? "the shop").toLowerCase())}</a>
      </div>
    </div>`
  }

  if (key === "j") {
    const doors = p.tiles.slice(0, 3)
    return `<div class="hero j" style="--doors:${doors.length}">
      <div class="lead">
        <div><span class="eyebrow">${esc(p.brand.name)}</span><h2>${esc(p.brand.tagline)}</h2></div>
        <a class="linkish" href="#">All ${p.products.length} products →</a>
      </div>
      <div class="doors">${doors.map((t) => `
        <figure>
          <div class="frame"><img src="${media(p, t.image.replace(/^media\//, ""))}" alt="" /></div>
          <figcaption>${esc(t.label)}<span class="n">${countIn(p, t.categoryHandle)} items</span></figcaption>
        </figure>`).join("")}
      </div>
    </div>`
  }

  if (key === "k") {
    return `<div class="hero k">
      <span class="eyebrow">${esc(p.brand.name)}</span>
      <h2>${esc(cl[0] ?? p.brand.tagline)}</h2>
      <p>${esc(cl.slice(1).join(" · ") || p.brand.tagline)}</p>
      <a class="btn" href="#">${esc(p.hero?.cta?.label ?? "Shop now")}</a>
    </div>`
  }

  if (key === "l") {
    const frame = p.frames.person[0] ?? p.frames.room[0] ?? null
    if (!frame) {
      return `<div class="hero l"><div class="missing">
        <strong>У ${esc(p.brand.name)} нет такого кадра</strong>
        <span>${esc(p.frames.note)} Этот вариант нельзя показать честно, пока не снят кадр с человеком или в среде.</span>
      </div></div>`
    }
    return `<div class="hero l">
      <img src="${media(p, frame)}" alt="" />
      <div class="card">
        <span class="eyebrow">${esc(collection?.title ?? p.brand.name)}</span>
        <h2>${esc(product.title)}</h2>
        <p>${esc(product.subtitle ?? "")}</p>
        <div class="buyline"><span class="price">${esc(money(product.priceFrom))}</span>
          <a class="btn" href="#">Add to bag</a></div>
      </div>
    </div>`
  }

  if (key === "m") {
    const news = p.collections.find((c) => c.handle === "new-arrivals") ?? p.collections[0]
    return `<div class="hero m">
      <div class="line"><span>${esc(p.brand.tagline)}</span><span>${esc(p.promo ?? "")}</span></div>
      <h2>${esc(news?.title ?? "In the shop")}</h2>
    </div>`
  }
  return ""
}

/** Names as they stand in hero-lab-2 and in artifacts/docs/hero-variants-collection.md. */
export const HERO_VARIANTS = [
  { key: "g", name: "G · Витрина" },
  { key: "h", name: "H · Полка" },
  { key: "j", name: "J · Три двери" },
  { key: "k", name: "K · Объявление" },
  { key: "l", name: "L · В движении" },
  { key: "m", name: "M · Без hero" },
]
