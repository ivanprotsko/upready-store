# f12-owner-raw-keys — на экранах владелицы видны сырые ключи перевода и машинные значения

Правка по классу: закрыт пробел в русском словаре панели (532 ключа, включая
все перечисленные в задаче — `promotions.templates.*`, `orders.creditLines.*`,
`actions.editImages/manage/goToProductOption` и т.д.), плюс отдельные места,
где на экран шло сырое машинное значение вместо человеческого текста.

## Что изменено

**Словарь (`apps/tenant-panel/src/i18n/translations/ru.json`)**
- Добавлены все 532 ключа, которые были в `en.json`, но отсутствовали в
  `ru.json` (было 2596 ключей всего, 532 — 20% — без перевода). Это и есть
  причина «весь экран состоит из ключей» на `/promotions/create`: у `ru.json`
  не было узла `promotions.templates` вовсе (`grep -c` = 0, как и предупреждала
  задача), `orders.creditLines`, `actions.editImages/manage/goToProductOption`
  и ещё полторы сотни узлов.
- `fields.true`/`fields.false` были переведены как «ИСТИНА»/«ЛОЖЬ» — источник
  находки «Со скидкой: ИСТИНА». Заменено на «Да»/«Нет» (использует также
  карточка товара `isThumbnail`, карточка акции).
- `fields.discountable`: «Со скидкой» → «Скидки применяются» (per заданный в
  задаче текст).
- `fields.fulfillment` (заголовок колонки в списке заказов): «Фулфилмент» →
  «Отгрузка».
- `categories.organize.action`: «Редактировать рейтинг» → «Изменить порядок».
- Новые ключи `orders.payment.provider.manual`/`.unknown` и
  `orders.creditLines.storeCreditRefund`, `notificationSettings.noProviderError`
  (см. ниже) — добавлены в оба каталога, `en.json` и `ru.json`.

**Заголовок вкладки браузера** (`hooks/use-document-title.tsx`)
- Было: `"<Страница> - Medusa"`, дефолт `"Medusa"`.
- Стало: бренд — название магазина владельца (`GET /tenants/store`, тот же
  хук `useStore()`, что уже показывает имя в сайдбаре), формат
  `"<Страница> — <Название магазина>"`; на странице входа (сессии ещё нет,
  запрос падает `401`, `retry: false`, без throw) и до загрузки — дефолт
  «Панель магазина». Слово Medusa из заголовка вкладки убрано целиком.

**Payment: провайдер, статус, дата** (`order-payment-section.tsx`,
`lib/order-helpers.ts`)
- `payment.provider_id` («Pp_system_default») выводился на экран как есть.
  Добавлена `getPaymentProviderLabel()`: `pp_system_default` → «Оплата
  вручную», остальное — через уже существующий `formatProvider()` (парсит
  `pp_<name>_<type>`).
- Статус платежа в списке платежей заказа был захардкожен на английском
  (`"Canceled"/"Captured"/"Pending"`) — переведено на уже существующие ключи
  `orders.payment.status.*`.
- Даты (`payment.created_at`, `refund.created_at`, `creditLine.created_at`,
  и статус отгрузки в `order-fulfillment-section.tsx`) форматировались через
  голый `date-fns format(..., "dd MMM, yyyy, HH:mm:ss")` без локали — всегда
  английское название месяца («15 Sep, 2026, 06:57:55») независимо от языка
  интерфейса. Заменено на `useDate().getFullDate({..., includeTime: true})` —
  тот же хук, что уже используют все таблицы панели; формат по ru-локали
  date-fns, без секунд.
- «Store credit refund» (заголовок строки кредита при подключённом
  loyalty-плагине) был захардкожен на английском — заведён под
  `orders.creditLines.storeCreditRefund`.

