# d08-deploy-wave6 — волна дня на ЖИВОМ магазине Оксаны Черкашиной

Отчёт написан 2026-09-16 14:45 WITA. Часы хоста Contabo — CEST (UTC+2) = WITA минус 6 часов;
окно работы на хосте 07:45…08:45 CEST = **13:45…14:45 WITA**.

**Итог: на `cherkashino.shipshift.dev` работает волна дня целиком — страница товара, блог,
Robokassa в тестовом режиме, СДЭК (курьер 275,00 ₽ / ПВЗ 135,00 ₽ со сроком «1 день»),
карта пунктов выдачи со 142 точками по Москве и подсказка адреса. Тенант настроен ЧЕРЕЗ ПАНЕЛЬ
как владелец. Ключ Wildberries на хост НЕ ставился: форма в панели показывает «не сохранён».
По дороге найдены и починены ДВА дефекта волны, без которых приказ 3.2 не исполнялся вовсе.**

## 1. Два дефекта, найденные при деплое (и починенные)

Оба ломали ровно то, что заказал Иван 2026-09-16 08:31 — «всё должно быть настроено и отражено
на чекауте… карта пунктов выдачи, быстрые подсказки при вводе адреса». Оба найдены ЗАМЕРОМ, а не
чтением кода, и оба чинятся двумя-тремя строками.

### 1.1. Ключ Яндекс.Карт не доезжал до браузера — карта уходила в «не загрузилась»

`checkout-pickup-map/index.tsx` — компонент с директивой `"use client"`, и ключ он читает как
`process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY` (строка 129). Next впекает `NEXT_PUBLIC_*` **на сборке**,
а в `apps/storefront/Dockerfile` не было `ARG` с этим именем и в `deploy/compose.mt.yml` — `build.args`.
Рантайм-переменная в браузерный бандл не попадает никогда, а пустой ключ в этом компоненте —
не ошибка, а ветка `if (!apikey) { setFailed(true); return }` (строка 160): карта молча рисует
состояние «не загрузилась».

Правка — коммит `4faa9133`: `ARG`+`ENV` в Dockerfile, `build.args` и рантайм-переменная в compose.

**Доказательство на уровне образа, до подъёма, с контролем:**

```
ключ (36 символов) в /app/apps/storefront/.next/static нового образа  → 1 файл (page-c2a08104ff5e4a67.js)
КОНТРОЛЬ: тот же ключ в предыдущем образе mt-storefront:d07-live      → 0 файлов
```

### 1.2. Реквизиты СДЭК нельзя было сохранить из панели — 400 на любом вводе владельца

`PUT /tenants/delivery-settings` перед записью проверяет реквизиты вызовом
`/calculator/tarifflist`, подставляя туда либо код города, либо его **название**. Замер живого
песочного контура СДЭК (`scripts/cdek-tarifflist-probe.mjs`, лог ниже) говорит, что название
не принимается вовсе:

```
по ИМЕНИ  {city:'Москва'} → {city:'Москва'}   HTTP 400  {"code":"v2_field_is_empty","message":"[from_location.code] is empty"}
по ИМЕНИ  Москва → Новосибирск                HTTP 400  то же
по КОДУ   44 → 44                             HTTP 200  тарифов 24
по КОДУ   44 → 270 (Новосибирск)              HTTP 200  тарифов 32
```

А в форме панели (`routes/settings/delivery/delivery.tsx`) поля `sender_city_code` **нет** —
владелец может ввести только название. То есть единственный путь, которым Оксана могла бы
подключить доставку, отвечал 400 на любом вводе. Первый мой прогон настройки это и получил:
`{"type":"invalid_data","message":"СДЭК не принял эти реквизиты: CDEK /calculator/tarifflist answered 400"}`.

Правка — коммит `178ad952`: если пришло название без кода, маршрут резолвит код через
`listCities` и **сохраняет** его. Ровно ту же подстановку уже делает расчёт тарифов на чекауте
(`modules/cdek-fulfillment/service.ts:414-417`), так что это не новое поведение, а недостающее
звено в шаге проверки.

