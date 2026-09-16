import { esc, map, money } from "../../lib/html.mjs"
import { icons } from "../../lib/icons.mjs"
export const meta = { id: "checkout" }

/* Статическое состояние оформления: контакты, доставка (в т.ч. пункт выдачи),
   оплата, промокод — must-фичи r03 checkout-form / delivery-options /
   pickup-points / payment-methods / promo-code. */
export function render(b, ctx) {
  const items = ctx.pick(b.source, 2)
  const goods = items.reduce((s, p) => s + p.price, 0)
  return `<section class="band" data-block="checkout">
    <div class="container co">
      <div class="co-main stack">
        <h2 data-role="section-title">${esc(b.title)}</h2>
        <fieldset class="co-group"><legend data-role="subsection-title">Контакты</legend>
          <div class="co-fields">
            <label class="field"><span>Имя и фамилия</span><input class="input" autocomplete="name" placeholder="Оксана Черкашина"></label>
            <label class="field"><span>Телефон</span><input class="input" type="tel" autocomplete="tel" placeholder="+7 900 000-00-00"></label>
            <label class="field co-wide"><span>Электронная почта</span><input class="input" type="email" autocomplete="email" placeholder="почта@пример.рф"></label>
          </div>
        </fieldset>
        <fieldset class="co-group"><legend data-role="subsection-title">Доставка</legend>
          <div class="co-choices">${map(b.delivery, (d, i) => `<label class="co-choice">
            <input type="radio" name="delivery"${i === 0 ? " checked" : ""}>
            <span class="co-choice-body">
              <span data-role="body">${esc(d.label)}</span>
              <span data-role="meta">${esc(d.note)}</span>
            </span>
            <span data-role="card-price">${d.price ? money(d.price) : "бесплатно"}</span>
          </label>`)}</div>
          <label class="field co-wide"><span>Адрес или пункт выдачи</span><input class="input" autocomplete="street-address" placeholder="Город, улица, дом"></label>
        </fieldset>
        <fieldset class="co-group"><legend data-role="subsection-title">Оплата</legend>
          <div class="co-choices">${map(b.payment, (p, i) => `<label class="co-choice">
            <input type="radio" name="payment"${i === 0 ? " checked" : ""}>
            <span class="co-choice-body"><span data-role="body">${esc(p.label)}</span><span data-role="meta">${esc(p.note)}</span></span>
          </label>`)}</div>
        </fieldset>
      </div>
      <aside class="co-side surface">
        <h3 data-role="subsection-title">Заказ</h3>
        <ul class="co-items">${map(items, (p) => `<li class="between">
          <span data-role="body" class="co-item-name">${esc(p.name)}</span><span data-role="card-price">${money(p.price)}</span>
        </li>`)}</ul>
        <label class="co-promo">
          <span class="sr-only">Промокод</span>
          <input class="input" placeholder="Промокод" aria-label="Промокод">
          <button class="btn" data-variant="secondary" type="button">Применить</button>
        </label>
        <hr class="hr">
        <div class="between"><span data-role="body">Товары</span><span data-role="body">${money(goods)}</span></div>
        <div class="between"><span data-role="body">Доставка</span><span data-role="body">${money(b.delivery[0].price || 0)}</span></div>
        <div class="between co-total"><span data-role="body">К оплате</span><span data-role="price">${money(goods + (b.delivery[0].price || 0))}</span></div>
        <button class="btn" data-variant="primary" data-size="lg" data-full type="button">${icons.check}Подтвердить заказ</button>
        <p data-role="meta">${esc(b.legal)}</p>
      </aside>
    </div>
  </section>`
}
