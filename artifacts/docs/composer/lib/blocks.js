// composer/lib/blocks.js — shared chrome + the P/H/F/G corridor variants as an ES module.
// source: blocks-lab/index.html @893d6f8, script lines 294-584, verbatim except for the leading
// `export` on every top-level binding; storeShell and the gallery click handler are re-cut below
// so the mode is a parameter and the listener is wired by the caller, not by the import.

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
export const media = (p, file) => `/media/${p.id}/${file}`
export const money = (n) => (n == null ? "" : "$" + n)
export const priceOf = (x) => esc(money(x.priceFrom)) + (x.priceTo !== x.priceFrom ? "–" + esc(money(x.priceTo)) : "")
export const countIn = (p, handle) => p.products.filter((x) => x.category === handle).length
export const clauses = (p) => (p.promo ? p.promo.split(" · ") : [])
export const withImage = (p) => p.products.filter((x) => x.image)
export const ratioClass = (p) => (p.aspect === "4:5" ? "r45" : "r11")
export const ICON = {
  burger: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  search: '<svg class="ico" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  user: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  bag: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 8h12l1 13H5L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  left: '<svg class="ico" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg class="ico" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
}

/* ---------- shared chrome: real content, same shapes as the storefront ---------- */
export const promoStrip = (p) => (p.promo ? `<div class="strip">${esc(p.promo)}</div>` : "")
export const utilities = (p, { search = true, region = true, user = true } = {}) => `<div class="util">
  ${search ? `<span class="desk">${ICON.search}</span>` : ""}
  ${region ? `<span class="desk">US · EN</span>` : ""}
  ${user ? `<span class="desk">${ICON.user}</span>` : ""}
  <span class="bag">${ICON.bag} 0</span></div>`
export const wordmark = (p) => `<a class="wordmark" href="#">${esc(p.brand.wordmark?.text ?? p.brand.name.toUpperCase())}</a>`
export const navLinks = (p, n = 4) => p.tiles.slice(0, n).map((t) => `<a href="#">${esc(t.label)}</a>`).join("") + `<a href="#">All products</a>`
export function defaultHeader(p) {
  return promoStrip(p) + `<header class="hd h1">
    <div class="side">${ICON.burger}</div>
    ${wordmark(p)}
    <div class="side r">${utilities(p)}</div>
  </header>`
}
export const kBand = (p) => {
  const cl = clauses(p)
  return `<section class="kband"><span class="eyebrow" style="color:inherit">${esc(p.brand.name)}</span>
    <h2>${esc(cl[0] ?? p.brand.tagline)}</h2><p>${esc(cl.slice(1).join(" · ") || p.brand.tagline)}</p>
    <a class="btn" href="#">${esc(p.hero?.cta?.label ?? "Shop now")}</a></section>`
}
export const tilesRow = (p) => `<section class="tiles" style="--n:${Math.min(p.tiles.length, 5)}"><div class="cap"><h3>Categories</h3><a class="linkish" href="#">View all</a></div>
  <div class="row">${p.tiles.slice(0, 5).map((t) => `<figure><div class="frame"><img src="${media(p, t.image)}" alt="" /></div><figcaption>${esc(t.label)}</figcaption></figure>`).join("")}</div></section>`
export function productCard(p, x, meta = "full") {
  if (meta === "min") return `<article class="card-p min"><div class="frame ${ratioClass(p)}"><img src="${media(p, x.image)}" alt="" /></div>
    <div class="t"><span>${esc(x.title)}</span><span class="pr">${esc(money(x.priceFrom))}</span></div></article>`
  return `<article class="card-p"><div class="frame ${ratioClass(p)}"><img src="${media(p, x.image)}" alt="" /></div>
    <div class="t">${esc(x.title)}</div><div class="s">${esc(x.subtitle ?? "")}</div><div class="pr">${priceOf(x)}</div></article>`
}
export const cap = (p, title, all = true) => `<div class="cap"><h3>${esc(title)}</h3>${all ? `<a class="linkish" href="#">See all →</a>` : ""}</div>`
export const rowBelow = (p, n = 4) => `<section class="block">${cap(p, p.collections[0]?.title ?? "In the shop")}<div class="grid" style="--cols:4">${withImage(p).slice(0, n).map((x) => productCard(p, x)).join("")}</div></section>`
export const lead = (p) => p.collections.find((c) => c.handle === "bestsellers" || c.handle === "the-foundation") ?? p.collections[0]
export function inCollection(p, coll, n) {
  const list = withImage(p).filter((x) => x.collections.includes(coll?.handle))
  return (list.length >= Math.min(n, 4) ? list : withImage(p)).slice(0, n)
}
export const topCats = (p) => {
  const roots = p.categories.filter((c) => !c.parent)
  return roots.length > 1 ? roots : p.categories.filter((c) => c.parent)
}
export const specLine = (x) => [x.colours ? `${x.colours} colourways` : null, x.variants > 1 ? `${x.variants} variants` : null].filter(Boolean).join(" · ")