После правки тот же путь через панель: `PUT 200`, `verified: {"tariffs": 24}`,
`sender_city_code: 44` — код резолвнут из «Москва» и записан.

### 1.3. Пара `CHEROXANA_CDEK_TEST_*` из канона ключей НЕ работает (не чинил, в отчёт)

Задача называла её как тестовую. Живой СДЭК её отверг:
`{"message":"СДЭК не принял эти реквизиты: CDEK auth failed (401)"}`
(лог `logs/panel-api-cheroxana-401.json`). Рабочая тестовая пара — `CDEK_API_{ACCOUNT,PASSWORD}`
канона `~/upready/.env.keys`, та самая «sandbox-пара, edu-контур» из
`~/upready/memory/env-keys-inventory.md`; её значения побайтно равны тем, которыми живёт
эталонный магазин chrxnasdmds против `https://api.edu.cdek.ru/v2`. Настроено на ней.
**Вопрос Ивану:** что такое `CHEROXANA_CDEK_TEST_*` — устаревшая запись или второй кабинет.

## 2. Что задеплоено

| | |
|---|---|
| Работало до деплоя (по `docker inspect` контейнера, не по тегу) | `017a2318` (d07), образы `8f9ac472a845` / `7866dbe16a91` / `e8288eb4d79d` |
| `origin/dev` на момент работы | `64d5f9e0` |
| Коммитов с прошлого деплоя / файлов изменено | **39 / 1219** |
| Задеплировано | дерево коммита **`178ad952`** этой ветки = `origin/dev` + два исправления из п. 1 |
| Точка отката | `mt-{backend,storefront,panel}:d07-live` — ровно те образы, что обслуживали платформу до деплоя |

Перенос: `git archive 4faa9133 | tar -x` (6890 файлов) → `rsync -az` **без** `--delete`, с явным
исключением `deploy/mt/shipshift.env` (единственная копия секретов стенда); передано 182 625 855 байт,
rc=0. Затем единственный файл коммита `178ad952` — `scp`, приёмка по md5 **целевого** пути:
`390e4d6dfb0b2127ead4745e058ec0bf` локально и на хосте. Поскольку `178ad952` меняет ровно этот файл,
дерево на хосте по всем файлам архива равно дереву `178ad952`.

`rsync` без `--delete` оставляет на хосте файлы прошлых волн — находка d05, поведение сознательное.

## 3. Дампы и резервные копии ДО работы

| Что | Путь | Размер |
|---|---|---|
| Дамп БД (первым действием) | `/opt/upready-store/backups/medusa_mt-pre-d08-20260916-074612.sql.gz` | **5 288 298 байт** |
| Копия env стенда | `/opt/upready-store/backups/shipshift.env.pre-d08-20260916-075148` | 2980 байт |

Дамп снят формой из памятки реестра (`docker exec mt-postgres pg_dump -U medusa -d medusa_mt | gzip`),
rc=0. **Проверен на читаемость, а не только на размер:** `gunzip -t` rc=0, внутри 179 `CREATE TABLE`
и 179 `COPY public` — это не пустой поток, пережатый в архив.

## 4. Переменные окружения

Список собран не из прозы отчётов, а из КОДА: все `process.env.*` в 367 изменённых с d07 файлах,
затем поиск потребителя каждой (`rg` по приложению, которое производит артефакт).

