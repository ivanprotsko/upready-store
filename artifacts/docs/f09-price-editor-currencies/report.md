# f09-price-editor-currencies — Цена в рублях: 89-я колонка таблицы, а при создании товара поля нет вовсе

Отчёт написан 2026-09-15 15:52 WITA. Ветка `fix/day16-price-editor-currencies`, база `dev`.

## Что видит владелица теперь

**«Редактировать цены»** открывается таблицей из трёх колонок — «Заголовок», **«Цена, ₽»**, «Цена USD» —
и курсор стоит **в рублёвой ячейке**: ноль нажатий Tab, горизонтальной прокрутки нет.
USD показан потому, что у этого товара цена в USD уже заведена: скрыть колонку, в которой стоит цена,
значило бы сделать эту цену нередактируемой. Все остальные 357 колонок (118 валют стора + 241 регион)
возвращает переключатель **«Все валюты (359)»** в шапке таблицы — ничего из возможностей Admin не потеряно.

**Мастер создания товара**, шаг «Варианты»: колонка **«Цена, ₽»** стоит сразу после «Заголовка», до SKU и
переключателей запасов. Публикация товара без единой цены больше не проходит молча — мастер остаётся
открытым и показывает по-русски: «Укажите цену хотя бы в одной валюте: без цены товар попадёт в каталог
карточкой без цены. Если цена ещё не известна — сохраните черновик.» Черновик без цены сохранить
по-прежнему можно (владелица ещё пишет карточку) — запрет висит только на «Опубликовать».

## Замер (стенд, реальные данные магазина)

Стенд: локальная копия живого магазина. БД `upready_store_f09` — клон `upready_store_cherkashina`
(миграция olavka.ru в тенант `cherkashino` от 2026-09-12), бэкенд `medusa develop` на :9029,
панель `vite` на :5182 из этого worktree. Вход — учётка, привязанная к тому же `tenant_admin`,
что и у владелицы. Данные стора совпадают с живыми (проверено чтением прода тем же запросом):

```
GET /tenants/store            supported_currencies = 118, is_default = usd
GET /tenants/regions?limit=9999  regions = 241
GET /tenants/locale-settings  {"locale_settings": null}   # владелица экран «Язык и валюта» не сохраняла
```

То же самое, прочитанное на ЖИВОМ бэкенде `https://shipshift.dev` под паролем владелицы —
`raw/s00-live-store-probe.json`: 118 валют, 241 регион, `locale_settings: null`.
118 + 241 + 1 колонка заголовка = **359 колонок**, которые рисовала таблица до правки.

### До и после — на одном стенде

«До» измерено тем же драйвером на том же стенде с исходниками панели, выкаченными из `5c147c8`
(головы ветки перед правкой), затем исходники возвращены из HEAD и замер повторён.

| Что | До (`5c147c8`) | После (HEAD) |
|---|---|---|
| Первая ценовая колонка | «Цена EUR» | **«Цена, ₽»** |
| Ячейка, на которой открывается экран | `variants.0.prices.eur` | **`variants.0.prices.rub`** |
| Рублёвое поле отрисовано при открытии | нет | **да** |
| Нажатий Tab до рублёвого поля | **96** | **0** |
| Горизонтальная прокрутка до поля | нужна (ширина сетки 54 000 px) | **не нужна** (1 262 px, ровно по окну) |
| Поле `variants.0.prices.rub` в мастере создания | 0 штук (замер q02: `rubFieldCount=0`) | **1 штука**, x = 325…442 при окне 1280 |

Сетка перемещает якорь ровно на одну колонку за нажатие Tab (`handleTabKey`,
`use-data-grid-keydown-event.tsx`), поэтому «96» — это расстояние от колонки, на которой экран
открывался, до рублёвой. Живой замер q02 на проде дал 95 — та же величина в пределах одной колонки.

### Команды и вывод