**Деньги** (`lib/money-amount-helpers.ts`)
- `getStylizedAmount()` строила `"${symbol} ${total} ${CODE}"` вручную —
  источник «₽ 1 084,00 RUB» и в списке заказов (через `MoneyAmountCell`,
  который вызывает эту же функцию), и в карточке заказа (сводка, платежи,
  таймлайн, `/home` метрики). Переписано на `Intl.NumberFormat` с
  `currencyDisplay: "narrowSymbol"` — символ занимает то место, которое
  определяет локаль браузера («1 084,00 ₽» под ru), код валюты больше не
  дублируется. Правка в одной точке чинит все восемь мест использования разом
  (rule 20 — класс, не место).

**Адреса, страна** (`lib/addresses.ts`)
- И `address.country.display_name` с бэкенда, и локальный статический список
  из 250 стран несут только английские имена («Russian Federation»). Вместо
  перевода всего списка вручную — `Intl.DisplayNames([i18n.language], {type:
  "region"})`, нативный ICU-справочник браузера: `.of("RU")` даёт «Россия»
  под `ru`. Используется и в `getFormattedAddress` (адрес в карточке заказа,
  через `CustomerInfo`/`order-customer-section.tsx`), и в
  `getFormattedCountry` (карточка товара, атрибуты). Падает молча на старый
  статический список при отсутствии `Intl.DisplayNames` или неизвестном коде.

**Домен: punycode** (`lib/idn.ts` — новый файл, `settings/domains/domains.tsx`)
- `/settings/domains` показывал ACE-форму домена как есть
  (`xn--80ajkgrgj8cn.xn--p1ai`). В зависимостях панели нет пакета для
  punycode/IDNA, поэтому написан отдельный декодер (RFC 3492, bootstring) —
  **сверен с `node -e 'require("url").domainToUnicode(...)'`** на реальном
  домене задачи, совпадает посимвольно: «черкашино.рф». Юникод-форма — основной
  текст, ACE — мелким шрифтом под ней (только если домен реально punycode).

**Уведомления** (`settings/notifications/notifications.tsx`)
- `last.error` — сырое исключение бэкенда («Could not find a notification
  provider for channel: email for notification id noti_…») выводилось на
  экран как есть. Добавлено распознавание этой конкретной причины (regex по
  `notification provider`) → `notificationSettings.noProviderError`
  («На платформе не настроен почтовый сервер.») — формулировка та же, что уже
  используется в `email.offHint`. Нераспознанные ошибки просто не показывают
  хвост после тире (без утечки трассировки), а не оставляют строку молчать.

**Статусы товара** (`edit-product-form.tsx`, оба списка фильтров в
`use-product-table-filters.tsx`)
- В селекте статуса товара и в двух фильтрах списка товаров были все четыре
  состояния Medusa (`draft/published/proposed/rejected`) — «Предложен» и
  «Отклонён» относятся к workflow модерации мультивендорного маркетплейса,
  которого у этого магазина нет. Оставлены `draft`/`published`. Переводы
  `proposed`/`rejected` в словаре не тронуты (значения ещё возможны через
  API/данные, `product-status-cell.tsx` их всё ещё умеет показать).

**«Default option» / «Default option value»** (`product-create/constants.ts`,
`product-create-details-variant-section.tsx`)
- Синтетические опция/значение по умолчанию для товара без вариантов —
  захардкоженные английские строки-ЗНАЧЕНИЯ (не UI-лейблы: они реально
  уходят в БД как `title`/`value` опции). Переведены на «Опция по умолчанию»
  / «Значение по умолчанию» / «Вариант по умолчанию» синхронно в обоих
  местах (иначе объект `options: {"Опция по умолчанию": "Значение..."}`
  разошёлся бы с `title`). Чинит только НОВЫЕ товары; уже созданные с английскими
  значениями — не задача этой правки (это данные, не текст экрана).

**Блоки главной страницы** (`home-settings/composition.ts`)
- `TILES_OPTIONS[].why`, оба `FORBIDDEN[].reason`, `BLOCK_LABELS` (`hero:
  "Hero"`, `categories: "Category tiles"`) были на английском — единственные
  оставшиеся англоязычные строки в файле (остальные `label`/`why` уже
  по-русски). Переведены; `BLOCK_LABELS.hero` намеренно взял термин
  «Первый экран», уже используемый `homeSettings.hero` в словаре, а не
  придуманное «Хиро» — чтобы не плодить два названия одного понятия.