| Переменная | Что с ней сделано | Источник значения (secretRef) |
|---|---|---|
| `INTEGRATION_ENCRYPTION_KEY` | **проверена, не тронута**: присутствует, длина 48 — ею зашифрованы ключи маркетплейсов и реквизиты; ротация стёрла бы их | уже на хосте, `deploy/mt/shipshift.env` |
| `NEXT_PUBLIC_YANDEX_MAPS_KEY` | **добавлена** (одна строка) + впечена в образ витрины через `build.args` | `IVANPROTSKO_YANDEX_MAP_KEY_ONE` в `~/upready/.env.keys` |
| `WB_WRITE_LIVE` | **отсутствует и должна отсутствовать**: это opt-in-рубильник боевой записи в WB (w20–w23). В работающем контейнере значение пустое → записи остаются dry-run | — |
| Robokassa (`ROBOKASSA_*`) | на хост НЕ ставились: пер-тенантные, вводятся в панели | `ROBOKASSA_MERCHANT_LOGIN` / `ROBOKASSA_TEST_PASSWORD_{1,2}` в `chrxnasdmds/apps/backend/.env` |
| СДЭК (`CDEK_*`) | на хост НЕ ставились: пер-тенантные, вводятся в панели | `CDEK_API_{ACCOUNT,PASSWORD}` в `~/upready/.env.keys` |
| Ozon (`OZON_*`) | на хост НЕ ставились: пер-тенантные | — (ключ не заводился) |

`shipshift.env`: 57 → 61 строка, md5 `b788f1886315a512485e0515aeb8fb53` → `15784288db58e74081f3a71fb0931835`
(добавлены один комментарий из трёх строк и одна переменная; `INTEGRATION_ENCRYPTION_KEY` после
правки — те же 48 символов).

## 5. Сборка, миграции, маркер

- Сборка трёх образов: **три `Built`, `failed to solve` = 0** (лог на хосте `mt-build-d08-20260916-075325.log`).
- Гвард f17: **`verify-runtime-modules: 513 boot modules required, all imports resolve`** (в d07 было 367 — волна добавила 146).
- `sharp` в новом образе ДО подъёма: `docker run --rm --entrypoint node mt-backend:latest -e 'require("sharp")'` → **`sharp OK 0.35.4`, rc=0**.
- `docker compose up -d --no-build`: rc=0, `mt-backend Recreated → Healthy` **с первого раза**, откат не понадобился. `mt-postgres` и `mt-ingress-sync` — `Running`, не пересоздавались.
- Ничего разрушительного: ни `down`, ни `stop`, ни `rm`, ни `volume rm`, ни `prune`.

### Миграции — 15, ровно столько, сколько принесла волна

`git diff 017a2318 origin/dev -- 'apps/backend/src/**/migrations/*'` даёт 15 новых `.ts`
(marketplace-write 1, marketplace 4, ozon 1, tenant 4, wb 5). В логе старта — те же 15 и
`Migrations completed`, **строк уровня `error` — 0** (`backend-boot.log`, 379 строк):

```
Migrating Migration20260915224049 · 20260915232037 · 20260916090000 · 20260916104500      (tenant)
Migrating Migration20260915211047 · 20260915211441 · 20260915235004 · 20260915235342 ·
          20260916064500                                                                  (wb)
Migrating Migration20260915230611                                                         (ozon)
Migrating Migration20260915235331 · 20260916000100 · 20260916014707 · 20260916015254      (marketplace)
Migrating Migration20260915223734                                                         (marketplace-write)
Migrations completed
```

### Маркер «отвечает именно код этой волны»

| Маркер | Результат |
|---|---|
| Файлы волны в РАБОТАЮЩЕМ контейнере (`store/cdek/cities`, `tenants/delivery-settings`, `tenants/marketplaces/[marketplace]/key`, `wb-write/write-transport`, `cdek-fulfillment`) | **5 из 5** |
| КОНТРОЛЬ: те же файлы в предыдущем образе `mt-backend:d07-live` | **0 из 5** |
| Правка 1.2 в работающем контейнере (`listCities` в собранном `route.js`) | найдена, 2 вхождения |
| Образ контейнера = образ, который я собрал (по ID, не по тегу) | backend `7cf5ee8be31c`·`3294834363c1`, storefront `9d3629f5ca35`, panel `ae26f430ca87` — совпали |