/* ---------- the four families ---------- */
export const FAMILIES = [
  {
    key: "listing", name: "P · Выкладка товаров",
    core: {
      fn: "дать посетителю выбрать вещь: показать N настоящих товаров и один клик до каждого",
      roles: "кадр · название · цена (обязательные) · подзаголовок, характеристики, заголовок подборки, «see all» (по желанию)",
      rel: "кадр над (или слева от) названия, цена рядом с названием; один товар = одна карточка = одна ссылка",
    },
    axes: [
      { key: "geo", name: "геометрия", values: { grid4: "сетка 4", grid6: "плотная 6", list: "список", wall: "стена", editorial: "редакционная" } },
      { key: "meta", name: "плотность подписи", values: { full: "полная (название · подзаголовок · цена)", min: "минимальная (название · цена)", spec: "с характеристиками" } },
      { key: "group", name: "группировка", values: { coll: "по коллекции с заголовком", flat: "плоско" } },
      { key: "lead", name: "первая вещь", values: { even: "все равны", one: "одна крупно" } },
    ],
    filter: [
      "плотная 6 × полная подпись — шум, запрещено; плотная сетка живёт только с минимальной подписью",
      "список × плоско без заголовка — нечитаемо на длинных каталогах; список всегда с заголовком подборки",
      "стена × характеристики — нет места, запрещено; стена несёт только название и цену",
      "редакционная требует ≥ 5 товаров с кадром; кадр товара — из профиля (1:1 или 4:5), не ось",
    ],
    variants: [
      { key: "p1", name: "P1 · Сетка 4", axes: { geo: "grid4", meta: "full", group: "coll", lead: "even" },
        why: "Как storefront рендерит сегодня: четыре колонки, полная подпись, заголовок коллекции и «see all». Точка отсчёта коридора — всё остальное сравнивается с ней.",
        markup: (p) => `<section class="block listing p1">${cap(p, lead(p)?.title ?? "In the shop")}<div class="grid" style="--cols:4">${inCollection(p, lead(p), 8).map((x) => productCard(p, x)).join("")}</div></section>` },
      { key: "p2", name: "P2 · Плотная 6", axes: { geo: "grid6", meta: "min", group: "flat", lead: "even" },
        why: "Продаёт ширину ассортимента: двенадцать вещей на одном экране, подпись сведена к названию и цене. Для каталога из 12–15 позиций это почти весь магазин сразу.",
        markup: (p) => `<section class="block listing p2">${cap(p, `All ${p.products.length} products`, false)}<div class="grid" style="--cols:6">${withImage(p).slice(0, 12).map((x) => productCard(p, x, "min")).join("")}</div></section>` },
      { key: "p3", name: "P3 · Список", axes: { geo: "list", meta: "spec", group: "coll", lead: "even" },
        why: "Продаёт факты: подзаголовок и характеристики (варианты, расцветки) читаются как строка спецификации. Для Ferrite и Scruple, где решает состав и совместимость, а не силуэт.",
        markup: (p) => `<section class="block listing p3">${cap(p, lead(p)?.title ?? "In the shop")}<div class="rows">${inCollection(p, lead(p), 6).map((x) => `<div class="rowp">
          <div class="frame ${ratioClass(p)}"><img src="${media(p, x.image)}" alt="" /></div>
          <div><div class="t">${esc(x.title)}</div><div class="s">${esc(x.subtitle ?? "")}</div><div class="spec">${specLine(x).split(" · ").filter(Boolean).map((s) => `<span>${esc(s)}</span>`).join("")}</div></div>
          <div class="buy"><span class="pr">${priceOf(x)}</span><a class="btn ghost sm" href="#">Add to bag</a></div></div>`).join("")}</div></section>` },
      { key: "p4", name: "P4 · Стена", axes: { geo: "wall", meta: "min", group: "flat", lead: "even" },
        why: "Продаёт фотографию: три колонки разной высоты, подпись — одна строка под кадром. Работает у Larchant и Long Morning, где кадр и есть аргумент; у Scruple девять одинаковых банок превращаются в обои.",
        markup: (p) => `<section class="block listing p4">${cap(p, lead(p)?.title ?? "In the shop")}<div class="wall">${withImage(p).slice(0, 9).map((x, i) => `<article class="${["tall", "short", "mid"][i % 3]}">
          <div class="frame"><img src="${media(p, x.image)}" alt="" /></div><div class="cap2"><span>${esc(x.title)}</span><span class="pr">${esc(money(x.priceFrom))}</span></div></article>`).join("")}</div></section>` },
      { key: "p5", name: "P5 · Редакционная", axes: { geo: "editorial", meta: "full", group: "coll", lead: "one" },
        why: "Сначала одна вещь крупно с подзаголовком, ценой и «Add to bag», потом четыре малых. Продаёт вещь, а затем ширину — заменяет hero G, если магазин хочет обойтись без hero вовсе.",
        markup: (p) => { const [first, ...rest] = inCollection(p, lead(p), 5); return `<section class="block listing p5">${cap(p, lead(p)?.title ?? "In the shop")}<div class="ed">
          <article class="lead card-p"><div class="frame"><img src="${media(p, first.image)}" alt="" /></div><div class="pane"><h4>${esc(first.title)}</h4><div class="s">${esc(first.subtitle ?? "")}</div>
            <div class="buy"><span class="pr">${priceOf(first)}</span><a class="btn sm" href="#">Add to bag</a></div></div></article>
          ${rest.map((x) => productCard(p, x)).join("")}</div></section>` } },
    ],
    context: (p, block) => defaultHeader(p) + kBand(p) + block,
  },
  {
    key: "header", name: "H · Хедер",
    core: {
      fn: "сориентировать и провести: кто это (wordmark → главная), куда идти (категории), где я (регион · язык), что у меня (корзина с числом), поиск, аккаунт",
      roles: "wordmark · вход в категории · поиск · регион/язык · аккаунт · корзина (все обязательные; на 390 px поиск и аккаунт уходят в меню)",
      rel: "wordmark — якорь; корзина — крайняя справа; промо-полоса магазина всегда над шапкой (её рисует layout, не шапка)",
    },
    axes: [
      { key: "mark", name: "wordmark", values: { center: "по центру", left: "слева" } },
      { key: "nav", name: "категории", values: { burger: "за бургером", inline: "в строку", strip: "полосой ниже" } },
      { key: "tiers", name: "ярусов", values: { one: "один", two: "два (служебный + основной)" } },
      { key: "surface", name: "поверхность", values: { page: "страница", accent: "акцент бренда" } },
      { key: "h", name: "высота", values: { h52: "52", h64: "64", h68: "68" } },
    ],
    filter: [
      "wordmark по центру × категории в строку — при ≥ 4 категориях строка сталкивается с wordmark; центр живёт только с бургером или полосой",
      "поверхность акцент × hero K под ней — две акцентные плоскости встык, запрещено без разделителя (плитки или строка страницы между ними)",
      "два яруса × 390 px — служебный ярус сводится к промо-тексту, регион уходит в меню",
      "высота 52 × два яруса — невозможно, тонкая шапка одноярусная",
    ],
    variants: [
      { key: "h1", name: "H1 · Как сейчас", axes: { mark: "center", nav: "burger", tiers: "one", surface: "page", h: "h64" },
        why: "Storefront сегодня: бургер слева, wordmark по центру, справа поиск · регион · аккаунт · корзина. Категории только за бургером — на десктопе посетитель их не видит.",
        markup: (p) => defaultHeader(p) },
      { key: "h2", name: "H2 · Слева, меню в строку", axes: { mark: "left", nav: "inline", tiers: "one", surface: "page", h: "h64" },
        why: "Категории на виду: wordmark слева, строка категорий по центру, утилиты справа. Самая распространённая форма DTC-магазина; на 390 px строка уходит за бургер.",
        markup: (p) => promoStrip(p) + `<header class="hd h2"><div class="side" style="flex:0 0 auto">${wordmark(p)}</div><nav class="nav">${navLinks(p)}</nav><div class="side r" style="flex:0 0 auto">${utilities(p)}</div></header>` },
      { key: "h3", name: "H3 · Два яруса", axes: { mark: "left", nav: "inline", tiers: "two", surface: "page", h: "h68" },
        why: "Служебный ярус забирает условия и регион, основной остаётся чистым: wordmark, категории, поиск, корзина. Условия магазина при этом всегда на экране, а не в отдельной полосе.",
        markup: (p) => `<div class="h3"><div class="utilrow"><span>${esc(p.promo ?? p.brand.tagline)}</span><span class="r">US · EN · USD &nbsp;·&nbsp; Account</span></div>
          <header class="hd"><div class="side" style="flex:0 0 auto">${wordmark(p)}</div><nav class="nav" style="flex:1;justify-content:center">${navLinks(p)}</nav><div class="side r" style="flex:0 0 auto">${utilities(p, { region: false, user: false })}</div></header></div>` },
      { key: "h4", name: "H4 · Акцентная", axes: { mark: "left", nav: "inline", tiers: "one", surface: "accent", h: "h64" },
        why: "Шапка красится акцентом бренда тем же мостом, что CTA и блок K. Сильный брендовый жест, но по фильтру не может стоять прямо над K — здесь под ней плитки категорий.",
        markup: (p) => promoStrip(p) + `<header class="hd h4"><div class="side" style="flex:0 0 auto">${wordmark(p)}</div><nav class="nav" style="flex:1;justify-content:center">${navLinks(p)}</nav><div class="side r" style="flex:0 0 auto">${utilities(p)}</div></header>` },
      { key: "h5", name: "H5 · Тонкая + полоса категорий", axes: { mark: "left", nav: "strip", tiers: "one", surface: "page", h: "h52" },
        why: "Шапка 52 px только с wordmark, поиском и корзиной; категории — отдельной полосой фишек с числом товаров. На 390 px полоса прокручивается и остаётся видимой, чего не умеет ни одна другая форма.",
        markup: (p) => promoStrip(p) + `<div class="h5"><header class="hd h5"><div class="side" style="flex:0 0 auto">${wordmark(p)}</div><div class="side r">${utilities(p, { region: false, user: false })}</div></header>
          <div class="cats"><a class="all" href="#">All ${p.products.length}</a>${p.tiles.map((t) => `<a href="#">${esc(t.label)}<span class="n">${countIn(p, t.categoryHandle)}</span></a>`).join("")}</div></div>` },
    ],
    context: (p, block) => block + tilesRow(p) + rowBelow(p, 4),
  },
  {
    key: "footer", name: "F · Футер",
    core: {
      fn: "успокоить и довести: условия покупки, куда ещё пойти (категории, коллекции), кто продаёт (юрлицо), регион, чем сделано",
      roles: "wordmark · условия (из промо-строки профиля) · категории · коллекции · регион/язык · © юрлицо · powered by (все обязательные)",
      rel: "юридическая строка всегда последняя; wordmark — первый; ссылки группами, не потоком",
    },
    axes: [
      { key: "cols", name: "колонок", values: { four: "четыре", three: "три", row: "одна строка" } },
      { key: "mark", name: "масштаб wordmark", values: { small: "обычный", giant: "гигантский" } },
      { key: "surface", name: "поверхность", values: { page: "страница", muted: "приглушённая", inverted: "инверсия" } },
      { key: "news", name: "рассылка", values: { no: "нет", yes: "есть" } },
      { key: "facts", name: "условия", values: { list: "списком", tiles: "плитками" } },
    ],
    filter: [
      "одна строка × рассылка — нет места, запрещено",
      "одна строка × четыре группы ссылок на 390 px — переполнение; на мобильном строка складывается в две",
      "гигантский wordmark × инверсия — допустимо, но не с рассылкой (три акцента в одном блоке)",
      "условия плитками требуют ≥ 2 клауз в промо-строке профиля; иначе — списком",
    ],
    variants: [
      { key: "f1", name: "F1 · Четыре колонки", axes: { cols: "four", mark: "small", surface: "page", news: "no", facts: "list" },
        why: "Storefront сегодня: бренд, категории, коллекции, информация; внизу © и powered by. Точка отсчёта.",
        markup: (p) => footerF1(p) },
      { key: "f2", name: "F2 · Одна строка", axes: { cols: "row", mark: "small", surface: "muted", news: "no", facts: "list" },
        why: "Самый тихий: две строки на приглушённой плоскости, все ссылки в ряд. Для магазина из 12 позиций четыре колонки — пустые столбы; здесь футер не спорит с товаром.",
        markup: (p) => footerF2(p) },
      { key: "f3", name: "F3 · Гигантский wordmark", axes: { cols: "row", mark: "giant", surface: "page", news: "no", facts: "list" },
        why: "Последний экран — имя бренда во всю ширину дисплейным шрифтом темы; ссылки строкой над ним, юрлицо под. Брендовый жест ценой одного лишнего экрана прокрутки.",
        markup: (p) => footerF3(p) },
      { key: "f4", name: "F4 · Инверсия с рассылкой", axes: { cols: "four", mark: "small", surface: "inverted", news: "yes", facts: "list" },
        why: "Цвета страницы наоборот, слева подписка (заголовок — слоган бренда), справа три группы ссылок. Единственный вариант, где футер что-то просит у посетителя.",
        markup: (p) => footerF4(p) },
      { key: "f5", name: "F5 · Условия плитками", axes: { cols: "three", mark: "small", surface: "page", news: "no", facts: "tiles" },
        why: "Клаузы промо-строки — бесплатная доставка, возврат, сроки — становятся тремя карточками перед ссылками. Футер работает как последний аргумент, а не как оглавление.",
        markup: (p) => footerF5(p) },
    ],
    context: (p, block) => defaultHeader(p) + rowBelow(p, 4) + block,
  },
  {
    key: "gallery", name: "G · Hero как галерея",
    core: {
      fn: "показать ширину магазина с первого экрана и дать вход в каждую часть: несколько настоящих слайдов (категории с их кадрами), один активный, копия на плоской панели, CTA",
      roles: "≥ 3 слайда (кадр + название категории + число товаров) · активный слайд · копия на плоскости · CTA · переключение (стрелки/клик)",
      rel: "копия никогда не лежит на фотографии (урок круга 2); соседние слайды видны, но подчинены активному",
    },
    axes: [
      { key: "neigh", name: "соседи", values: { peek: "выглядывают по краям", strips: "все сразу, полосами" } },
      { key: "panel", name: "панель копии", values: { beside: "рядом с кадром", below: "под кадром" } },
      { key: "move", name: "переключение", values: { arrows: "стрелки + точки", click: "клик по полосе" } },
      { key: "auto", name: "автопрокрутка", values: { no: "нет" } },
    ],
    filter: [
      "копия на кадре — запрещено в любой точке коридора (именно так провалился круг 1)",
      "автопрокрутка — запрещена: движение без действия посетителя ломает замер контраста и чтение",
      "полосы × > 6 слайдов — полосы уже 60 px, подпись не читается; полосы живут с 3–6 категориями",
      "выглядывание × 390 px — соседям нет места, слайд занимает всю ширину, панель уходит под кадр",
    ],
    variants: [
      { key: "ga", name: "GA · Карусель с соседями", axes: { neigh: "peek", panel: "beside", move: "arrows", auto: "no" },
        why: "Активный слайд занимает 84 % ширины: кадр категории слева, плоская панель с названием, числом товаров и CTA справа; предыдущий и следующий выглядывают по 8 % с каждого края, приглушённые плоской вуалью цвета страницы. Стрелки и точки переключают.",
        markup: (p) => galleryA(p) },
      { key: "gb", name: "GB · Полосы", axes: { neigh: "strips", panel: "below", move: "click", auto: "no" },
        why: "Все категории видны сразу как вертикальные полосы с подписью на плоской плашке; одна развёрнута и держит копию под кадром. Клик по полосе разворачивает её, активная сужается — место под копию переходит к новой.",
        markup: (p) => galleryB(p) },
    ],
    context: (p, block) => defaultHeader(p) + block + rowBelow(p, 4),
  },
]

