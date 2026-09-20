# f04-address-without-city — Заказ проходит без города и индекса

Ветка `fix/day16-address-fields`, база `dev` (влита `9269555`). Отчёт составлен 2026-09-15 11:40 WITA.

## Что было

Витрина собирала адрес одной строкой, когда провайдер подсказок не настроен — а на живом
мультитенантном хосте он не настроен ни у кого: `deploy/compose.mt.yml` не задаёт ни
`NEXT_PUBLIC_ADDRESS_AUTOCOMPLETE_PROVIDER`, ни ключ к нему. Заказ #5 на `cherkashino.shipshift.dev`
ушёл в оплату с `city=""`, `province=""`, `postal_code=""` — посылку по такому адресу не принимает ни
Почта России, ни СДЭК.

## Что сделано

Выбран **вариант 1** из задачи (структурные поля по умолчанию), и условие взято шире, чем «провайдер
не задан»: подсказка считается настроенной, только если провайдер = `dadata` **и** его ключ
непустой. `NEXT_PUBLIC_ADDRESS_AUTOCOMPLETE_PROVIDER=dadata` без ключа — это ровно то, что лежит в
`apps/storefront/.env.template`, и такой DaData рисует поле подсказок, которое никогда ничего не
подскажет, то есть собирает ту же четверть адреса, что и однострочник. Лечится класс, а не случай.

Вариант 2 (оставить строку и запереть кнопку) отвергнут: он оставляет покупателя перед запертой
кнопкой без поля, в которое можно ввести недостающее.

### Витрина

| Файл | Что изменилось |
|---|---|
| `apps/storefront/src/lib/constants.tsx` | `hasAddressAutocomplete` — единственная проверка «подсказка может подсказать» (провайдер + ключ) |
| `.../common/components/address-autocomplete/index.tsx` | нет рабочей подсказки → сразу `ManualAddressFields`, без чекбокса; есть → подсказка + чекбокс как раньше. Подпись чекбокса стала `<Label htmlFor>` |
| `.../address-autocomplete/providers/plain.tsx` | удалён: после изменения на него нет ни одного импортёра |
| `.../address-autocomplete/manual-address-fields.tsx` | `province` обязателен там, где у страны есть список регионов (сегодня Россия) — и на селекте, и на текстовом запасном поле |
| `apps/storefront/src/lib/util/shipping-address.ts` (новый) | `shippingAddressGaps`, `cartShippingAddressGaps`, `requiresProvince`, `isPickupCart` — одна чистая функция на весь чекаут |
| `.../checkout/components/checkout-address-sheet/index.tsx` | проверка при сохранении и при подстановке сохранённого адреса; русское сообщение своим состоянием (см. ниже) |
| `.../checkout/components/payment-button/index.tsx` | `notReady` учитывает неполный адрес |
| `.../checkout/components/checkout-payment-section/index.tsx` | над запертой кнопкой стоит причина, а не пустота |
| `apps/storefront/messages/*.json` (36 шт.) | ключ `CheckoutPage.addressIncomplete`, по одной настоящей строке на локаль |
| `apps/storefront/tests/stands/helpers.ts` | `fillCheckoutAddress` заполняет регион и кликает сам чекбокс; доккомментарий переписан — прежний утверждал ровно то, что этот фикс отменил |
| `apps/storefront/README.md` | таблица переменных: подсказка включается только парой «провайдер + ключ» |

Сообщение в шторке рендерится **своим** состоянием, а не через `ErrorMessage`: тот прогоняет
строку через `resolveErrorKey`, который отображает **серверную** ошибку на фиксированный набор
`Errors.*` — уже переведённое предложение выходит оттуда обезличенным. Замерено на стенде: первая
версия фикса не показывала в шторке ничего, что покупатель мог бы прочитать.

### Бэкенд

| Файл | Что изменилось |
|---|---|
| `apps/backend/src/workflows/hooks/validate-cart-shipping-address.ts` (новый) | `missingPostableFields` + `assertPostableShippingAddress`: заказ без `address_1`/`postal_code`/`city` (и `province` там, где есть список регионов) невозможен |
| `apps/backend/src/workflows/hooks/complete-cart-validate.ts` (новый) | единственная регистрация `completeCartWorkflow.hooks.validate` на весь бэкенд |
| `apps/backend/src/workflows/hooks/validate-cart-sales-channel.ts` | своя регистрация на `completeCart` снята, правило переехало в файл выше; проверка экспортируется |

Почему появился третий файл: Medusa принимает **ровно один** обработчик на хук. Второй
`completeCartWorkflow.hooks.validate(...)` где угодно в `src` — и бэкенд не стартует:

