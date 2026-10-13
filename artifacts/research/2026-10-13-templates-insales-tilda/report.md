Модель: claude-opus-5-5 (Opus 5.5), линия f1-report-links

# t-2026-10-12-33 R2 — шаблоны InSales и Tilda, разобранные до секций

PR: [https://github.com/ivanprotsko/upready-store/pull/359](https://github.com/ivanprotsko/upready-store/pull/359), ветка `templates/research-insales-tilda` → `templates/main`, в `main` не идёт. Папка: [2026-10-13-templates-insales-tilda](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-insales-tilda/artifacts/research/2026-10-13-templates-insales-tilda).

Продолжение исследования 16.09 (r03), а не повтор. Его данные перенесены как есть в [from-2026-09-16/](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-insales-tilda/artifacts/research/2026-10-13-templates-insales-tilda/from-2026-09-16): `features.json`, `templates-index.tsv`, `tilda-index.json`, `upready-map.json` и страницы 10 тем InSales. Все взяты `git show` из ветки `origin/feat/day16-store-templates-research`, коммит `591c996f` (сами файлы реестра — из `befb1dca`, 16.09 09:14 WITA).

## Коротко
- **Разобрано 11 тем InSales и 10 шаблонов Tilda.** У InSales взяты главная, одна категория и один товар; у Minimalism ссылки на товар с главной нет. Магазин Tilda — одна страница. Найдено 63 строки секций: 36 у InSales, 27 у Tilda. Это 46 типов, названия совпадают со словарём линии Shopify (PR #353), где тип тот же.
- **Все 10 тем InSales 4-го поколения — один движок.** Список возможностей на их страницах совпадает слово в слово. Темы различаются только набором, порядком и настройками виджетов — то же, что 13 бесплатных тем Shopify на коде Dawn. У InSales виджет так и называется: `widget-type_system_widget_v4_<тип>_<вариант>`. Настройки лежат в разметке CSS-переменными (`--hide-title`, `--slide-width`, `--bg`), из них и выписаны `settings`.
- **Секции повторяются.** На главной InSales в среднем 12 видимых секций, у Tilda — 10. У Fine 4 подборки товаров, у Bubble и Loft по 3 ряда плиток категорий, у Moon 3 баннера, у Магазина цветов (Tilda) 3 блока «один товар». У нас пять слотов по одному варианту — второй блок того же типа поставить некуда. Тот же вывод у линии Shopify.
- **Tilda собирает магазин как лендинг.** Обложка → каталог с фильтрами → «почему мы» → доставка и оплата → контакты. Корзина Tilda — сразу и оформление: имя, телефон, доставка внутри выдвижной панели (10 из 10).

## Чего нет в списке секций Shopify, а у InSales и Tilda есть
Это российские приметы. Число — в скольких темах найдено сегодня, в скобках — данные 16.09.

| Что | InSales | Tilda | У нас на dev |
|---|---|---|---|
| **Форма «имя + телефон» вместо корзины:** обратный звонок | 10 из 11 (`callback_modal`) | 0 (16.09: 2) | нет |
| то же: предзаказ при нулевом остатке | 11 из 11 (`preorder`) | 0 | нет |
| то же: «Купить в 1 клик» на странице товара | 5 из 10 страниц товара (16.09: 7 тем) | 0 | нет; кнопку «купить сейчас» убрали в #344 |
| Рассрочка «Плати частями» | (16.09: 10 тем) | 0 | нет |
| Бонусы: «Дарим 5000 бонусов на первую покупку», «Скидки и бонусы» | 3 из 11 | 0 | нет |
| Бегущая строка с бонусом и бесплатной доставкой | 2 (Cream, Vibe) | 0 | нет |
| Истории (кружки, как в VK, Ozon и WB) | 2 (Cream, Stories) | 0 | нет |
| Отзывы о магазине с пометкой «отзыв с Wildberries / OZON / VK» | Vibe (16.09: Stories, Vibe) | — | нет |
| «Пункты выдачи» в шапке, «в пункты выдачи по всей РФ» | 3 из 11 | 2 из 10 | карта ПВЗ только в оформлении |
| Блок «Доставка и оплата» на главной | — | 3 из 10 | только отдельные страницы |
| «Как сделать заказ» шагами | — | 1 (растения) | нет |
| Промокод на первый заказ блоком посреди страницы | — | 1 (растения, «FLOWERS») | промокод только в оформлении |
| Нижняя панель на телефоне | 9 из 11 | — | есть (`bottom-nav`) |
| Сравнение товаров | 3 из 11 видно на странице (16.09: 10) | 0 | нет |

**Не нашлось на демо-страницах:** значков СБП и ЮKassa, расчёта доставки на карточке, «товара дня». Платёжные значки и доставка у InSales появляются в корзине и оформлении, а туда я не заходил. 16.09 записал способы оплаты в 3 темах InSales и 2 у Tilda. Значки маркетплейсов отдельным блоком («мы на Ozon») не встретились ни сегодня, ни 16.09: маркетплейс упоминается только как источник отзыва.

Все находки с цитатой и секцией — в [signals.json](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-insales-tilda/artifacts/research/2026-10-13-templates-insales-tilda/signals.json) (155 попаданий).

## Два дефекта 16.09 на сегодняшнем dev (53ce9d41)
Оба на месте.
- **hero `k` и `l` рисуют `ProfileHero`:** [apps/storefront/src/modules/home/variants/index.ts:68-69](https://github.com/ivanprotsko/upready-store/blob/53ce9d41/apps/storefront/src/modules/home/variants/index.ts#L68-L69), на dev `k: ProfileHero, l: ProfileHero`. `DEFAULT_HERO` тоже `"k"`.
- **подвал `f4` «с рассылкой» рисует `FooterF1`:** [apps/storefront/src/modules/layout/templates/footer/variants/index.ts:40](https://github.com/ivanprotsko/upready-store/blob/53ce9d41/apps/storefront/src/modules/layout/templates/footer/variants/index.ts#L40), `f4: FooterF1`. Комментарий там же: ручки подписки нет.

Строки сверены `git show origin/dev:<путь>`, а не по файлам этой ветки.

## Предлагаемый порядок сборки блоков
Роли — словарь анализатора ui-upready-dev-monorepo в той редакции, что у линии Shopify, плюс 13 расширений под российский рынок. Они помечены в [roles.json](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-insales-tilda/artifacts/research/2026-10-13-templates-insales-tilda/roles.json). «= Shopify N» — тот же блок есть в списке линии Shopify под номером N, собирать один раз.

1. **Форма «имя + телефон»** — одна основа для трёх блоков: обратный звонок, предзаказ, «Купить в 1 клик». Заявка уходит владельцу в Telegram. Нужна публичная ручка формы на бэкенде. Роли: `dialog phone-form input cta-primary close-button one-click-buy`.
2. **Преимущества / ряд доверия** (`multicolumn`), = Shopify 3. Почему мы, доставка СДЭК и Почтой, оплата СБП и картой, возврат. Есть у 6 из 10 Tilda. Роли: `section-header feature-card icon-wrapper icon card-title description`.
3. **Доставка и оплата блоком** (`delivery-payment`): способы доставки и оплаты значками, подробности в аккордеоне. Роли: `section-header feature-card delivery-badge payment-badge description trigger`.
4. **Отзывы о магазине** (`testimonials`), = Shopify 5, плюс пометка, откуда отзыв: Wildberries, OZON, Яндекс, VK. Роли: `section-header testimonial-card quote-text author-info star-rating marketplace-badge`.
5. **Текстовый блок и заголовок секции** (`rich-text`), = Shopify 1. У InSales отдельный виджет-заголовок стоит над каждой подборкой. Роли: `heading description cta-primary`.
6. **Картинка + текст «О магазине»** (`image-with-text`), = Shopify 2. Роли: `media heading description cta-primary`.
7. **Подборка товаров как повторяемая секция, со вкладками** (`featured-collection`, `featured-collections-tabs`), = Shopify 4 и 15. Роли: `section-header tab-list tab-trigger product-card price badge stock-badge`.
8. **Метки на карточке товара:** «В наличии» / «Нет в наличии» / «Предзаказ», сравнение, избранное. Это доработка карточки, а не секция. Роли: `product-card stock-badge compare-toggle wishlist-toggle one-click-buy`.
9. **Промо-сетка и промо-баннер с промокодом** (`promo-grid`, `promo-banner`), = Shopify 13. Плитки акций с процентом скидки, как у Bubble; баннер «скидка на первый заказ по промокоду». Роли: `card card-image headline description cta-primary`.
10. **Бегущая строка** (`scrolling-text`): бонус на первую покупку, бесплатная доставка. Роли: `marquee description bonus-badge`.
11. **Истории** (`stories`): кружки, по нажатию полноэкранная история. Роли: `section-header story-circle card-image dialog`.
12. **«Как сделать заказ» шагами** (`steps`): 3–4 шага с номером. Объясняет заказ через телефон и мессенджер. Роли: `section-header step card-title description`.
13. **Контакты и магазины на карте** (`contacts`, `store-locations`): адреса, часы, телефон, Яндекс Карты. Роли: `section-header map card description social-link`.
14. **Слайдер баннеров** (`slideshow`), = Shopify 9. Роли: `hero-image headline description cta-primary trigger`.

Потом, из того же списка Shopify: подписка с Telegram-каналом (6, чинит `f4`), FAQ (10), видео с VK Видео и Rutube (11), журнал на главной (12). Ещё галерея-лукбук (`image-gallery`), кнопка «наверх», плитки подкатегорий в начале категории.

Пункты 7 и 9 упираются в фиксированные слоты композиции, как и у линии Shopify. Пункты 1, 3 и 4 упираются в бэкенд: нужны ручка формы, способы доставки и оплаты как данные витрины, отзывы о магазине.

## Что не удалось получить и почему
- **Newtone 2.0:** демо ответило HTTP 500 дважды (12.10 23:29 WITA). Вместо него взяты Stories и Vibe, поэтому тем InSales 11, а не 10.
- **Коды блоков Tilda в `tilda-index.json`:** их там нет, вопреки брифу. Файл 16.09 хранит только имя, тип, ссылку и описание шаблона. Коды взяты из разметки (`data-record-type`, например `T786`). Публичных имён у этих номеров нет, поэтому тип записи определён по разметке и заголовку. Правила — в [scripts/build.mjs](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-insales-tilda/artifacts/research/2026-10-13-templates-insales-tilda/scripts/build.mjs).
- **Настройки.** У InSales — то, что виджет пишет в разметку; тип выведен по значению. Админки обоих закрыты регистрацией. У Tilda из разметки видны только отступы, цвета, стрелки и параметры слайдера; настройки редактора не видны.
- **Страницы товара и категории у Tilda:** их нет. Товар открывается всплывающим окном на той же странице (`#!/tproduct/…`), поэтому `pages.product` и `pages.collection` у Tilda пустые.
- **Скрытые окна** — звонок, предзаказ, корзина — не сняты. Чтобы их открыть, нужен клик, а клики запрещены. Доказательство — текст окна в разметке.
- **Таймер акции:** среди сегодняшних 10 шаблонов Tilda его нет; 16.09 нашёл его в 5 других шаблонах.
- **Одна запись отнесена вручную:** `benefits_3` у Loft — по вырезке это отзывы покупателей, а не преимущества. Правило — `MANUAL` в `build.mjs`.
- **Полоса демо InSales** «Все шаблоны» липнет сверху и попадает в верх некоторых вырезок.
- Снимки — только доказательство, в продукт не идут. Кода тем и картинок в продукте нет. Персональных данных нет; имена в отзывах — демо-тексты шаблонов.

## Как собрано и проверено
- **Запросы:** 98 переходов headless-браузера, 13 хостов: 12 демо InSales и `examples-ru.tilda.ws`. Ответы: 96 × 200 и 2 × 500 (Newtone). 403 и 429 не было. Самая короткая пауза между запросами к одному хосту — 2,86 с. Ни логина, ни корзины, ни кликов, ни отправки форм. Журнал — [fetch-log.jsonl](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-insales-tilda/artifacts/research/2026-10-13-templates-insales-tilda/fetch-log.jsonl).
- **Тип секции:** у InSales — по имени виджета; у Tilda — по разметке записи, затем по заголовку. Неоднозначные `banner_list` у InSales (бренды, категории, промо) разведены по содержимому.
- **Проверка** `node validate.mjs` → ✓:
  - 63 строки секций, у каждой есть evidence;
  - 46 строк карты, все есть в `sections.json` и наоборот;
  - 21 тема, у страниц тем только известные секции;
  - 63 роли, все есть в `roles.json`;
  - по 8 главных каждого источника в 1280 и 360;
  - 45 вырезок, топ-15 видимых секций покрыт.

## Файлы
- [sections.json](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-insales-tilda/artifacts/research/2026-10-13-templates-insales-tilda/sections.json) — строка на источник × тип: роли, настройки, варианты виджетов или номера записей в `blocks`, темы, частота, evidence;
- [themes.json](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-insales-tilda/artifacts/research/2026-10-13-templates-insales-tilda/themes.json) — порядок секций на главной, товаре и категории, повторы сохранены;
- [map.json](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-insales-tilda/artifacts/research/2026-10-13-templates-insales-tilda/map.json) — наш ключ или модуль на dev 53ce9d41, пробел, приоритет P1–P3;
- [roles.json](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-insales-tilda/artifacts/research/2026-10-13-templates-insales-tilda/roles.json), [signals.json](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-insales-tilda/artifacts/research/2026-10-13-templates-insales-tilda/signals.json), [sources.json](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-insales-tilda/artifacts/research/2026-10-13-templates-insales-tilda/sources.json);
- [shots/home](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-insales-tilda/artifacts/research/2026-10-13-templates-insales-tilda/shots/home) — InSales: Cream, Minimalism, Base, Bubble, Fine, Grand, Moon, Stories; Tilda: растения, товары для дома, украшения, мебель, Shetuka, цветы, Myths, Canny. Вся страница при 1280 и 360;
- [shots/sections](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-insales-tilda/artifacts/research/2026-10-13-templates-insales-tilda/shots/sections) — 15 самых частых видимых секций и секции из списка сборки, у каждой в имени файла источник и магазин;
- [scripts/](/Users/ivanprotsko/upready/worktrees/upready-store/templates/research-insales-tilda/artifacts/research/2026-10-13-templates-insales-tilda/scripts) — обход, сборка, отбор снимков. Нужен `playwright-core` во временной папке (`T33_TOOLS`).