**Что маркером НЕ является.** Пробовал различать по HTTP новый публичный маршрут
`/store/cdek/cities`: и он, и выдуманный `/store/cdek/nonexistent-xyz` отвечают **400** одинаково —
проверка ключа публикации срабатывает до маршрутизации. Маркер не различает и в отчёт не идёт.

## 6. Настройка тенанта `cherkashino` ЧЕРЕЗ ПАНЕЛЬ

Вход в `https://panel-store.upready.dev` как владелец (учётка — в
`file:///Users/ivanprotsko/upready/.private/upready-store-day-2026-09-16/cherkashino-owner.md`,
вне git). Всё вводилось в формы панели скриптом `scripts/panel-configure.mjs` (идемпотентен).

### Приём оплат — Robokassa, ТЕСТОВЫЙ режим

Ответ панельного API после сохранения (`logs/panel-api.json`, реквизиты вырезаны):

```json
{"provider":"robokassa","is_test":true,"is_enabled":true,
 "hash_algorithm":"sha256",
 "password1":{"set":false},"password2":{"set":false},
 "test_password1":{"set":true,"last4":"XzML"},
 "test_password2":{"set":true,"last4":"Cyrs"}}
Result URL для ЛК Robokassa: https://shipshift.dev/robokassa/result
```

Боевые пароли НЕ заданы намеренно (`set:false`) — режим тестовый.

### Доставка — СДЭК, ТЕСТОВЫЙ (edu) контур

```json
{"provider":"cdek","is_test":true,"is_enabled":true,
 "test_password":{"set":true,"last4":"xcP5"},"password":{"set":false},
 "sender_mode":"warehouse","sender_city_code":44,"sender_city_name":"Москва",
 "sender_name":"Магазин Черкашина","webhook_registered":false}
verified: {"tariffs": 24}
methods: [{"name":"СДЭК — курьером до двери","kind":"courier","enabled":true},
          {"name":"СДЭК — пункт выдачи","kind":"pickup","enabled":true}]
```

`sender_city_code: 44` — результат правки 1.2 (владелец ввёл «Москва», код резолвнут и сохранён).

**Честная оговорка:** `webhook_registered: false`, СДЭК ответил `/webhooks answered 400`.
Вебхук статусов на песочном контуре не зарегистрирован; на чекаут это не влияет (тарифы, пункты
и заказ работают), но для боевого контура это отдельный пункт. Ключей WB/Ozon не вводил.

## 7. Живая витрина — что замерено

Chromium (Playwright 1.62.1), десктоп 1280×900 и мобильный 390×844, скрипт
`scripts/storefront-verify.mjs`, полный лог — `logs/storefront-verify.log`.

### Страница товара (b17)

`https://cherkashino.shipshift.dev/ru/products/mumie-altayskoe-ochischennoe-naturalnoe-100-cherkashino`
— HTTP 200, **41 картинка** в галерее, блок «Характеристики» есть, блок отзывов есть, цена и
кнопка «в корзину» на месте. Взят обогащённый в d07 товар намеренно: первый товар каталога
(`nastoyka-50-ml`) характеристик и отзывов не имеет, и кадр с него о b17 не сказал бы ничего.

### Блог (b18)

У тенанта **ноль статей** — лента отвечает 200 и честно пишет «Статей пока нет».
Чтобы проверить страницу статьи на реальности, завёл через панель ОДНУ статью, снял кадры и
**удалил её**:

```
лента ДО:          ссылок на статьи 0,  «Статей пока нет»
после публикации:  лента 200, ссылок 1 → /journal/d08-proverka-bloga
страница статьи:   200, h1 «Проверка блога после деплоя d08», текст виден
после уборки:      DELETE /tenants/articles → 200 {"deleted":true,"locales":1}
                   лента: ссылок 0 · страница статьи: 404 · строк в журнале панели: 0
```

Магазин клиента остался ровно в исходном состоянии.

### Чекаут — подсказка адреса (i03)

```
подсказок после 2 символов («Мо»):   0
подсказок после 4 символов («Моск»): 5
первые: Москва / Россия · Московский / Московская область · Московская / Кировская область ·
        Москаленки / Омская область
```

