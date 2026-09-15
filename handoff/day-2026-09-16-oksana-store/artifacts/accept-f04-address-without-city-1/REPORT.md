# Приёмка PR #40 — f04-address-without-city, раунд 1

Приёмщик: headless `claude -p`, основной чекаут `dev`. Отчёт составлен 2026-09-15 11:55 WITA.
Ветка PR: `fix/day16-address-fields` → база `dev`, HEAD `994325d`, `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`.

Все замеры ниже сняты МНОЙ, а не переписаны из отчёта воркера (правило 18f).

## Где мерил

Живой магазин `cherkashino.shipshift.dev` этим кодом ещё не обслуживается: деплой — отдельная задача дня
(d03), воркеру он запрещён. Поэтому мерил на стенде, который поднят из ЭТОЙ ветки:

* витрина — `next-server` pid 35858, cwd `…/worktrees/b29f7dd2…/fix/day16-address-fields/apps/storefront`
  (замер `lsof -a -p 35858 -d cwd`), адрес `http://cherkashino.localhost:8016`;
* бэкенд — `@medusajs/cli develop` pid 60136 из того же worktree, `http://localhost:9016`, БД `upready_store_f04`
  (копия `upready_store_cherkashina`, тенант `cherkashino`, регион Russia/RUB);
* провайдер подсказок не задан — то же, что задаёт живому хосту `deploy/compose.mt.yml`.

## 1. Серверный гейт (мимо браузера)

Скрипт `/tmp/acc-f04/api-gate.mjs`: корзина тенанта `cherkashino`, адрес записан так, как его писал старый
чекаут (`address_1` есть, город/индекс/регион пусты), способ доставки «Оксана Черкашина courier», платёжная
сессия создана.

```
COMPLETE (empty city): 400 {"type":"invalid_data",
  "message":"The shipping address is missing postal_code, city, province. A parcel cannot be posted without them."}
COMPLETE (full address): 200 order order_01M2HK3049JAW17RDR0NSDS4VW #20
ORDER ADDRESS {"first_name":"Приёмка","last_name":"F04","address_1":"ул. Ленина, д. 1, кв. 2",
  "city":"Москва","country_code":"ru","province":"г Москва","postal_code":"101000","phone":"+79991234567"}
```

Критерий 2 закрыт: у прошедшего заказа `city`, `postal_code` и `province` непустые.

## 2. Витрина, шторка адреса по умолчанию (критерий 1)

```
SHEET SHAPE: {"address_1":1,"city":1,"postal_code":1,"checkbox":0,
              "cityRequired":true,"postalRequired":true}
BROWSER GATE: {"sheetStillOpen":true,"invalid":["postal_code","city","province"]}
SHEET MESSAGE (1280 и 390): {"visible":true,
  "text":"Заполните обязательные поля адреса. Без города и почтового индекса заказ не отправить.",
  "sheetStillOpen":true}
PAYMENT GATE 1280: {"warningVisible":true,"payDisabled":true,"payText":"Оплатить1 365,00 ₽",
  "warningText":"Заполните обязательные поля адреса. Без города и почтового индекса заказ не отправить."}
PAYMENT GATE 390:  то же, payDisabled=true
```

Чекбокса «ввести вручную» на стенде без подсказок нет — структурные поля стоят сразу, это вариант 1 из задачи.
Кадр 02 ловит родную подсказку Chromium (интерфейс безголового браузера английский), наша русская строка — на
кадре 03.

## 3. Список регионов и телефон (критерий 3)

```
AFTER WAIT: {"select":true,"selectRequired":true,"count":86,
  "first":["Область","Москва","Санкт-Петербург","Севастополь","Московская область"],
  "last":["Ханты-Мансийский автономный округ — Югра","Чукотский автономный округ","Ямало-Ненецкий автономный округ"],
  "nonCyrillic":[]}
```

Список русский, 86 пунктов (85 субъектов + плейсхолдер). Поле телефона живёт в шторке контактов, которой PR
не касается (`git diff origin/dev...HEAD` по ней пуст).

## 4. Самовывоз — регрессии нет

Проверял отдельно, потому что бэкенд-гейт мог запереть корзину с намеренно пустым адресом. Витрина
(`isPickupShippingOption`) и бэкенд (`allMethodsArePickup`) решают вопрос по ОДНОМУ признаку —
`service_zone.fulfillment_set.type === "pickup"`, так что расхождения между «витрина обнулила адрес» и «бэкенд
требует адрес» быть не может. У тенанта `cherkashino` опция «pickup» имеет тип `shipping` (замер
`GET /store/shipping-options`), поэтому витрина её пунктом самовывоза не считает и адрес не обнуляет — это
разрыв сидирования, описанный воркером и существовавший до PR.

## 5. Прогоны (мои)

```
apps/storefront: npx tsc --noEmit        rc=0
apps/storefront: npm run test:unit       rc=0  18 files / 171 tests passed
apps/backend:    npx tsc --noEmit        rc=0
apps/backend:    npm run test:unit       rc=1  1 failed, 202 passed
```

Единственный красный — `src/migration-scripts/__tests__/profile-data.unit.spec.ts` «i18n merge › leaves a locale
the profile never translated identical to the base». Проверил на базе: тот же тест падает в основном чекауте на
`dev` (`e93a837`), тем же `toEqual` в строке 224. К PR отношения не имеет.

Правку вне рамок задачи (`src/lib/tenant/request-shop.test.ts`, +3 строки в фикстуре) тоже проверил по базе:
на `dev` `npx tsc --noEmit` в витрине падает ровно одной ошибкой TS2739 в этом файле (`analytics`, `branding`
отсутствуют в фикстуре). Правка чинит `dev`, а не расширяет задачу.

## 6. Что не проверено и остаётся на потом

1. **Живой магазин.** `cherkashino.shipshift.dev` этого кода ещё не несёт. Гейт должен быть перемерен на живом
   после d03 — это работа приёмки q03, не воркера.
2. **Скриншоты воркера не в PR.** Файлы `artifacts/docs/f04-address-without-city/*.png` лежат в worktree
   неотслеживаемыми (`git status` — 14 файлов `??`), хотя отчёт в PR ссылается на них абсолютными путями. Мелочь,
   на слияние не влияет: свои кадры я снял сам (ниже).
3. **Мой тестовый заказ #20** (`order_01M2HK3049JAW17RDR0NSDS4VW`) остался на локальном стенде
   `upready_store_f04` неотменённым — живой базы он не касается.