```
node artifacts/docs/f09-price-editor-currencies/drv/s03-before.mjs      # «до», исходники 5c147c8
  renderedHeadersAtOpen: ["Заголовок","Цена EUR","Цена AED","Цена AFN","Цена USD","Цена ALL", ...]
  openingCell: "variants.0.prices.eur"   rubRenderedAtOpen: false   tabsToField: 96

node artifacts/docs/f09-price-editor-currencies/drv/s01-prices-screen.mjs   # «после»
  narrow.headers: ["Заголовок","Цена, ₽","Цена USD"]
  narrow.openingCell: "variants.0.prices.rub"   narrow.tabsToField: 0
  narrow.horizontalScrollNeeded: false   narrow.fieldBox: {x:175, right:292, scrollWidth:1262, clientWidth:1262}
  showAll.firstHeaders: ["Заголовок","Цена, ₽","Цена EUR","Цена AED","Цена AFN","Цена USD"]
  showAll.scroller: {scrollWidth: 54000, clientWidth: 1262}     # переключатель возвращает все 359

node artifacts/docs/f09-price-editor-currencies/drv/s06-clicks-from-product.mjs   # путь от карточки
  clicks: ["меню «…» блока «Варианты»", "пункт «Редактировать цены»"]   clickCount: 2
  openingCell: "variants.0.prices.rub"   reachedRubField: true

node artifacts/docs/f09-price-editor-currencies/drv/s04-create-wizard.mjs        # мастер создания
  wizardHeaders: ["Default option","Заголовок","Цена, ₽","SKU","Управляемые запасы", ...]
  rubFieldCount: 1   rubFieldBox: {x:325, right:442, width:117}   rubWithinViewport: true
  publishWithoutPrice: {refused: true, message: ["Укажите цену хотя бы в одной валюте: ..."]}
  publishWithPrice: {leftTheWizard: true, url: ".../products"}

node artifacts/docs/f09-price-editor-currencies/drv/s05-edit-keeps-other-currency.mjs  # скрытое не теряется
  fieldsInGrid: ["variants.0.prices.rub","variants.0.prices.usd"]
  pricesBefore: ["rub:1500","usd:15"]   pricesAfter: ["rub:1355","usd:15"]   usdSurvived: true
```

Товар, опубликованный мастером с ценой, прочитан обратно из API:

```
GET /tenants/products?limit=5&order=-created_at
  f09 — проверка цены C | published | [('rub', 1234)]
```

### Скриншоты 1280×900

- `artifacts/docs/f09-price-editor-currencies/shots/s01-prices-shop-currency-1280x900.png` — экран цен после правки
- `artifacts/docs/f09-price-editor-currencies/shots/s03-before-prices-1280x900.png` — тот же экран до правки
- `artifacts/docs/f09-price-editor-currencies/shots/s04-create-variants-step-1280x900.png` — шаг «Варианты» мастера
- `artifacts/docs/f09-price-editor-currencies/shots/s04-publish-without-price-refused-1280x900.png` — отказ публиковать без цены
- `artifacts/docs/f09-price-editor-currencies/shots/s06-product-card-1280x900.png`, `s06-variants-menu-1280x900.png`, `s06-price-editor-1280x900.png` — путь в два клика
- `artifacts/docs/f09-price-editor-currencies/shots/s01-prices-all-currencies-1280x900.png` — переключатель «Все валюты» включён

## Что изменено

| Файл | Что |
|---|---|
| `apps/tenant-panel/src/routes/products/common/use-pricing-scope.tsx` | **новый.** Хук `usePricingScope` — какие валюты и регионы попадают в колонки, плюс переключатель `PricingCurrencyToggle` |
| `apps/tenant-panel/src/lib/locale-catalog.ts` | карта `LOCALE_DEFAULT_COUNTRY` (локаль → страна) и `FALLBACK_LOCALE` — фолбэк, когда владелец не сохранял «Валюту по умолчанию» |
| `apps/tenant-panel/src/components/data-grid/helpers/create-data-grid-price-columns.tsx` | необязательный `currencyLabel` — заголовок «Цена, ₽» вместо «Цена RUB» для валюты магазина |
| `apps/tenant-panel/src/routes/products/common/variant-pricing-form.tsx` | берёт колонки из хука, рисует переключатель, ждёт ответа регионов |
| `apps/tenant-panel/src/routes/products/product-prices/pricing-edit.tsx` | считает валюты и регионы, в которых у товара УЖЕ есть цены, и передаёт их в форму |
| `.../product-create-variants-form/product-create-variants-form.tsx` | то же для мастера + колонка цены перенесена сразу за «Заголовок» |
| `.../create-product-variant-form/pricing-tab.tsx` | то же для создания варианта |
| `.../product-create-form/product-create-form.tsx` | публикация без цены отбивается сообщением; черновик — можно |
| `apps/tenant-panel/src/i18n/translations/{ru,en}.json` | три ключа: `fields.priceShopTemplate`, `products.pricing.showAllCurrencies`, `products.create.errors.missingPrice` |