## Не тронуто, и почему

- **Кнопка «Show password» (5 раз).** Строка живёт в `@medusajs/ui`
  (`components/input/input.js`), внутри `<span className="sr-only">` —
  зрительно НЕ отображается, это подпись для скринридера, а не видимый текст
  на кнопке (сама кнопка — только иконка глаза). Судя по всему, инструмент
  приёмки читал `textContent` без учёта видимости (обычный `innerText` в
  браузере такие узлы вообще не отдаёт). Патчить вендорный пакет ради
  screen-reader-only строки — отдельная задача с отдельным риском (нет
  инфраструктуры `pnpm patch` в репозитории); не делал в рамках этой правки.
  Если приёмка всё же ловит эту строку живым замером — дайте знать, заведу
  `pnpm patch` для `@medusajs/ui`.
- **Уже существующие товары/заказы с английскими значениями** (например,
  созданный ранее товар с `title: "Default option"` в БД) эта правка не
  переписывает — это данные, а не текст экрана; исправление задним числом
  потребовало бы миграции, не предусмотренной задачей.

## Проверено

Живой замер на панели (`https://panel-store.upready.dev` или локальный стенд)
не выполнен: во время работы над задачей на общей локальной инфраструктуре
(порты 5180/9016/9029, общий Postgres) параллельно работали ещё минимум три
воркера этой же миссии (`day16-customers-screen`,
`f03-guest-order-not-in-account` и др.) — поднимать свой стенд означало бы
делить с ними процессы/БД и рисковать их данными; деплой на живой хост эта
задача не поручает. Поэтому проверено статически:

```
$ cd apps/tenant-panel && corepack pnpm run typecheck
> tsc --noEmit
(exit 0, без ошибок)

$ corepack pnpm run lint
> eslint src
✖ 24 problems (0 errors, 24 warnings)   ← те же 24 предупреждения, что были до правки
(exit 0)

$ corepack pnpm run build
> tsc --noEmit && vite build
✓ built in 5.59s
(exit 0)
```

Полный паритет словарей — 0 ключей `en.json` без перевода в `ru.json`
(было 532):
```
$ node -e '... flatten(en) vs flatten(ru) ...'
missing ru keys vs en: 0
```

Punycode-декодер сверен построчно с эталоном Node на реальном домене задачи:
```
$ node -e 'console.log(require("url").domainToUnicode("xn--80ajkgrgj8cn.xn--p1ai"))'
черкашино.рф
$ node --experimental-strip-types -e 'import("./src/lib/idn.ts").then(m=>console.log(m.domainToUnicode("xn--80ajkgrgj8cn.xn--p1ai")))'
черкашино.рф
```

## Как проверить за 10 минут

1. Поднять локальный стенд панели (backend `medusa develop` + `pnpm --filter
   @dtc/gorgo-medusa-tenant-panel dev`) на *своих* портах, авторизоваться
   тенантом с реальными данными (Черкашино или тестовым).
2. Пройти маршрут из задачи: `/`, `/products`, `/products/<id>`, `/orders`,
   `/orders/<id>`, `/promotions/create`, `/categories`, `/home-settings`,
   `/settings/domains`, `/settings/notifications`.
3. На каждом экране в консоли браузера:
   `document.body.innerText.match(/[a-z][a-z_]+\.[a-z_]+\.[a-z_]+/g)` — должно
   быть `null` (кроме, возможно, реальных URL/email в данных).
4. Отдельно: `/promotions/create` — шаги «Тип» и «Подробности» на русском;
   заголовок вкладки браузера без слова Medusa; заказ с ручной оплатой —
   «Оплата вручную» вместо `pp_system_default`; сумма в списке заказов —
   `1 084,00 ₽`, не `₽ 1 084,00 RUB`; `/settings/domains` — `черкашино.рф`
   крупно, ACE-форма мелким шрифтом под ней.

