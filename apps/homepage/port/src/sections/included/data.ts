// Verbatim copy + fixture text extracted from reference/dc-script.js (the `included` array,
// lines ~381-390) and reference/rendered/07-included.html (the rendered mock-illustration copy).

export const EYEBROW_NUMBER = '05';
export const EYEBROW_LABEL = 'состав';
export const HEADING = 'Что вы получаете';
export const FOOTER_NOTE =
  'Это готовое решение, которое мы разворачиваем и настраиваем под вас, — вы получаете работающий магазин, а не конструктор, в котором надо разбираться.';

export type ItemKind =
  | 'domain'
  | 'catalog'
  | 'cart'
  | 'pay'
  | 'ship'
  | 'account'
  | 'admin'
  | 'seo';

export interface IncludedItem {
  n: string;
  t: string;
  kind: ItemKind;
}

// dc-script.js: `included: [...].map((t, i) => ({ t, n: String(i + 1).padStart(2, '0'), ... }))`
export const ITEMS: IncludedItem[] = [
  { n: '01', t: 'Магазин на вашем домене, с HTTPS и мобильной версией', kind: 'domain' },
  { n: '02', t: 'Каталог: категории, карточки товаров, варианты (размер, цвет, объём)', kind: 'catalog' },
  { n: '03', t: 'Корзина и оформление заказа', kind: 'cart' },
  { n: '04', t: 'Приём оплаты 13+ способами и чеки в налоговую по 54-ФЗ', kind: 'pay' },
  { n: '05', t: 'Расчёт стоимости доставки прямо в чекауте и печать ярлыков', kind: 'ship' },
  { n: '06', t: 'Личный кабинет покупателя с историей заказов', kind: 'account' },
  { n: '07', t: 'Панель управления: товары, заказы, остатки, скидки, промокоды', kind: 'admin' },
  { n: '08', t: 'Базовая SEO-разметка, sitemap, подключённая метрика', kind: 'seo' },
];

// Fixture copy used inside each mock illustration (mirrors the hard-coded markup in the
// raw template for f.isDomain / f.isCatalog / … — none of it comes from props.json).
export const DOMAIN_CARD = {
  url: 'vashmagazin.ru',
  brand: 'ЛАМПА',
  nav: ['Каталог', 'Доставка'],
  cartCount: '2',
  productName: 'Свеча «Дым»',
  productMeta: 'соя · 250 мл',
  price: '1 290 ₽',
  cta: 'В корзину',
  badges: ['https · сертификат', '390 px'],
};

export const CATALOG_CARD = {
  eyebrow: 'каталог',
  categories: [
    { label: 'Свечи', tone: 'strong' as const, indent: false },
    { label: 'Ароматические', tone: 'muted' as const, indent: true },
    { label: 'Интерьерные', tone: 'muted' as const, indent: true },
    { label: 'Диффузоры', tone: 'strong' as const, indent: false },
    { label: 'Наборы', tone: 'faint' as const, indent: false },
    { label: 'Подарочное', tone: 'faint' as const, indent: false },
  ],
  products: [
    { name: 'Свеча «Дым»', price: '1 290 ₽', img: '/images/products/candle.png' },
    { name: 'Диффузор «Кедр»', price: '4 900 ₽', img: '/images/products/diffuser.png' },
  ],
  detail: {
    name: 'Свеча «Дым»',
    meta: '1 290 ₽ · есть',
    img: '/images/products/candle.png',
    sizes: [
      { label: 'S', selected: false },
      { label: 'M', selected: true },
      { label: 'L', selected: false },
    ],
    colors: [
      { color: '#18181B', selected: false },
      { color: '#D4D4D8', selected: false },
      { color: '#93A3B8', selected: true },
    ],
  },
};