/* ---------- footer variants ---------- */
export const legalLine = (p) => `<span>© 2026 ${esc(p.brand.legalName ?? p.brand.name)}. All rights reserved.</span>`
export const linkList = (items, key = "name") => `<ul>${items.map((i) => `<li><a href="#">${esc(i[key] ?? i.title)}</a></li>`).join("")}</ul>`
export const factsList = (p) => `<ul>${clauses(p).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`
export function footerF1(p) {
  return `<footer class="ft f1"><div class="cols">
    <div class="brand">${wordmark(p)}<p>${esc(p.brand.tagline)}</p></div>
    <div><h5>Categories</h5>${linkList(topCats(p))}</div>
    <div><h5>Collections</h5>${linkList(p.collections, "title")}</div>
    <div><h5>Information</h5>${factsList(p)}</div></div>
    <div class="legal">${legalLine(p)}<div class="l"><span>US · EN · USD</span><span>Powered by Medusa</span></div></div></footer>`
}
export function footerF2(p) {
  return `<footer class="ft f2"><div class="line">${wordmark(p)}<span class="links">${topCats(p).map((c) => `<a href="#">${esc(c.name)}</a>`).join("")}${p.collections.map((c) => `<a href="#">${esc(c.title)}</a>`).join("")}</span></div>
    <div class="legal">${legalLine(p)}<div class="l">${clauses(p).map((c) => `<span>${esc(c)}</span>`).join("")}<span>US · EN · USD</span><span>Powered by Medusa</span></div></div></footer>`
}
export function footerF3(p) {
  return `<footer class="ft f3"><div class="top"><span class="links">${topCats(p).map((c) => `<a href="#">${esc(c.name)}</a>`).join("")}${p.collections.map((c) => `<a href="#">${esc(c.title)}</a>`).join("")}</span><span class="links">${clauses(p).map((c) => `<span>${esc(c)}</span>`).join("")}</span></div>
    <div class="giant">${esc(p.brand.wordmark?.text ?? p.brand.name.toUpperCase())}</div>
    <div class="legal" style="margin-top:14px">${legalLine(p)}<div class="l"><span>US · EN · USD</span><span>Powered by Medusa</span></div></div></footer>`
}
export function footerF4(p) {
  return `<footer class="ft f4"><div class="cols">
    <div class="news"><h4>${esc(p.brand.tagline)}</h4><form onsubmit="return false"><input type="email" placeholder="Email" /><a class="btn" href="#">Subscribe</a></form></div>
    <div><h5>Categories</h5>${linkList(topCats(p))}</div>
    <div><h5>Collections</h5>${linkList(p.collections, "title")}</div>
    <div><h5>Information</h5>${factsList(p)}</div></div>
    <div class="legal">${legalLine(p)}<div class="l"><span>US · EN · USD</span><span>Powered by Medusa</span></div></div></footer>`
}
export function footerF5(p) {
  const cl = clauses(p)
  return `<footer class="ft f5"><div class="facts" style="--n:${Math.min(cl.length, 3)}">${cl.slice(0, 3).map((c, i) => `<div class="fact"><div class="n">0${i + 1}</div><div class="c">${esc(c)}</div></div>`).join("")}</div>
    <div class="links"><div>${wordmark(p)}</div><div><h5>Categories</h5>${linkList(topCats(p))}</div><div><h5>Collections</h5>${linkList(p.collections, "title")}</div></div>
    <div class="legal">${legalLine(p)}<div class="l"><span>US · EN · USD</span><span>Powered by Medusa</span></div></div></footer>`
}

