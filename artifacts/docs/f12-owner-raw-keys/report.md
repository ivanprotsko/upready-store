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