Реагирует после 3 символов и отдаёт настоящий справочник СДЭК, а не заглушку.

### Чекаут — тарифы СДЭК (i02)

Четыре карточки способа доставки:

```
Самовывоз · Заберите заказ у продавца · Адрес пришлём после заказа · Бесплатно
Курьером · До двери. Стоимость подтвердит магазин. · 300,00 ₽      (собственный способ магазина)
СДЭК — курьером до двери · 275,00 ₽    → после выбора: «СДЭК — курьером до двери · 1 день · 275,00 ₽»
СДЭК — пункт выдачи · 135,00 ₽         → после выбора: «MSK65, Москва, ул. Динамовская», срок «1 день»
```

Цена и срок — у обеих опций СДЭК.

### Чекаут — карта ПВЗ (i03)

```
карта в DOM: 1                      состояние «карта не загрузилась»: 0
скрипт api-maps.yandex.ru загружен: true      window.ymaps: object
узлов внутри контейнера карты: 124
счётчик пунктов: «Найдено пунктов выдачи: 142»   строк в списке: 142
```

142 ≥ 20 по условию приёмки. **Проверено глазами на кадре `store-06-pickup-map.png`:** нарисована
Яндекс-карта Москвы с кластерами меток СДЭК (8, 5, 3, 23, 19, 4, 7, 11, 15…), рядом список пунктов
с адресами, ближайшим метро и часами работы и кнопками «Выбрать», в шапке — цена 135,00 ₽.

### Чекаут — Robokassa (i01)

Плитка Robokassa предложена, «Оплатить» уводит на Robokassa:

```
подписанный URL: https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=OLAVKA&OutSum=725.00
  &InvId=608615149&SignatureValue=<hex>&Shp_SessionID=payses_01M2MF240NPKM8DS0VZ9DFXP79
  &SuccessUrl2=https://cherkashino.shipshift.dev/api/payment-return?provider=robokassa&…&outcome=success
  &FailUrl2=…&outcome=fail&Culture=ru&IsTest=1
адрес после редиректа: https://auth.robokassa.ru/Merchant/Index/fd04b287-… (счёт Robokassa)
заголовок страницы: «Robokassa»
страница возврата: https://cherkashino.shipshift.dev/ru/cart?error=payment_pending
  «Платёж не прошёл — Оплата ещё подтверждается…»
```