```
error:   Error starting server: Cannot define multiple hook handlers for the validate hook
```

Это не ловится ни `tsc`, ни `medusa lint` — только запуском. Поэтому в
`__tests__/complete-cart-validate.unit.spec.ts` есть тест, который обходит `src` и падает, если
регистраций снова станет две.

Две корзины гейт пропускает намеренно: без способа доставки (отправлять нечего) и самовывоз —
там чекаут **сам** обнуляет адрес и кладёт ПВЗ в `cart.metadata`
(`pickup-sheet-context.tsx`), так что пустой адрес и есть правильное состояние. На бэкенде это
решается по типу fulfillment set самой опции доставки, а не по метаданным, которые пишет клиент.

## Где замерено

Задача просит живой магазин, но полоса `deploy` в этом дне — отдельная задача, и деплой воркеру
запрещён. Поэтому всё измерено на локальном стенде с **тем же кодом и теми же данными**, что у
клиента:

* БД `upready_store_f04` — копия `upready_store_cherkashina` + `medusa db:migrate`, тенант
  `cherkashino` («Оксана Черкашина», 38 товаров, регион Russia/RUB);
* бэкенд `medusa develop` на `:9016`, витрина `next dev -p 8016`, магазин открывается по
  `http://cherkashino.localhost:8016`;
* `apps/storefront/.env` **без** `NEXT_PUBLIC_ADDRESS_AUTOCOMPLETE_PROVIDER` — ровно то, что задаёт
  живому хосту `deploy/compose.mt.yml`.

Скрипты замера: `/private/tmp/claude-502/…/scratchpad/step{1,2,3,4,5,6}-*.mjs` (вне репозитория).

## Приёмка

### 1. До оплаты без города и индекса не дойти, сообщение русское

Форма адреса по умолчанию (чекбокса нет, поля структурные, список регионов русский):

```
SHEET SHAPE: {"city":1,"postal_code":1,"provinceSelect":1,"manualCheckbox":0,
              "provinceOptions":86,"firstRegions":["Область","Москва","Санкт-Петербург","Севастополь"]}
```

Попытка сохранить одну строку адреса — браузерный гейт называет все три поля:

```
AFTER SUBMIT (browser gate): {"sheetStillOpen":true,
  "invalidFields":["postal_code","city","province"]}
```

Тот же submit мимо браузерного гейта (`form.noValidate = true`) — говорит сам компонент, внутри формы шторки:

```
SHEET GATE: {"insideSheet":1,
  "sheetText":"Заполните обязательные поля адреса. Без города и почтового индекса заказ не отправить.",
  "stillOpen":true}
```

Корзина, которой адрес записали через API так, как его писал старый чекаут
(`address_1` есть, остальное пусто) — кнопка оплаты заперта, причина стоит над ней:

```
PAYMENT GATE: {"warningVisible":true,
  "warningText":"Заполните обязательные поля адреса. Без города и почтового индекса заказ не отправить.",
  "payButtonDisabled":true,"payButtonText":"Оплатить1 355,00 ₽"}
```

Та же корзина мимо браузера, прямым `POST /store/carts/<id>/complete`:

```
BACKEND GATE: 400 {"type":"invalid_data",
  "message":"The shipping address is missing postal_code, city, province. A parcel cannot be posted without them."}
```

Скриншоты (1280×900 и 390×844), абсолютные пути:

```
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-address-fields/artifacts/docs/f04-address-without-city/01-sheet-default-fields-1280x900.png
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-address-fields/artifacts/docs/f04-address-without-city/01-sheet-default-fields-390x844.png
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-address-fields/artifacts/docs/f04-address-without-city/02-sheet-refused-1280x900.png
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-address-fields/artifacts/docs/f04-address-without-city/02-sheet-refused-390x844.png
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-address-fields/artifacts/docs/f04-address-without-city/03-sheet-message-1280x900.png
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-address-fields/artifacts/docs/f04-address-without-city/03-sheet-message-390x844.png
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-address-fields/artifacts/docs/f04-address-without-city/04-payment-refused-1280x900.png
/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-address-fields/artifacts/docs/f04-address-without-city/04-payment-refused-390x844.png
```

На кадре 02 всплывает родная подсказка Chromium «Please fill out this field.» — это UI браузера, а
не наша строка: у безголового Chromium интерфейс английский. Наша строка — на кадре 03.

### 2. У прошедшего заказа адрес полный

Заказ оформлен браузером целиком: контакты → адрес → курьер → демо-карта → «Оплатить».
`GET /tenants/orders/order_01M2HJ80XBH0Q0434HRCZV9HFQ?fields=shipping_address.*`, заказ №19:

