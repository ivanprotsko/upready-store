// Verbatim copy of `planData` from reference/dc-script.js, restricted to the two fields the
// rendered `sec-tariffs` markup actually consumes (tag, title, price, term, desc, rows, fine,
// and the `best` flag that decides button colour). Text is copied character-for-character from
// reference/rendered/14-tariffs.html.

export interface TariffPlan {
  id: string;
  tag: string;
  title: string;
  price: string;
  term: string;
  best: boolean;
  desc: string;
  rows: string[];
  fine: string;
}

export const plans: TariffPlan[] = [
  {
    id: 'install',
    tag: 'установка',
    title: 'Готовый магазин на вашем домене',
    price: '4 900',
    term: 'разово · за 24 часа',
    best: true,
    desc: 'Разворачиваем выбранный пример на вашем домене, подключаем приём оплаты и доставку и загружаем первые товары.',
    rows: [
      'Домен, HTTPS и мобильная версия',
      'Витрина, корзина и оформление заказа — настроены и проверены',
      'Приём оплаты привычными способами, чеки в налоговую',
      'Расчёт доставки в чекауте и печать ярлыков',
      'Загрузка 15 товаров: фото, описания, цены',
    ],
    fine: 'возврат 7 дней',
  },
  {
    id: 'brand',
    tag: 'оформление',
    title: 'Оформление под ваш бренд',
    price: '9 900',
    term: 'к установке · за 48 часов',
    best: false,
    desc: 'Всё то же, что за 4 900 ₽, плюс доработка под ваш бренд: логотип, цвета, шрифты и тексты. Магазин выглядит как ваш, а не как шаблон.',
    rows: [
      'Всё из тарифа за 4 900 ₽',
      'Загрузка до 40 товаров: фото, описания, цены',
      'Логотип, палитра и шрифты',
      'Главная, карточка товара и оформление заказа',
      'Письма, чеки и баннеры в фирменном виде',
      'Тексты о бренде, доставке и оплате',
    ],
    fine: 'без возврата',
  },
];

// `{{ nTariffs }}` in the raw template — the running section-order number computed at runtime by
// dc-script.js `renderVals()` from the page's `blocks`/audience visibility state (order array in
// dc-script.js line 319). That state is shared across the whole page and is not owned by this
// section; the value below is the one baked into reference/rendered/14-tariffs.html (default
// props: audience "cold", all `show*` blocks default off except the always-on ones ahead of
// "tariffs" in the order array). See NOTES.md "Needs from merger".
export const eyebrowNumber = '12';

export const eyebrowLabel = 'выбор тарифа';
export const heading = 'Выберите тариф';
export const intro =
  'Оплата картой или через СБП на стороне Tribute — счёт формируется сразу после выбора тарифа.';
export const ctaLabel = 'Оплатить';
