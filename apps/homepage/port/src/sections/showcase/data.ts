// Verbatim copy of `this.showcase` (reference/dc-script.js:147-154) mapped through
// `renderVals()` (dc-script.js:264-265): { cat, eyebrow, title, desc, img, alt, url }.
// `nShowcase` is the rendered value of the dynamic `num.showcase` counter
// (dc-script.js:319-322) — see NOTES.md "Needs from merger".

export const nShowcase = "10";

export const eyebrowLabel = "· примеры";

export const heading = "Примеры магазинов";

export const description =
  "Пять витрин, собранных на том же решении, которое мы развернём вам: электроника, одежда, товары для дома, БАД и обувь. У каждой своя тема, свои шрифты и своя фотография — меняется оформление, а не движок.";

export interface ShowcaseCard {
  eyebrow: string;
  title: string;
  desc: string;
  img: string;
  alt: string;
  url: string;
}

export const cards: ShowcaseCard[] = [
  {
    eyebrow: "Электроника",
    title: "Магазин наушников",
    desc: "Тёмная витрина с предметной съёмкой: карточка товара, характеристики, корзина и оплата.",
    img: "/images/demo-electronics-20260910.webp",
    alt: "Главная страница демо-магазина наушников Ferrite: баннер и сетка категорий",
    url: "https://ferrite.upready.dev",
  },
  {
    eyebrow: "Одежда",
    title: "Магазин одежды",
    desc: "Размеры и цвета в одной карточке, сезонные подборки, быстрый чекаут.",
    img: "/images/demo-womens-fashion-20260910.webp",
    alt: "Главная страница демо-магазина одежды Larchant: баннер и сетка категорий",
    url: "https://larchant.upready.dev",
  },
  {
    eyebrow: "Дом",
    title: "Товары для дома",
    desc: "Витрина, где решает фотография: крупные кадры, спокойная типографика, минимум текста.",
    img: "/images/demo-home-goods-20260910.webp",
    alt: "Главная страница демо-магазина товаров для дома Long Morning",
    url: "https://long-morning.upready.dev",
  },
  {
    eyebrow: "БАД",
    title: "Магазин добавок",
    desc: "Состав и дозировки на видном месте, сертификат по номеру партии, простая навигация.",
    img: "/images/demo-supplements-20260910.webp",
    alt: "Главная страница демо-магазина пищевых добавок Scruple",
    url: "https://scruple.upready.dev",
  },
  {
    eyebrow: "Обувь",
    title: "Магазин кроссовок",
    desc: "Плотный каталог: фильтры по размеру и цвету, сортировка, подборки на главной.",
    img: "/images/demo-sneakers-20260910.webp",
    alt: "Главная страница демо-магазина кроссовок Kerbstone: баннер и каталог обуви",
    url: "https://kerbstone.upready.dev",
  },
];
