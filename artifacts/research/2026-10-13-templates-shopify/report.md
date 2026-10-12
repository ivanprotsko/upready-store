model: claude-opus-5-5 (Opus 5.5), линия f7-compact-analytics

# t-2026-10-12-33 R1 — темы Shopify, разобранные до секций

Ветка `templates/research-shopify`, PR → `templates/main`. Папка: [2026-10-13-templates-shopify](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-shopify/artifacts/research/2026-10-13-templates-shopify).

## Коротко
- Разобрано 18 тем:
  - 13 бесплатных из брифа;
  - 4 платные: Impulse, Prestige, Focal, Motion;
  - Horizon, нынешняя основная тема Shopify.

  У каждой темы взяты главная, один товар и одна коллекция. Найдено 36 типов секций, ещё `contact-form` есть только в схеме Dawn. Всего 37 строк.
- **Шаблон Shopify — это упорядоченный список секций, и типы в нём повторяются.** На главной в среднем 10 секций (от 1 до 25). У 14 тем из 18 какой-то тип стоит на одной странице дважды и больше: у Colorblock на странице товара 8 `multicolumn`. У нас композиция — пять фиксированных слотов (header, hero, tiles, listing, footer) по одному варианту в каждом. Второй подборки товаров или второго блока «картинка + текст» поставить некуда. Это вопрос к архитектуре шаблонов, а не к отдельным блокам.
- **13 бесплатных тем — один и тот же код Dawn 16.1.0.** Вместе они обходятся 21 типом секций и отличаются только порядком, настройками и стилем. Значит, разнообразие шаблонов даёт небольшая библиотека настраиваемых секций, а не число блоков.
- Только у платных тем и Horizon есть: вкладки подборок, промо-сетка, таймер, отзывы, точки на фото, до/после, лента времени, бегущая строка, попап. У каждой из них частота не выше 4 из 18.
- Ряд «иконки с подписями» темы семейства Dawn собирают из `multicolumn`: Sense, Trade. Отзывы — тоже из него: Crave, Trade.

## Топ-20 секций по частоте

| # | Секция | Тем из 18 | У нас | Статус |
| --- | --- | --- | --- | --- |
| 1 | header | 18 | `header:h1..h6` | есть |
| 2 | footer | 18 | `footer:f1..f7` | есть, но `f4` «с рассылкой» рисует FooterF1 |
| 3 | main-product | 18 | `modules/products/templates` | есть; нет таблицы размеров, самовывоза в карточке, «поделиться», счётчика остатка |
| 4 | main-collection-product-grid | 18 | `modules/store` | есть |
| 5 | related-products | 17 | `products/related-products` | есть |
| 6 | announcement-bar | 15 | `layout/promo-banner` | частично: одно сообщение |
| 7 | main-collection-banner | 15 | `categories/category-header-image` | есть для категорий; у коллекции только заголовок |
| 8 | featured-collection | 14 | `listing:p1..p5` | частично: один слот на страницу |
| 9 | multicolumn | 13 | — | **нет** |
| 10 | image-with-text | 13 | — | **нет** |
| 11 | newsletter | 11 | — | **нет** |
| 12 | rich-text | 10 | `hero:m` | частично: только как hero |
| 13 | image-banner | 9 | `hero:k`, `hero:l` (ProfileHero) | частично: только hero-слот |
| 14 | collection-list | 9 | `tiles:on`, `hero:j` | есть |
| 15 | collage | 9 | — | **нет** (`listing:p5` только про товары) |
| 16 | slideshow | 8 | `hero:ga`; слайдер Olavka | частично |
| 17 | video | 6 | — | **нет** |
| 18 | featured-blog | 6 | — (есть маршрут `/journal`) | **нет** |
| 19 | featured-product | 5 | `hero:g` | есть как hero |
| 20 | popup · icons-with-text | 4 · 4 | — | **нет** |

Полная таблица с пробелами и приоритетами — [map.json](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-shopify/artifacts/research/2026-10-13-templates-shopify/map.json).

## Предлагаемый порядок сборки блоков
Роли — словарь анализатора ui-upready-dev-monorepo. Где у анализатора нет слова, стоит расширение; оно помечено в [roles.json](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-shopify/artifacts/research/2026-10-13-templates-shopify/roles.json).