## Раунд 2 (приёмка round 1 отклонена) — 2026-09-15 20:12 WITA

Все четыре находки приёмщика исправлены.

### 1. Конфликт с `dev` — разрешён

`git fetch origin dev && git merge origin/dev` → конфликт в `ru.json` (узел `products`:
`dev` добавил `products.pricing.showAllCurrencies`, PR — `products.columns`/`shippingProfile`/
`variantMedia` в ту же точку) — разрешён вручную, сохранены ОБА набора ключей. Мерж-коммит
`d2764b3`.

```
$ node -e 'JSON.parse(require("fs").readFileSync("apps/tenant-panel/src/i18n/translations/ru.json","utf8")); console.log("valid json")'
valid json
$ node -e '... паритет en/ru ...'
missing ru keys vs en: 0   (en 2603, ru 2699 — оба выросли за счёт products.pricing из dev)
$ cd apps/tenant-panel && corepack pnpm run typecheck
(exit 0, без ошибок, после мержа)
```

### 2. Живой обход — выполнен, артефакты приложены

Стенд: БД `upready_store_f12` (клон `upready_store_cherkashina` — TEMPLATE, порт 5433),
бэкенд `medusa develop` на :9040, панель `vite` на :5190 (свои порты, не пересекаются с соседями
по миссии — на момент работы на 5180/9016/9029 сидели ещё минимум три параллельных воркера,
их не трогал). Вход — реальный тестовый логин тенанта `owner-cherkashino@example.test` /
`supersecret1` (уже существовал в снапшоте, замер `~/upready/memory/upready-store-stand-traps-2026-09-15.md`).

У тенанта в снапшоте оказалось 0 заказов (все 16 заказов в БД — фикстуры тенанта Acme), поэтому
для экрана «карточка заказа» добавлен `apps/backend/src/scripts/f12-seed-test-order.ts` —
разовая throwaway-фикстура (та же форма, что уже закоммиченные `t13-seed-test-tenant.ts`/
`t17-seed-test-tenant.ts`: raw-insert через Knex + `linkOrderToTenantWorkflow`), один заказ на
канал продаж Черкашино, ручная оплата (`pp_system_default`), адрес в России, сумма 1084 ₽ —
подобраны так, чтобы воспроизвести именно те находки задачи (raw provider id, RUB-формат, страна).

Скрипт обхода: `drv/lib.mjs` (хелперы, включая проверку видимости DOM-узла — см. ниже) +
`drv/walkthrough.mjs` (все 14 экранов задачи + отдельный шаг «Подробности» акции). Прогон:

```
$ node walkthrough.mjs
productId: prod_01M29Q5AVB4VJGSBPE2VBH02BH orderId: order_f12test5pf3bm
s01-home                        rawKeys=0 machineValues=0 titleHasMedusa=false
s02-products                    rawKeys=0 machineValues=0 titleHasMedusa=false
s03-product-detail              rawKeys=0 machineValues=0 titleHasMedusa=false
s04-orders                      rawKeys=0 machineValues=0 titleHasMedusa=false
s05-order-detail                rawKeys=0 machineValues=0 titleHasMedusa=false
s06-promotions-create-type      rawKeys=0 machineValues=0 titleHasMedusa=false
s06b-promotions-create-details  rawKeys=0 machineValues=0
s07-categories                  rawKeys=0 machineValues=0 titleHasMedusa=false
s08-pages                       rawKeys=1 machineValues=0 titleHasMedusa=false
s09-home-settings               rawKeys=0 machineValues=0 titleHasMedusa=false
s10-shipping                    rawKeys=0 machineValues=0 titleHasMedusa=false
s11-settings-domains            rawKeys=2 machineValues=0 titleHasMedusa=false
s12-settings-locale             rawKeys=0 machineValues=0 titleHasMedusa=false
s13-settings-payments           rawKeys=0 machineValues=1 titleHasMedusa=false
s14-settings-notifications      rawKeys=0 machineValues=0 titleHasMedusa=false
```