**Как определяется валюта магазина** (`use-pricing-scope.tsx`): 1) «Валюта по умолчанию» владельца на
`/settings/locale` (`locale_settings.default_country`) → регион этой страны → его валюта; 2) если не
сохранял — язык магазина (`default_locale`) → страна по `LOCALE_DEFAULT_COUNTRY` → регион → валюта,
той же цепочкой, что ходит витрина через `LOCALE_COUNTRY_MAP`; 3) если и его нет — язык `ru`, тот же
умолчательный, что показывает сам экран «Язык и валюта»; 4) в последнюю очередь — валюта стора.
Стор в мультитенанте один на все магазины, и его `is_default = usd` говорит, чем засеяли платформу,
а не в чём торгует магазин, — поэтому он последний, а не первый.

**Скрытая колонка не прячет цену.** Форма грузит в свои значения ВСЕ цены варианта независимо от
колонок, а обработчики сохранения отправляют их обратно целиком. Проверено замером s05: правка рубля
в сетке из двух колонок вернула `rub` новым, `usd` — прежним.

**Гонка загрузки.** Пока стор, регионы и настройки локали не ответили, валюта магазина неизвестна,
и сетка, построенная в этот момент, открылась бы на валюте стора и перестроилась бы под руками
(правило 19h). Хук отдаёт `isReady`, и до ответа сетка рисует свой штатный скелет. Без этого гейта
один прогон из трёх открывался на «Цена, $».

## Проверки

```
cd apps/tenant-panel && npx tsc --noEmit          # rc=0
cd apps/tenant-panel && npx eslint src/routes/products src/lib/locale-catalog.ts
                                                   # 0 errors, 5 warnings — все пять были до правки
cd apps/tenant-panel && corepack pnpm build        # rc=0, ✓ built in 5.85s
```

## Чего НЕ сделано и почему

- **Дровер «Редактировать вариант» по-прежнему без полей цены** (пункт 3 замера q02). Это отдельный
  экран (`product-variant-detail`), цену там правят через «Редактировать цены» — путь в два клика,
  который задача и требует. Добавление цен в дровер — новая форма, а не сужение колонок; не делал.
- **Символ рубля внутри ячейки печатается как «₽.»** — это `symbol_native` из
  `src/lib/data/currencies.ts`, авто-генерируемого каталога Medusa, общего для всех валютных ячеек
  панели. В ЗАГОЛОВКЕ колонки точка срезана («Цена, ₽»); внутри ячейки не трогал, чтобы не править
  авто-генерируемые данные ради одной валюты.
- **Заголовок блока «Профиль доставки» на карточке товара выводится ключом**
  `products.shippingProfile.header` — непереведённый ключ виден владелице на скриншоте
  `s06-product-card-1280x900.png`. Дефект чужого экрана, в эту правку не входит.
- **На прод не деплоил** — задача этого не предписывает (правило 21c).

## Как принять за 10 минут

1. `git fetch origin && git checkout fix/day16-price-editor-currencies`
2. Поднять бэкенд на копии магазина и панель (как на стенде выше) — или дождаться деплоя и открыть
   https://panel-store.upready.dev под паролем владелицы.
3. Товары → любой товар → у блока «Варианты» меню «…» → «Редактировать цены».
   Ожидается: две-три колонки, первая ценовая — «Цена, ₽», курсор уже в ней, прокрутки вбок нет.
4. Включить переключатель «Все валюты (359)» — вернулись все колонки Admin.
5. Товары → «Создать» → название → «Продолжить» ×2 → на шаге «Варианты» колонка «Цена, ₽» сразу за
   «Заголовком». Нажать «Опубликовать» не заполнив цену — мастер остаётся открытым и объясняет почему.
   Заполнить цену → «Опубликовать» → товар в списке с ценой.