1. **Текстовый блок** (`rich-text`): надзаголовок, заголовок, абзац, кнопка; выравнивание и ширина колонки. У Origin и Studio по 4 таких блока на главной. Роли: `section-header heading description cta-primary`.
2. **Картинка + текст** (`image-with-text`, режим «чередовать стороны» закрывает `multirow`). Изображение слева или справа, заголовок, текст, кнопка. Есть у 13 тем из 18, до 4 подряд. Роли: `media heading description cta-primary`.
3. **Колонки** (`multicolumn`, режим «иконки» = `icons-with-text`). Каждая колонка — картинка или иконка, заголовок, текст, ссылка. В режиме иконок это ряд доверия: СДЭК и Почта, карта и СБП, возврат, гарантия. Роли: `section-header feature-card card-image card-title description cta-secondary icon-wrapper icon`.
4. **Подборка товаров как повторяемая секция** (`featured-collection`). Раскладки p1–p5 становятся секцией, которая встаёт на страницу сколько угодно раз; добавляются карусель и «Смотреть все». Две подборки на главной у 5 тем: Impulse, Refresh, Studio, Taste, Trade. Роли: `section-header product-card price badge cta-secondary`.
5. **Отзывы** (`testimonials`): карточки со звёздами, текстом, именем и городом; сетка или слайдер. Как отдельная секция — у 3 тем, ещё у 2 собраны из колонок. Покупатель в России смотрит отзывы первым делом. Роли: `section-header testimonial-card quote-text author-info star-rating trigger`.
6. **Подписка** (`newsletter`): email или Telegram-канал. Та же форма чинит `footer:f4`. Роли: `section-header heading description newsletter-form input cta-primary`.
7. **Баннер в любом месте страницы** (`image-banner`): картинка для десктопа и телефона, затемнение, заголовок, 1–2 кнопки, высота. Посреди страницы его ставят 4 темы. Роли: `hero-image headline description cta-group cta-primary cta-secondary`.
8. **Мозаика** (`collage`): одна большая плитка и две малые, каждая — картинка, товар, коллекция или видео. Роли: `section-header card card-image product-card video-player`.
9. **Слайдер баннеров** (`slideshow`): 2–5 слайдов с картинкой, заголовком и кнопкой, автопрокрутка. Общая версия слайдера Olavka. Роли: `hero-image headline description cta-primary trigger`.
10. **Вопросы и ответы** (`collapsible-content`): аккордеон с картинкой или без, для главной и страницы товара (доставка, оплата, возврат). Роли: `section-header heading trigger content`.
11. **Видео** (`video`): файл, YouTube, VK Видео, Rutube; обложка с кнопкой. Роли: `video-player headline description cta-primary`.
12. **Статьи журнала** (`featured-blog`): три последние записи из `/journal`. Роли: `section-header card card-image card-title description`.
13. **Промо-сетка** (`promo-grid`): плитки акций, у каждой свой заголовок и кнопка. Роли: `card card-image headline description cta-primary`.
14. **Таймер акции** (`countdown`): дата окончания, текст, кнопка; ещё как режим панели объявлений, как у Prestige. Роли: `heading countdown description cta-primary`.
15. **Вкладки подборок** (`featured-collections-tabs`): «Хиты / Новинки / Скидки» в одном блоке. Роли: `section-header tab-list tab-trigger tab-content product-card price`.
16. **Панель объявлений, доработка** (`announcement-bar`): несколько сообщений по очереди, ссылки, закрытие. Роли: `description nav-link trigger`.

Потом, P3: товар на главной вне hero, точки на фото (`shop-the-look`), бегущая строка, лента времени, до/после, галерея, попап, B2B-заказ списком.

Пункты 4 и 7 упираются в фиксированные слоты композиции. Их можно собрать как компоненты, но на страницу они встанут, только когда композиция начнёт принимать список секций.