Артефакты: `drv/lib.mjs`, `drv/walkthrough.mjs`, `raw/*.json` (по одному на экран + `s00-summary.json`
+ `s99-console-errors.json`), `shots/*-1280x900.png` (по одному на экран).

Три формальных совпадения разобраны замером, ни одно не является дефектом экрана:

- **`s08-pages`, `s11-settings-domains` — `rawKeys`.** Совпадения — `cherkashino.upready.dev` и
  `stores.upready.dev`: это ДОМЕННЫЕ ИМЕНА (реальные данные магазина — платформенный поддомен и
  CNAME-подсказка), они синтаксически совпадают с формой `слово.слово.слово`, которую ловит регулярка
  задачи, но не являются непереведённым ключом. Скриншот `shots/s11-settings-domains-*.png`
  подтверждает: подпись рядом («по этому адресу вас находят покупатели», «CNAME на») — по-русски.
  У этого тенанта в снапшоте нет кастомного домена `черкашино.рф` (записи не было в клонированной БД),
  поэтому пункт задачи про punycode-домен на ЭТОМ стенде живым замером не воспроизводится; его
  правка (`lib/idn.ts`) отдельно сверена с эталоном:
  ```
  $ node -e 'console.log(require("url").domainToUnicode("xn--80ajkgrgj8cn.xn--p1ai"))'
  черкашино.рф
  $ node --experimental-strip-types -e 'import("./apps/tenant-panel/src/lib/idn.ts").then(m=>console.log(m.domainToUnicode("xn--80ajkgrgj8cn.xn--p1ai")))'
  черкашино.рф
  ```
- **`s13-settings-payments` — `machineValues=["Show password"]`.** Ровно то предупреждение из
  раунда 1: `innerText` отдаёт `sr-only`-узел, потому что тот не `display:none`. Добавлен фильтр
  по видимости (`elementVisibility()` в `drv/lib.mjs`): для каждого совпадения скрипт находит DOM-узел,
  чей СОБСТВЕННЫЙ текст равен найденной строке, и меряет его `getBoundingClientRect()` +
  `getComputedStyle()`. Результат для всех 4 вхождений на этом экране (`raw/s13-settings-payments.json`,
  поле `invisibleMachineValueMatches`):
  ```json
  { "width": 1, "height": 1, "display": "block", "visibility": "visible",
    "clip": "rect(0px, 0px, 0px, 0px)" }
  ```
  `width=1, height=1, clip=rect(0,0,0,0)` — узел физически существует и `innerText` его видит,
  но занимает нулевую видимую область: ни один зрячий пользователь его не прочитает.
  `visibleMachineValueMatches` для этого экрана — пустой массив. Экран засчитан чистым.

Скриншот `shots/s05-order-detail-1280x900.png` (заказ на реальном товаре Черкашино,
созданный фикстурой) показывает разом четыре исправления раунда 1: `1 084,00 ₽` (не
«₽ 1 084,00 RUB»), «Оплата вручную» (не `pp_system_default`), «Получен» (не `Canceled`/`Captured`
по-английски), «15 сент. 2026 г. 17:01» (не английский месяц), «Россия» (не `Russian Federation`),
и заголовок вкладки без Medusa.

29 ошибок в консоли за весь обход (`raw/s99-console-errors.json`) — 23×`ERR_CONNECTION_REFUSED`
(локальный стенд без Telegram-бота/сторонних сервисов), 4×`DialogTitle` a11y-предупреждение и
1×`validateDOMNesting` — не относятся к этой задаче, добавлены до неё, не потрогано.

### 3. «Sales channel of tenant "cherkashino"» — убран из панели