```json
{"first_name":"Иван","last_name":"Тестовый","address_1":"ул. Ленина, д. 1, кв. 2",
 "city":"Москва","province":"г Москва","postal_code":"101000",
 "country_code":"ru","phone":"+79991234567"}
```

`province` — ровно та строка, из которой строятся зоны доставки (`ru-regions.ts`), так что тариф по
региону сойдётся.

Кадры: `05-sheet-filled-1280x900.png`, `06-ready-to-pay-1280x900.png`, `07-order-placed-1280x900.png`
в том же каталоге.

### 3. Список регионов русский, телефон как был

```
REGION OPTIONS: 86            (85 субъектов + плейсхолдер)
SAMPLE: ["Область","Москва","Санкт-Петербург","Севастополь","Московская область","Ленинградская область"]
LAST:   ["Ханты-Мансийский автономный округ — Югра","Чукотский автономный округ","Ямало-Ненецкий автономный округ"]
NON-CYRILLIC: []
```

Шторка контактов не тронута этим PR (`git diff` по ней пуст), замерено вживую:

```
CONTACTS: [{"id":"shipping-first-name-input","required":true},
           {"id":"shipping-last-name-input","required":true},
           {"id":"shipping-email-input","required":true,"type":"email"},
           {"id":"shipping-phone-input","required":false}]
```

Телефон остался необязательным. Кадр `08-contacts-sheet-1280x900.png`.

### 4. Тестовые заказы отменены

| Заказ | id | Статус |
|---|---|---|
| №17 | `order_01M2HHKE2QGNTHSW99H4CTCQ3A` | `canceled`, `canceled_at 2026-09-15T03:27:40.260Z` |
| №18 | `order_01M2HHZ63DHGCJNCATCC28W2QC` | `canceled`, `canceled_at 2026-09-15T03:32:44.815Z` |
| №19 | `order_01M2HJ80XBH0Q0434HRCZV9HFQ` | `canceled`, `canceled_at 2026-09-15T03:37:32.092Z` |

Все три — на локальном стенде `upready_store_f04`, живой базы они не касались.

### Дополнительно: ветка с настроенной подсказкой не сломана

Стенд перезапущен с `NEXT_PUBLIC_ADDRESS_AUTOCOMPLETE_PROVIDER=dadata` и непустым ключом:

```
WITH DADATA, checkbox unticked: {"manualCheckbox":1,"suggestContainer":1,"cityField":0}
WITH DADATA, checkbox ticked:   {"cityField":1,"postalField":1,"provinceSelect":1,"suggestContainer":0}
```

Клик по **подписи** чекбокса (не по 16-пиксельному квадратику) теперь переключает форму — до этого
PR подпись не была `<label for>` и клик по словам не делал ничего. Кадры `09-dadata-suggest-1280x900.png`,
`10-dadata-manual-1280x900.png`. После замера стенд возвращён в состояние живого хоста (без провайдера).

## Прогоны

```
apps/storefront: npx tsc --noEmit                rc=0
apps/storefront: npx next lint                   rc=0  (1 предупреждение, довоенное: <img> в yandex-metrica)
apps/storefront: npm run test:unit               rc=0  Test Files 18 passed (18)  Tests 171 passed (171)
apps/backend:    npx tsc --noEmit                rc=0
apps/backend:    npx medusa lint                 rc=0  (59 warnings, 0 errors — все довоенные)
apps/backend:    npm run test:unit -- src/workflows   rc=0  Test Suites 2 passed  Tests 12 passed
apps/backend:    npm run test:unit (весь набор)  rc=1  Tests: 1 failed, 202 passed, 203 total
```

Единственный красный тест бэкенда — `src/migration-scripts/__tests__/profile-data.unit.spec.ts`,
«i18n merge › leaves a locale the profile never translated identical to the base»: ожидаемый объект
не знает про `productOptions: {}`, появившийся в `9fdcf27`
(t-2026-09-12-mt-storefront-by-host). К этому PR он отношения не имеет —
`git diff 2cb48cd..HEAD -- apps/backend/src/migration-scripts` пуст, ни одного файла. Чинить его
здесь не стал: решение «пустой `productOptions` — это правильно или нет» принадлежит той задаче.

## Что сделано вне рамок задачи и почему