export const CART_CARD = {
  stepLabel: 'шаг 2 из 3',
  progressRight: '34%',
  lines: [
    { name: 'Свеча «Дым»', meta: '250 мл · графит', qty: '×2', price: '2 580 ₽', img: '/images/products/candle.png' },
    { name: 'Диффузор «Кедр»', meta: '100 мл', qty: '×1', price: '4 900 ₽', img: '/images/products/diffuser.png' },
  ],
  summary: [
    { label: 'Товары', value: '7 480 ₽' },
    { label: 'Доставка · СДЭК', value: '380 ₽' },
  ],
  total: { label: 'Итого', value: '7 860 ₽' },
  cta: 'Оплатить 7 860 ₽',
};

export const PAY_CARD = {
  methods: [
    { label: 'СБП — по QR-коду', meta: '0 %', selected: true, metaColor: '#16A34A' },
    { label: 'Картой онлайн', meta: 'visa · mir', selected: false, metaColor: '#A1A1AA' },
    { label: 'SberPay', meta: 'в 1 клик', selected: false, metaColor: '#A1A1AA' },
  ],
  more: 'ещё 6 способов',
  receipt: {
    label: 'кассовый чек · 54-фз',
    check: 'в офд',
    rows: [
      { key: 'фн', value: '7280440500' },
      { key: 'фд', value: '10428' },
      { key: 'итого', value: '7 860 ₽' },
    ],
  },
};

export const SHIP_CARD = {
  header: '197101 · 2 дня',
  methods: [
    { label: 'Пункт выдачи СДЭК', price: '180 ₽', selected: true, strong: true },
    { label: 'Курьер до двери', price: '380 ₽', selected: false, strong: false },
    { label: 'Почта России', price: '240 ₽', selected: false, strong: false },
  ],
  label: { tag: 'ярлык · a6', track: 'CN 8471 2290 RU' },
  address: {
    line1: 'СПб, наб. реки Фонтанки, 15',
    line2: 'Иванова А. С.',
    phone: '+7 921 ***-45-67',
  },
};

export const ACCOUNT_CARD = {
  eyebrow: 'мои заказы',
  orders: [
    { id: '#1041', price: '7 860 ₽', status: 'в пути' },
    { id: '#1040', price: '2 190 ₽', status: 'собирается' },
  ],
  detail: {
    id: '#1042',
    date: '12 авг',
    progressWidth: '44%',
    steps: [
      { label: 'оплачен', done: true },
      { label: 'собран', done: true },
      { label: 'отправлен', done: false },
      { label: 'доставлен', done: false },
    ],
  },
};

export const ADMIN_CARD = {
  nav: [
    { label: 'Товары', active: true },
    { label: 'Заказы', active: false },
    { label: 'Остатки', active: false },
    { label: 'Скидки', active: false },
    { label: 'Промо', active: false },
  ],
  tableHeader: { product: 'товар', stock: 'остаток' },
  rows: [
    { name: 'Свеча «Дым»', qty: '24 шт', low: false, img: '/images/products/candle.png' },
    { name: 'Диффузор «Кедр»', qty: '3 шт', low: true, img: '/images/products/diffuser.png' },
    { name: 'Набор «Вечер»', qty: '11 шт', low: false, img: '/images/products/set.png' },
  ],
  promo: { code: 'LETO15', meta: '42 раза', badge: '−15%' },
};

export const SEO_CARD = {
  snippet: {
    url: 'vashmagazin.ru › каталог',
    title: 'Свечи и диффузоры ручной работы — купить',
    desc: 'Свечи, диффузоры и наборы ручной работы. Доставка по России 1–3 дня.',
  },
  sitemap: {
    label: 'sitemap.xml',
    lines: [
      { text: '<loc>/каталог</loc>', tone: 'link' as const },
      { text: '<lastmod>12-08</>', tone: 'muted' as const },
      { text: '<loc>/товар/42</loc>', tone: 'link' as const },
    ],
  },
  stats: { label: 'визиты · 30д', value: '+38%' },
  bottomNote: 'og-теги и schema.org',
};
