import { esc, map, money, initial, cap } from "../../lib/html.mjs"
import { icons } from "../../lib/icons.mjs"
export const meta = { id: "cart-drawer" }

/* Панель корзины после добавления товара — must-фича r03 (cart-slide-panel).
   В лаборатории это СТАТИЧЕСКОЕ состояние: открывается кнопкой корзины. */
export function render(b, ctx) {
  const items = ctx.pick(b.source, b.limit || 2)
  const total = items.reduce((s, p) => s + p.price, 0)
  return `<div class="cart" data-component="cart-drawer" data-cart hidden>
    <div class="cart-veil" data-cart-close></div>
    <aside class="cart-panel" role="dialog" aria-label="Корзина" aria-modal="true">
      <header class="cart-head">
        <h2 data-role="subsection-title">Корзина</h2>
        <button class="icon-btn" type="button" data-cart-close aria-label="Закрыть корзину">${icons.close}</button>
      </header>
      <ul class="cart-list">${map(items, (p) => `<li class="cart-row">
        <span class="media cart-thumb" data-img-role="thumb"${p.image === null ? " data-empty" : ""}${ctx.tpl.media.pad ? " data-media-pad" : ""}>
          ${p.image === null
            ? `<span class="empty-initial" aria-hidden="true">${esc(initial(p.name))}</span>`
            : `<img src="${esc(ctx.img(p))}" alt="" data-decorative loading="lazy" width="400" height="500">`}
        </span>
        <span class="cart-main">
          <span data-role="card-title" class="cart-name">${esc(p.name)}</span>
          <span data-role="meta">${esc(p.unit || cap(p.category))}</span>
          <span class="qty">
            <button class="icon-btn" type="button" aria-label="Убрать одну штуку">${icons.minus}</button>
            <span class="qty-n" data-role="body">1</span>
            <button class="icon-btn" type="button" aria-label="Добавить одну штуку">${icons.plus}</button>
          </span>
        </span>
        <span data-role="card-price">${money(p.price)}</span>
      </li>`)}</ul>
      <footer class="cart-foot">
        <div class="cart-sum"><span data-role="body">Итого</span><span data-role="price">${money(total)}</span></div>
        <p data-role="meta">${esc(b.note)}</p>
        <a class="btn" data-variant="primary" data-size="lg" data-full href="${esc(ctx.url("index"))}">Оформить заказ</a>
        <button class="btn" data-variant="ghost" data-full type="button" data-cart-close>Продолжить покупки</button>
      </footer>
    </aside>
  </div>`
}