`apps/storefront/src/lib/tenant/request-shop.test.ts` — в фикстуру добавлены два поля
(`analytics`, `branding`). Они появились в `ResolvedTenant` вместе с t17-analytics и t16-branding,
а фикстуру никто не обновил, и `dev` из-за этого **не проходит `tsc --noEmit`**, а значит и
`next build` (по AGENTS.md сборка обязана быть зелёной). Без этой правки собственный гейт моего
изменения нечем было закрыть. Правка на две строки, поведение не меняет.

## Чего НЕ сделано

* **Живой магазин не трогал.** Ни деплоя, ни заказов на `cherkashino.shipshift.dev`: деплой в этом
  дне — отдельная полоса, воркеру он запрещён. Заказ #5, из-за которого задача заведена, остался
  как есть — его адрес чинить нечем, отправлять посылку по нему всё равно нельзя.
* **Ветка самовывоза не проверена вживую.** У тенанта `cherkashino` оба способа доставки имеют
  `service_zone.fulfillment_set.type = "shipping"` (замерено: `GET /store/shipping-options` вернул
  «Оксана Черкашина pickup» и «… courier», обе типа `shipping`) — настоящего pickup-fulfillment set
  на этом стенде нет, это ровно тот разрыв, который уже описан в `tests/stands/helpers.ts`. Освобождение
  самовывоза от гейта закрыто юнит-тестами (`validate-cart-shipping-address.unit.spec.ts`: корзина
  из pickup-опций проходит, смешанная — нет).
* **DaData не включал.** Ключ платный, это решение Ивана (см. ниже).

## Сколько стоит включить DaData по-настоящему

Код уже в стартере (`providers/dadata.tsx`, `react-dadata` 2.28.0-beta.0 в зависимостях витрины) и
под MIT — платить надо не за код, а за сервис. Включается двумя переменными сборки витрины
(`NEXT_PUBLIC_*` инлайнятся на билде, значит нужен пересбор образа `mt-storefront`):
`NEXT_PUBLIC_ADDRESS_AUTOCOMPLETE_PROVIDER=dadata` и
`NEXT_PUBLIC_ADDRESS_AUTOCOMPLETE_PROVIDER_API_KEY=<токен>`.

Тарифы DaData я не проверял по первоисточнику и называть цифру не буду (правило 17a): у сервиса есть
бесплатный лимит запросов в сутки и платные пакеты сверх него, порядок величин надо смотреть на
dadata.ru на день решения. Что важнее цены и что уже видно из кода:

* ключ подсказок — **публичный**, он уезжает в HTML каждой витрины; при мультитенантности это один
  ключ на все магазины, и его расход складывается по всем ним;
* ключ один на образ, а не на тенанта, — «подсказки только платным тарифам» сегодня не сделать без
  отдельной работы;
* включение **ничего не ломает**: этот PR оставляет ветку с подсказкой ровно такой, какой она была,
  плюс чекбокс «ввести вручную» рядом.

Мой совет: подсказку включать ради скорости ввода и качества данных, но **не вместо** этого фикса —
DaData без ключа, с исчерпанным лимитом или просто не нашедший адрес снова оставит витрину с одной
строкой, и держать её должен ручной ввод, который теперь стоит по умолчанию.

## Как проверить за 10 минут

```bash
# 1. стенд
createdb -h 127.0.0.1 -p 5433 -U ivanprotsko -T upready_store_cherkashina upready_store_check
cp apps/backend/.env.template apps/backend/.env   # DATABASE_URL → upready_store_check, PORT=9016
(cd apps/backend && npx medusa db:migrate && npx medusa develop)
# apps/storefront/.env: NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9016, БЕЗ переменных AUTOCOMPLETE
(cd apps/storefront && npx next dev -p 8016)

# 2. магазин
open http://cherkashino.localhost:8016/ru/store
# товар в корзину → /ru/checkout → «Адрес доставки»
# ожидается: четыре поля и русский список регионов СРАЗУ, чекбокса нет
# ввести только «Адрес» → «Сохранить» → красная строка
# «Заполните обязательные поля адреса. Без города и почтового индекса заказ не отправить.»

# 3. серверный гейт, мимо браузера
PK=$(curl -s 'http://localhost:9016/storefront/by-host?host=cherkashino.localhost' | python3 -c 'import json,sys;print(json.load(sys.stdin)["publishable_key"])')
# создать корзину, записать адрес без города, добавить способ доставки, затем:
curl -s -X POST -H "x-publishable-api-key: $PK" http://localhost:9016/store/carts/<id>/complete
# ожидается 400 invalid_data «The shipping address is missing postal_code, city…»

# 4. тесты
(cd apps/backend && npm run test:unit -- src/workflows)   # 12 passed
(cd apps/storefront && npm run test:unit && npx tsc --noEmit)
```