/* ---------- gallery variants ---------- */
export const slides = (p) => p.tiles.slice(0, 5).map((t) => ({ label: t.label, image: t.image, n: countIn(p, t.categoryHandle) }))
export function galleryA(p) {
  const s = slides(p)
  return `<section class="gal ga" data-gal="ga" data-i="0" data-n="${s.length}">
    <div class="lead"><span class="cnt"><b>${esc(p.brand.name)}</b> · ${s.length} categories · <span data-pos>1</span>/${s.length}</span>
      <div class="arrows"><button data-ga-prev aria-label="previous">${ICON.left}</button><button data-ga-next aria-label="next">${ICON.right}</button></div></div>
    <div class="viewport"><div class="track">${s.map((x, i) => `<article class="slide${i === 0 ? " on" : ""}">
      <div class="frame"><img src="${media(p, x.image)}" alt="" /></div>
      <div class="pane"><span class="eyebrow">${esc(p.brand.name)}</span><h2>${esc(x.label)}</h2><p>${x.n} products · ${esc(p.brand.tagline)}</p><a class="btn" href="#">Shop ${esc(x.label.toLowerCase())}</a></div>
      <div class="dim"></div></article>`).join("")}</div></div>
    <div class="dots">${s.map((_, i) => `<i class="${i === 0 ? "on" : ""}"></i>`).join("")}</div></section>`
}
export function galleryB(p) {
  const s = slides(p)
  return `<section class="gal gb" data-gal="gb"><div class="lead"><span class="cnt"><b>${esc(p.brand.name)}</b> · ${s.length} categories · click a strip</span></div>
    <div class="strips">${s.map((x, i) => `<article class="strip${i === 0 ? " on" : ""}" data-gb-strip>
      <div class="frame"><img src="${media(p, x.image)}" alt="" /></div>
      <div class="tag"><span>${esc(x.label)} <span class="n">· ${x.n}</span></span></div>
      <div class="pane"><div><h2>${esc(x.label)}</h2><p>${x.n} products · ${esc(p.brand.tagline)}</p></div><a class="btn" href="#">Shop ${esc(x.label.toLowerCase())}</a></div>
    </article>`).join("")}</div></section>`
}
export function moveA(section, delta) {
  const n = Number(section.dataset.n)
  const i = (Number(section.dataset.i) + delta + n) % n
  section.dataset.i = String(i)
  const track = section.querySelector(".track")
  const mobile = document.body.dataset.width === "mobile"
  const vw = section.querySelector(".viewport").clientWidth
  const slideW = mobile ? vw : vw * 0.84
  const gap = 14
  const offset = mobile ? 0 : (vw - slideW) / 2
  track.style.transform = `translateX(${-(i * (slideW + gap)) + offset}px)`
  section.querySelectorAll(".slide").forEach((el, k) => el.classList.toggle("on", k === i))
  section.querySelectorAll(".dots i").forEach((el, k) => el.classList.toggle("on", k === i))
  section.querySelector("[data-pos]").textContent = String(i + 1)
}

/* ---------- re-cut for the composer ---------- */
export function wireGalleries(root = document) {
  root.addEventListener("click", (event) => {
    const next = event.target.closest("[data-ga-next]"), prev = event.target.closest("[data-ga-prev]")
    if (next || prev) return moveA(event.target.closest("[data-gal]"), next ? 1 : -1)
    const strip = event.target.closest("[data-gb-strip]")
    if (strip && !strip.classList.contains("on")) {
      for (const s of strip.parentElement.children) s.classList.toggle("on", s === strip)
    }
  })
}
export function storeShell(p, mode, inner) {
  const tokens = p.modes[mode].tokens
  const vars = Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(";")
  return `<div class="store" style="${vars};--font-display:'${p.typography.display}',ui-sans-serif,system-ui,serif;--font-body:'${p.typography.body}',ui-sans-serif,system-ui,sans-serif">${inner}</div>`
}