Строка генерируется бэкендом при создании тенанта (`workflows/tenant/create-tenant/index.ts:52`)
как служебное cross-tenant описание для АДМИНКИ платформы (`sales_channel.description`), никогда не
предназначалось для экрана владелицы. `GET /tenants/sales-channels` отдаёт только СВОЙ канал тенанта
(`hooks/api/sales-channels.tsx` — уже комментирует это), то есть в этой таблице панели ВСЕГДА ровно
одна строка — колонка «Описание» с одним значением ничего не различает и не несёт решения. Убрал
колонку `description` из общего `useSalesChannelTableColumns` (используется и в мастере создания
товара, и в `product-sales-channels/edit-sales-channels-form`) — правило 18e: сырая внутренняя строка
может попасть на экран только через настоящую карту подписей, а подписи для неё нет и не нужно.
Бэкенд-генератор не трогал: строка остаётся полезной admin-side bookkeeping для будущей мультитенантной
админки платформы, просто больше не протекает в тенант-панель.

```
$ grep -rn '"description"' apps/tenant-panel/src/components/data-table/helpers/sales-channels/use-sales-channel-table-columns.tsx
(только в комментарии, объясняющем удаление)
$ cd apps/tenant-panel && corepack pnpm run typecheck   # exit 0
```

### 4. «Default option» — исправлено по всей цепочке, а не только в мастере

Обнаружились ЕЩЁ ДВА бэкендовых источника той же пары строк, шире, чем указал приёмщик:

- `apps/backend/src/migration-scripts/lib/products.ts` (демо-сид, `initial_data_seed`) — уже был
  правлен в раунде 1 этого же PR (переименован в русский вариант).
- **`apps/backend/src/migration-scripts/data/abstract-datasets.ts`** — ЭТО путь, которым реально
  прошла миграция Черкашино («the path the seeded shops on prod took», см. комментарий в
  `seed-tenant-dataset/index.ts`). Переименован в «Опция по умолчанию»/«Значение по умолчанию».
- `apps/backend/src/workflows/tenant/seed-tenant-dataset/index.ts` — сравнивал `option.title` с
  захардкоженной английской константой для распознавания плейсхолдер-опции (чтобы не резолвить её
  как shared-опцию); константа обновлена в тон.

Побочный эффект, который нашёлся при грепе и был бы РЕГРЕССИЕЙ, если бы его не поймать: сторона
STOREFRONT (`apps/storefront/src/lib/util/option-filter-groups.ts`) хардкодит ТЕ ЖЕ ДВЕ английские
строки как сигнатуру для СКРЫТИЯ плейсхолдер-опции из фильтров каталога и карточек товара
(`isPlaceholderOption`). Если бы бэкенд стал минтить русские строки, а витрина продолжала искать
английские — уже созданные (и будущие) товары без опций начали бы показывать «Опция по умолчанию ·
Значение по умолчанию» как настоящий фильтр на `/store` — новая находка вместо старой. Исправлено
вместе: `isPlaceholderOption` теперь распознаёт ОБА варианта (английский — для уже существующих в БД
товаров, русский — для новых), тест на это добавлен и прогнан:

```
$ cd apps/storefront && npx vitest run src/lib/util/option-filter-groups.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)   ← было 4, +2 новых (русский сентинел)
```

```
$ grep -rn '"Default option"' apps/backend/src apps/storefront/src apps/tenant-panel/src
(только в комментариях и в сохранённой legacy-константе MEDUSA_DEFAULT_OPTION_TITLE/VALUE
 сторефронта — она НУЖНА как есть, для уже созданных товаров)
$ cd apps/backend && npx tsc --noEmit   # exit 0
$ npx medusa lint                        # exit 0, 59 warnings — все pre-existing
```

### Итоговая проверка

```
$ cd apps/tenant-panel && corepack pnpm run typecheck && corepack pnpm run lint && corepack pnpm run build
(все exit 0; lint — 24 pre-existing warnings, 0 новых)
$ cd apps/backend && npx tsc --noEmit && npx medusa lint
(exit 0; lint — 59 pre-existing warnings, 0 новых)
$ cd apps/storefront && npx vitest run src/lib/util/option-filter-groups.test.ts
(6/6 passed)
```
