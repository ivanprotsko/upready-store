/**
 * HTML → текстовый экстракт + внутренние ссылки + структурные сигналы.
 * Модель читает ТОЛЬКО экстракт, сырой HTML в git не попадает (правило 47 — экономия).
 */

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  deg: "°", times: "×", middot: "·", bull: "•", euro: "€", copy: "©", reg: "®", trade: "™",
}

export function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m))
}

const BLOCK = /<\/?(p|div|section|article|header|footer|nav|ul|ol|li|tr|table|h[1-6]|br|hr|form|fieldset|figure|main|aside|dd|dt|dl|blockquote)\b[^>]*>/gi

/** Текст страницы: скрипты/стили вырезаны, ссылки сохранены как [text](href). */
export function htmlToText(html, baseUrl) {
  let h = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(script|style|noscript|svg|iframe|template)\b[^>]*\/>/gi, " ")
  // ссылки: <a href=x>text</a> → [text](x)
  h = h.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, inner) => {
    const text = decodeEntities(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
    if (!text) return " "
    let abs = href
    try { abs = new URL(href, baseUrl).toString() } catch { /* оставляем как есть */ }
    return ` [${text}](${abs}) `
  })
  // альты картинок — часто единственный носитель смысла блока
  h = h.replace(/<img\b[^>]*alt=["']([^"']{2,120})["'][^>]*>/gi, (m, alt) => ` [img: ${alt}] `)
  h = h.replace(BLOCK, "\n")
  h = h.replace(/<[^>]+>/g, " ")
  h = decodeEntities(h)
  h = h.replace(/[ \t ]+/g, " ")
  h = h.split("\n").map((l) => l.trim()).filter(Boolean).join("\n")
  h = h.replace(/\n{3,}/g, "\n\n")
  return h
}

/** Уникальные внутренние ссылки страницы — это карта навигации (IA) демо-магазина. */
export function internalLinks(html, baseUrl) {
  const out = new Map()
  const host = (() => { try { return new URL(baseUrl).host } catch { return "" } })()
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = re.exec(html))) {
    let abs
    try { abs = new URL(m[1], baseUrl) } catch { continue }
    if (!/^https?:$/.test(abs.protocol)) continue
    if (abs.host !== host) continue
    if (/\.(png|jpe?g|gif|svg|webp|css|js|ico|pdf|zip|woff2?)$/i.test(abs.pathname)) continue
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
    const key = abs.origin + abs.pathname + abs.search
    if (!out.has(key)) out.set(key, text.slice(0, 80))
  }
  return [...out.entries()].map(([url, text]) => ({ url, text }))
}

/**
 * Структурные сигналы: маркеры функциональности, которые НЕ видны в тексте
 * (имена классов виджетов, data-атрибуты, скрытые формы). Каждый — улика для реестра.
 */