`IsTest=1` — **живых денег нет**. Платёж НЕ подтверждался: Result-вебхук на проде я намеренно не
проигрывал, хотя подпись у нас есть, — он пометил бы платёж полученным и оставил Оксане фиктивный
оплаченный заказ в реальном списке. Приказ задачи — «тестовый режим, платёж отменить», поэтому
дошёл до страницы Robokassa и до страницы возврата, а оплату бросил. Нога «вебхук → заказ» зелена
на стенде i01 (§«Реквизиты и панель»: заказ #18, `InvId=1414994503`).

### Панель — остальные экраны волны

```
/settings/wildberries → редирект на /settings/marketplaces#wb (HTTP 200)   ← w24 свёл оба в один хаб
на странице: mp-key-state-wb · mp-key-input-wb-api_key · mp-key-save-wb ·
             wb-write-section · wb-write-preview-section ·
             mp-key-state-ozon · mp-key-input-ozon-client_id · mp-key-save-ozon
состояние ключа: «не сохранён»
подпись: «Ключ вводится здесь, в поле «Токен Wildberries»: он сохраняется зашифрованным и
          обратно не показывается — только последние 4 знака»
/journal: редактор открывается, «Статей пока нет. Нажмите «Новая статья»…»
```

Ключ Wildberries на хост не ставился и ни одного обращения к WB/Ozon с хоста не сделано —
приказ Ивана от 11:37 исполнен: ключ вводит владелица сама.

## 8. Свип здоровья и защищённая инфраструктура

ДО деплоя (13:45 WITA) те же адреса уже отдавали 200 — платформа входила в работу здоровой.
Финал (14:42 WITA):

| URL | код |
|---|---|
| https://shipshift.dev/health | 200 |
| https://start.upready.dev/start/onboarding | 200 |
| https://panel-store.upready.dev/ | 200 |
| https://cherkashino.shipshift.dev/ru | 200 |
| https://cherkashino.shipshift.dev/ru/journal | 200 |
| https://zolotaya-nit-1057.shipshift.dev/ | 302 ssl=0 (как и в d07) |
| https://shipshift.dev/static/store-profiles/abstract/home-hero.webp | 200 |
| КОНТРОЛЬ: выдуманный товар того же вида | **404** |

Соседний защищённый сервис того же хоста (`agentcreatr-tribute-webhook`) не задет:
`/health` → **200**, `POST /webhook/tribute` с пустым телом → **`{"status":"invalid signature"}`**
(цепочка DNS → traefik → мост → проверка подписи жива).

Контейнеры: `mt-backend` healthy, `mt-storefront` healthy, `mt-panel` healthy,
`mt-postgres` healthy (Up 4 days — не трогал), `mt-ingress-sync` Up 4 days, `coolify-proxy` healthy,
`upreadystore-bot` Up 2 days. Диск: 92 ГБ свободно из 193 (53 % занято; было 50 % — прирост дали образы).

## 9. Что этот отчёт НЕ доказывает

- **Экранная приёмка владелицей.** Проверены страница ОДНОГО товара из 151, лента журнала и один
  чекаут-проход; остальные экраны волны (дески маркетплейсов w14–w19, Ozon w11, запись в WB w20–w23)
  на живом хосте не проверялись — у тенанта нет ключа площадки, а ставить его мне запрещено.
- **Боевой контур СДЭК и Robokassa.** Настроены ТЕСТОВЫЕ. Боевые пароли `set:false`.
- **Вебхук статусов СДЭК** не зарегистрирован (песочница ответила 400) — статусы отгрузок на
  тестовом контуре приезжать не будут.
- **Заказ до конца не доведён**: оплата не подтверждалась намеренно (п. 7).
- **Английская витрина** не проверялась — витрина клиента русская.

## 10. Что сказать Ивану

1. **Два дефекта волны чинились здесь, а не в своих задачах** (п. 1.1, 1.2). Оба — «пломбировка»:
   код фичи был правильный, но ключ не доезжал до браузера, а форма панели не могла сохраниться.
   Класс общий: *фича принята на стенде, где переменная лежит в `.env.local`, а скрипт настройки
   шлёт поле, которого в форме нет*. Кандидат в правило: приёмка фичи, у которой есть
   `NEXT_PUBLIC_*` или панельная форма, обязана пройти ТЕМ ЖЕ путём, что и владелец, на образе.
2. **`CHEROXANA_CDEK_TEST_*` не работает** (401 от СДЭК) — устаревшая запись канона или второй
   кабинет? Настроено на `CDEK_API_*`.
3. **Вебхук статусов СДЭК** не регистрируется на edu-контуре (400). Для боевого договора Черкашино
   (`CDEK_PROD_API_*`) это надо проверить отдельно.
4. **У магазина ноль статей в журнале.** Блог работает (проверено с временной статьёй, убрана),
   но лента у покупателя пустая. Нужен контент — это к владелице или к отдельной задаче.
5. **`SMTP_HOST`/`SMTP_USER`/`SMTP_FROM` в `shipshift.env` по-прежнему отсутствуют** — тянется
   с d06/d07. Env не выдумывал.
6. **Риск d07 №15 не снят:** медиа магазина лежат на одном хосте без S3 и без автобэкапов.

## 11. Проверки

Ветка меняет три файла продуктового кода (два — пломбировка деплоя, один — маршрут панели) и
артефакты приёмки. Зависимости в этом worktree не установлены (`apps/storefront/node_modules`
отсутствует), поэтому `tsc`/юниты локально не гонялись — и это честно названо, а не спрятано.
Проверкой кода служит то, что его СОБРАЛО и ЗАПУСТИЛО:

| Проверка | Где | Результат |
|---|---|---|
| Сборка трёх образов из дерева ветки | хост, `docker compose -p mt build backend storefront panel` | три `Built`, **`failed to solve` = 0** |
| Компиляция бэкенда (`medusa build`, TypeScript) — включая правку 1.2 | шаг сборки образа, дважды (полная и пересборка бэкенда) | прошла оба раза; гвард f17: **513 boot-модулей, все импорты резолвятся** |
| `sharp` в новом образе ДО подъёма | `docker run --rm --entrypoint node mt-backend:latest` | **`sharp OK 0.35.4`, rc=0** |
| Миграции на живой базе | старт контейнера | **15 применено**, `Migrations completed`, ошибок уровня `error` — **0** |
| Синтаксис `compose.mt.yml` после правки | `yaml.safe_load` локально | 5 сервисов на месте, `build.args` и `environment` несут новую переменную |
| Ключ карты впечён в бандл | `grep` по `.next/static` нового образа + КОНТРОЛЬ по старому | **1 против 0** |
| Правка 1.2 живьём | `PUT /tenants/delivery-settings` через форму панели | **200**, `verified {"tariffs":24}`, `sender_city_code: 44` |
| Живая витрина | Chromium 1.62.1, товар + журнал + статья + чекаут + карта + Robokassa | всё из п. 7, кадров 27 |
| Свип здоровья | curl | 7/7 платформенных URL, контроль 404, соседний сервис цел |
| Утечки секретов в артефактах | `grep` по каждому значению канона | **0 файлов** (пароль владельца, обе пары СДЭК, пароли Robokassa) |

## 12. Артефакты

- `report.md` (этот файл) и `report.json` — карточка UI
- `health-pre.txt` / `health-post.txt` / `health-final.txt` — свипы до, сразу после и в конце
- `host-pre.txt` / `host-post.txt` — состояние хоста до и после (образы по ID, контейнеры, диск)
- `dump-pre.txt` — дамп БД и проверка его читаемости
- `rsync.log` — перенос дерева
- `backend-boot.log` — лог старта бэкенда (15 миграций, 0 ошибок)
- `logs/panel-configure.log`, `logs/panel-api.json` — настройка через панель и ответы её API (реквизиты вырезаны)
- `logs/panel-api-cheroxana-401.json` — отказ СДЭК на паре `CHEROXANA_CDEK_TEST_*`
- `logs/storefront-verify.log` / `.json` — все замеры витрины
- `logs/journal-verify.log` / `.json` — проверка блога и уборка
- `scripts/` — `panel-configure.mjs`, `storefront-verify.mjs`, `journal-verify.mjs`,
  `journal-cleanup.mjs`, `cdek-tarifflist-probe.mjs`, `wb-key-form-probe.mjs`
- `shots/` — 27 PNG (вне git, пути ниже)

### Кадры (PNG, вне git)

- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/panel-01-payments-filled.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/panel-02-payments-saved.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/panel-03-delivery-filled.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/panel-04-delivery-saved.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/panel-05-marketplaces-hub.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/panel-06-wildberries-key-form.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/panel-07-journal-editor.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/panel-08-journal-article-editor.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/panel-09-journal-after-cleanup.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/panel-wb-marketplaces.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/panel-wb-ozon.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/panel-wb-wildberries.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/store-01-pdp-desktop.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/store-02-journal-desktop.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/store-04-address-suggest.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/store-05-delivery-options.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/store-05b-delivery-pickup-chosen.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/store-05c-delivery-courier-chosen.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/store-06-pickup-map.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/store-07-pdp-mobile.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/store-08-journal-mobile.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/store-09-robokassa-page.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/store-10-return-page.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/store-11-journal-with-article.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/store-12-article-page.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/store-13-article-mobile.png`
- `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-deploy-wave6/artifacts/docs/d08-deploy-wave6/shots/store-14-journal-after-rollback.png`

## Экономия

**Что автоматизировано скриптом вместо руками/агентами.** Ни одного сабагента и ни одного
`Workflow` — задача целиком сделана скриптами и прямыми замерами.

| Работа | Чем сделано | Что сэкономило |
|---|---|---|
| Настройка двух экранов панели (9 полей, 5 кадров) | `panel-configure.mjs`, идемпотентен | Прогонов вышло **четыре** (два — из-за дефекта 1.2 и смены пары реквизитов); руками это четыре ручных прохода по формам вместо `node <файл>` |
| Приёмка витрины: товар, журнал, чекаут, карта, Robokassa, мобильные кадры | `storefront-verify.mjs`, один прогон | Три прогона при отладке сценария — каждый заново прошёл бы ~12 шагов чекаута руками |
| Проверка блога с уборкой за собой | `journal-verify.mjs` + `journal-cleanup.mjs` | Гарантия, что тестовая статья УДАЛЕНА и это ЗАМЕРЕНО (404 + 0 строк), а не «я вроде убрал» |
| Сбор требований по env | `git diff --name-only` + `grep process.env` по 367 изменённым файлам | Вместо чтения ~20 отчётов задач (десятки тысяч токенов) — один список потребителей из кода, где правда и лежит |

**Что поймал скрипт/замер вместо раунда критика.**

1. **Детектор утечек в `panel-configure.mjs` остановил первый же прогон** до снятия кадра
   («УТЕЧКА: секрет виден…»). Раунд ревью кадров нашёл бы это в лучшем случае потом, а в
   худшем — не нашёл бы вовсе.
2. **Прямая проба СДЭК (`cdek-tarifflist-probe.mjs`, 4 вызова, ~10 секунд)** превратила гипотезу
   «наверное, нужен код города» в диагноз с цитатой ошибки API. Без неё правка 1.2 была бы
   догадкой (правило 18h).
3. **`grep` по `.next/static` двух образов** доказал правку 1.1 ещё ДО подъёма, с контролем на
   старом образе. Обнаружить это на живом сайте стоило бы ещё одного цикла сборки (~5 минут) и
   выката с неработающей картой.
4. **Сверка md5 по ЦЕЛЕВОМУ пути** после `scp` (правило 42c) — дешёвая страховка от «передал,
   но не туда».

**Чего это стоило.** Две лишние сборки образов (полная ~25 мин + бэкенд ~9 мин) — цена того,
что дефекты 1.1 и 1.2 нашлись на моей стороне, а не в приёмке у Ивана.

**Что автоматизировал бы в следующий раз.**

1. **Тест на пломбировку `NEXT_PUBLIC_*`.** Дефект 1.1 ловится статически: линт, сверяющий
   множество `NEXT_PUBLIC_*`, читаемых в `apps/storefront/src/**`, с множеством `ARG` в
   `apps/storefront/Dockerfile`. Каждое имя, которое читают и не впекают, — красная строка.
   Это ~30 строк и один прогон в CI вместо выката с мёртвой картой.
2. **Тест «форма панели покрывает обязательные поля своего API».** Дефект 1.2 — это поле
   `sender_city_code`, которое схема принимает, проверка требует, а форма не даёт ввести.
   Сверка `id=` в форме с ключами zod-схемы того же маршрута ловит весь класс.
3. **Поиск по коду, а не цикл `git show` по файлам.** На сборе потребителей env я сначала
   прогнал `git show` в цикле по 367 файлам × 7 переменных — вызов упёрся в двухминутный таймаут.
   `git grep <шаблон> origin/dev -- <путь>` делает то же за секунду. Форма,
   а не объём, — вот что стоило времени.
4. **Один `report.json` собирать из `logs/*.json`**, а не переписывать числа руками: все замеры
   уже лежат машинно-читаемыми, и карточка UI могла бы генерироваться из них.