## Что не удалось получить и почему
- **Настройки секций платных тем.** Код Impulse, Prestige, Focal и Motion не публичный. Для 14 строк, которых нет в Dawn, настройки выведены из того, что показывает демо: элементы, кнопки, data-атрибуты. Это помечено в `evidence`. У `product-tabs` настройки не выписаны совсем, она есть только у Focal.
- **Страницы контактов, блога и альтернативные шаблоны** не обходились. Взяты главная, первый товар и первая коллекция, на которые ссылается главная. Поэтому числа для страниц товара и коллекции — нижняя граница, а `contact-form` с частотой 0 значит «не смотрели», а не «нет».
- **Видео в снимках серое.** Headless-шелл Chromium не проигрывает видео, поэтому видео-секции Impulse, Motion и Dawn на снимках — заглушки.
- **Вырезка баннера коллекции Impulse** не снялась: элемент не дал снимок за 10 с. Взят тот же тип секции у Prestige.
- **Horizon и Spotlight:** их демо-главные показывают 2 и 1 секцию. Horizon устроен иначе (блоки темы внутри общей секции `section`), его секции распознаны по ключам. Чтобы разобрать Horizon глубже, нужен отдельный проход.
- **Отзывы на themes.shopify.com** не сохранялись: в них имена людей.
- **Три секции отнесены вручную**, по снимкам: `featured-collections` у Impulse и Motion — это плитки коллекций, а не вкладки; один заголовок у Horizon — баннер коллекции. Все три правила лежат в `scripts/resolve.mjs`.
- InSales и Tilda сюда не входят: их делает соседняя линия (R2) в том же формате.

## Как собрано и проверено
- **Dawn:** shallow clone `Shopify/dawn` @ `258f00f6` во временную папку, в репо не попал. Из 38 секций прочитан `{% schema %}`: настройки, типы блоков, пресеты.
- **Запросы:**
  - 17 страниц на themes.shopify.com;
  - 91 переход headless-браузера по демо-магазинам;
  - 36 простых GET страниц товара и коллекции;
  - ещё 5 ручных запросов curl: 2 `robots.txt`, 2 раза страница Dawn, 1 главная Dawn.

  Ни одного ответа кроме 200, 403 и 429 не было. Между запросами к одному хосту не меньше 1,3 с по журналу. Ни логина, ни корзины, ни кликов. Журнал — [fetch-log.jsonl](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-shopify/artifacts/research/2026-10-13-templates-shopify/fetch-log.jsonl).
- **Тип секции** определяется так, первым сработавшим правилом:
  1. собственный класс темы `shopify-section--<тип>`;
  2. ключ секции из пресета;
  3. `data-section-type`;
  4. сигнатура разметки семейства Dawn.

  Код — `scripts/classify.mjs` и `scripts/resolve.mjs`.
- **Проверка** `node validate.mjs` → ✓:
  - 37 секций, у каждой есть evidence;
  - 37 строк карты, все есть в `sections.json`;
  - 18 тем, 56 ролей;
  - 8 главных × 2 ширины;
  - 15 вырезок, топ-15 покрыт.
- **Обратный ход** на копиях, 4 из 4 красные с названием места:
  - строка карты без секции;
  - секция без evidence;
  - удалённая вырезка;
  - битый JSON.

## Файлы
- [sections.json](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-shopify/artifacts/research/2026-10-13-templates-shopify/sections.json) — строка на тип секции: роли, настройки, блоки, темы, частота, evidence;
- [themes.json](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-shopify/artifacts/research/2026-10-13-templates-shopify/themes.json) — строка на тему, порядок секций на главной, товаре и коллекции, повторы сохранены;
- [map.json](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-shopify/artifacts/research/2026-10-13-templates-shopify/map.json) — наш ключ или модуль, пробел, приоритет P1–P3;
- [roles.json](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-shopify/artifacts/research/2026-10-13-templates-shopify/roles.json) — роли: 46 слов анализатора с числом узлов в его данных и 10 расширений с пояснением;
- [sources.json](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-shopify/artifacts/research/2026-10-13-templates-shopify/sources.json) — для каждой темы страница в Theme Store, демо и три обойдённых URL;
- [shots/home](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-shopify/artifacts/research/2026-10-13-templates-shopify/shots/home) — Dawn, Sense, Crave, Trade, Impulse, Prestige, Focal, Motion при 1280 и 360, вся страница, попапы скрыты CSS;
- [shots/sections](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-shopify/artifacts/research/2026-10-13-templates-shopify/shots/sections) — вырезки 15 самых частых секций, у каждой тема в имени файла;
- [scripts/](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-shopify/artifacts/research/2026-10-13-templates-shopify/scripts) — всё, чем собрано (нужны `playwright-core` и `linkedom` во временной папке).

Снимки — только доказательство, в продукт не идут. Кода тем в папке нет.