export const SIGNALS = [
  ["cart", /корзин|add[_-]?to[_-]?cart|js-add-to-cart|t-store__card__btn|basket/i],
  ["quick-view", /быстрый просмотр|quick[_-]?view|quickview|t-store__prod-popup/i],
  ["compare", /сравнени[ей]|добавить к сравнению|js-compare|compare[_-]?add|data-compare/i],
  ["wishlist", /избранн|в закладки|wishlist|favorite|js-favorite/i],
  ["filters", /js-filter|filter[_-]?block|t-store__filter|фильтр[ыа]?\b|refinement|facet/i],
  ["price-range-filter", /price[_-]?(min|max|from|to|slider)|noui-slider|ui-slider|цена от/i],
  ["sort", /сортировк|js-sort|sort[_-]?(by|select)|t-store__sort/i],
  ["search", /js-search|live[_-]?search|instant[_-]?search|search[_-]?form|поиск по (сайту|каталогу|товарам)/i],
  ["reviews", /отзыв|review|rating|js-rate|оценк[аи]|звёзд|stars?[_-]?rating/i],
  ["blog", /\/blogs?\/|блог|статьи|журнал|новости компании/i],
  ["newsletter", /подписаться на|подписк[аи] на (новости|рассылку)|newsletter|subscribe[_-]?form/i],
  ["one-click-order", /купить в 1 клик|купить в один клик|быстрый заказ|one[_-]?click|quick[_-]?order/i],
  ["preorder", /предзаказ|pre[_-]?order/i],
  ["notify-in-stock", /сообщить о поступлении|уведомить о поступлении|notify[_-]?when|подписаться на товар/i],
  ["installments", /рассрочк|в кредит|долями|split[_-]?pay|подели|tinkoff|яндекс[ _-]?сплит/i],
  ["stock-status", /в наличии|нет в наличии|под заказ|остат[ко]|in[_-]?stock|out[_-]?of[_-]?stock/i],
  ["variants", /вариант|модификаци|выберите размер|размер:|цвет:|option[_-]?value|t-product__option|js-variant/i],
  ["size-chart", /таблиц[аы] размеров|size[_-]?chart|размерная сетка/i],
  ["gallery-zoom", /fancybox|photoswipe|zoom|lightbox|swiper|slick|gallery/i],
  ["video", /youtube|vimeo|rutube|<video|видеообзор/i],
  ["delivery-calc", /рассчитать доставку|калькулятор доставки|delivery[_-]?calc|shipping[_-]?calc|стоимость доставки рассчит/i],
  ["pickup-points", /пункт[ыа]? выдачи|самовывоз|пвз|pickup[_-]?point|на карте|ymaps|yandex[._-]?map|2gis/i],
  ["account", /личный кабинет|мой профиль|мои заказы|\/account|\/client|регистраци|войти|sign[_-]?in/i],
  ["wholesale-b2b", /оптов|b2b|прайс[_-]?лист|price[_-]?list|юридическим лицам|для дилеров|скачать прайс/i],
  ["loyalty", /бонус|накопительн|программа лояльности|loyalty|промокод|coupon|скидочн/i],
  ["chat-widget", /jivo|jivosite|bitrix24|talk[_-]?me|carrotquest|chat[_-]?widget|whatsapp|telegram|onlinechat/i],
  ["cookie-consent", /cookie|куки|согласие на обработк/i],
  ["breadcrumbs", /breadcrumb|хлебные крошки|itemtype="[^"]*BreadcrumbList/i],
  ["megamenu", /megamenu|mega[_-]?menu|js-menu|многоуровнев|подкатегори/i],
  ["slider-hero", /slider|carousel|swiper|главный баннер|промо[_-]?баннер/i],
  ["countdown", /countdown|таймер|до конца акции|осталось:/i],
  ["popup", /popup|модальн|js-modal|fancybox|всплывающ/i],
  ["related-products", /похожие товары|с этим товаром|рекомендуем|сопутствующ|related|upsell|cross[_-]?sell|комплект/i],
  ["recently-viewed", /вы смотрели|просмотренны|recently[_-]?viewed/i],
  ["specs-table", /характеристик|свойства товара|спецификац|properties|technical/i],
  ["faq-accordion", /faq|вопрос[_-]?ответ|частые вопросы|accordion|спойлер/i],
  ["contacts-map", /контакты|наши магазины|адрес[аы]?|схема проезда|карта проезда/i],
  ["social-share", /поделиться|share[_-]?button|соцсет|vk\.com\/share|addthis/i],
  ["legal-pages", /оферт|политик[аи] конфиденциальности|пользовательское соглашение|возврат[а]? товара|условия доставки/i],
  ["multi-currency", /валют|currency|₽|\$|€/i],
  ["multi-language", /hreflang|переключ[еи] язык|language[_-]?switch|\/en\//i],
  ["seo-structured", /application\/ld\+json|itemprop=|schema\.org/i],
  ["analytics", /gtag|googletagmanager|mc\.yandex|metrika|ga\(|facebook\.net\/.*fbevents|vk\.com\/rtrg|top-?mail/i],
  ["checkout-form", /оформ[иль][ае]?ни[ея] заказ|checkout|оформить заказ|данные для доставки/i],
  ["payment-methods", /способ[ы]? оплаты|оплата картой|наложенн|сбп|яндекс[ _-]?пэй|yookassa|robokassa|cloudpayments|apple[ _-]?pay/i],
  ["kit-bundle", /комплект|набор из|купить комплектом|bundle/i],
  ["product-badges", /new|хит|sale|акци|скидка|бестселлер|новинка|badge|label/i],
  ["pagination", /pagination|показать ещё|показать еще|следующая страница|page=2/i],
  ["mobile-app", /app[_-]?store|google[_-]?play|мобильное приложение/i],
  ["lookbook", /lookbook|образ|коллекци|сет[ыа]? образов/i],
]

export function signals(html) {
  const hit = []
  for (const [name, re] of SIGNALS) if (re.test(html)) hit.push(name)
  return hit
}
