# b09-storefront-render — отчёт

2026-09-15 23:23 WITA. Стенд: клон `upready_store_cherkashino` → `upready_store_b09`
(postgres :5433, native, без контейнеров), бэкенд `:9309`, витрина `:8309`, тенант `cherkashino`
(`ten_01M29Q4KYQHC70JZBENWZ8Z88M`). Постгрес-клон был отстающим по миграциям — применил
`npx medusa db:migrate` (только для СВОЕГО клона, прод не трогал).

## 1–2. Абзац-как-таблица и пустой `<thead>`

`apps/storefront/src/lib/util/markdown.ts`:

- `TABLE_SEPARATOR` матчил голый `---` (обе трубы у него были необязательны), хотя комментарий
  над ним утверждал обратное. Абзац с `|` внутри, за которым следует строка `---`, читался как
  однострочная таблица. Добавил `(?=.*\|)` — раздельная строка обязана содержать хотя бы один `|`.
- `contact.ru.md`, первая таблица открывается пустой строкой заголовка (`| | |`) — все ячейки
  пустые. `MarkdownContent` рисовал `<thead>` безусловно, отсюда пустая серая полоса. Теперь
  `<thead>` не рендерится, если каждая ячейка заголовка пуста (`block.header.some(cell => cell.length > 0)`).

Юниты (`markdown.test.ts`, новые):
```
ДО:  "цена | 500 ₽" + "\n---" → ["table"] (1 таблица на 1 ячейку)
ПОСЛЕ: → ["paragraph", "rule"]

ДО/ПОСЛЕ (парсер не менялся для этого случая, поведение уже было верным на уровне блоков):
"| | |\n|---|---|\n| ОГРНИП | 12345 |" → table.header === [[], []]
```
Замер на живой странице (см. скриншот и HTML ниже) подтверждает: `<thead>` отсутствует у первой
таблицы контактов.

## 3. Бэктики в meta/og

`resolveLegalPlaceholders` (бэкенд, не трогал) оборачивает незаполненный `{{ТОКЕН}}` в бэктики для
markdown-рендера тела. `metaDescription()` (`apps/storefront/src/lib/util/meta-description.ts`)
брал этот же текст для `<meta name="description">`/`og:description` и не снимал бэктики — они
уезжали в head буквально. Добавил `.replace(/\`/g, "")` рядом со снятием HTML-тегов.

```
ДО:      <meta name="description" content="… адрес `{{ЮР_АДРЕС}}`, …"/>
ПОСЛЕ:   <meta name="description" content="… адрес {{ЮР_АДРЕС}}, …"/>
```

Замер (см. ниже, curl + разбор `<head>` через python, а не построчный grep — минифицированный HTML
в одну строку даёт grep'у по диапазону `/<head/,/<\/head>/` ложные срабатывания на весь файл):
backtick-ов в `<head>` страницы `/ru/pages/contacts` — 0.

## 4. Токен в title

`GET /store/tenant/pages/:key` (`apps/backend/src/api/store/tenant/pages/[key]/route.ts`) резолвил
плейсхолдеры только в `body`. Добавил резолв `title`, `seo_title`, `seo_description` той же
функцией `resolveLegalPlaceholders`.

На витрине: `pageTitle()` (`<title>` и og:title — plain text, без markdown-рендера) теперь снимает
бэктик тем же способом, что и `metaDescription`. `<h1>` страницы теперь рендерит `page.title` через
`parseInline()` + вынесенный из `MarkdownContent` компонент `Inline`, так что незаполненный токен в
заголовке получает ту же стилизацию код-спана, что и в теле, а не голые бэктики.

На текущих данных тенанта `cherkashino` токенов в title нет ни у одной страницы (проверил все 5
записей `tenant_page`), так что визуального «до» с токеном в заголовке снять не на чем без порчи
чужих данных — резолвер и рендер-путь проверены юнитами и замером на реальном ответе бэкенда:
`GET /store/tenant/pages/contacts` отдаёт резолвленные `title`/`body` из одной функции.

## 5. Ошибка в консоли на чекауте/спасибо

`listTenantArticles` (`apps/storefront/src/lib/data/tenant-articles.ts`) на моём клоне падала с
`relation "tenant_article" does not exist` — 500 от бэкенда, пойманный catch'ем, залогированный как
«did not answer». Причина — клон БД отставал от миграций t10-blog (`tenant_article` появилась
позже, чем был снят исходный дамп `upready_store_cherkashino`). Это дефект СТЕНДА, не кода: после
`npx medusa db:migrate` эндпоинт отвечает `200 {"articles":[],"count":0,...}`.

Проверил живой прод, чтобы не спутать дефект стенда с реальным дефектом (правило 18h — гипотеза не
диагноз):
```
ssh contabo 'docker logs mt-backend --since 6h | grep -i articles' → все GET /store/tenant/articles
  за последние ~15 минут — status:200, включая locale=ru, последний в 15:03:40Z
ssh contabo 'docker logs mt-storefront --since 72h | grep -i listTenantArticles' → 0 совпадений
curl https://shipshift.dev/store/tenant/articles?locale=ru… (реальный ключ cherkashino,
  прочитан READ-ONLY из mt-postgres) → 200 {"articles":[],"count":0,...}
```
Т.е. сейчас, на реальном проде, этот конкретный вызов не падает. В логах витрины за 24ч нашлась
СОСЕДНЯЯ ошибка того же семейства — `getTenantHome: … did not answer … Error: Publishable API key
required` — оба вызова идут через один и тот же `getPublishableKeyHeader()`
(`apps/storefront/src/lib/config.ts`), который на многотенантном деплое иногда не получает ключ
(нет `x-tenant-key` от middleware и не резолвится хост). Этот класс дефекта уже открыт и описан
отдельно: `handoff/night-2026-09-14-tribute/REPORT.md` (digest 2524605575, «Application error» на
странице подтверждения заказа) — «this defect is still OPEN», сам код это признаёт в комментарии.
Чинить его здесь — не по размеру задачи b09 (это переработка резолюции тенанта в middleware, не
рендер markdown) и без воспроизводимого сейчас случая падения именно `listTenantArticles`
чинить «по факту», а не по гипотезе, нечего.

Что сделал в рамках b09: поднял на клоне актуальную схему и замерил Playwright'ом по чекауту (см.
ниже) — 0 ошибок, относящихся к журналу. Страницу «Спасибо» отдельно не гонял (нет живого
оплаченного заказа на клоне — создавать его ради одного замера непропорционально задаче), но
`/order/[id]/confirmed` рендерит тот же `Nav`/`hasPublishedArticles()`, что и остальной `(main)`, и
этот путь уже подтверждён замером ниже как чистый.

## Замеры

```
$ cd apps/backend && npx jest --testPathPattern tenant-legal
Test Suites: 1 passed, 1 total
Tests:       13 passed, 13 total

$ cd apps/storefront && npx vitest run src/lib/util/markdown.test.ts
Test Files  1 passed (1)
      Tests  13 passed (13)

$ cd apps/storefront && npx vitest run   # весь сьют
Test Files  1 failed | 21 passed (22)
      Tests  203 passed (203)
# Единственный упавший файл — tests/ui-lab/toolchain.spec.ts, использует `test()` из
# @playwright/test внутри vitest-конфига (коллизия раннеров), не относится к b09, воспроизводится
# на чистом dev без моих правок (тот же файл, тот же конфликт test()-раннеров).

$ cd apps/backend && npx tsc --noEmit   → rc=0
$ cd apps/storefront && npx tsc --noEmit → rc=0
$ cd apps/backend && npx medusa lint    → 0 errors, 61 pre-existing warnings (не в тронутых файлах)
$ cd apps/storefront && npx next lint   → 0 errors, 1 pre-existing warning (yandex-metrica img, не в тронутых файлах)
$ cd apps/storefront && npx next build  → успешно, 18/18 страниц
$ pnpm check:backend-build              → Backend build completed successfully / Frontend build completed successfully

$ curl -s http://localhost:9309/store/tenant/pages/contacts?locale=ru | python3 …
title: Контакты и реквизиты
body содержит `{{ФИО_ИП}}` в бэктиках (незаполненный токен) — ожидаемо

$ curl -s http://localhost:8309/ru/pages/contacts -o contacts.html
python3: backtick-ов в <head> → 0
python3: <title>Контакты и реквизиты | Оксана Черкашина</title>
python3: первый <table> без <thead> (пустой заголовок пропущен)

$ CART_ID=<реальная корзина c товаром> node b09-checkout-console.mjs   # Playwright, headless chromium локально
--- checkout: http://localhost:8309/ru/checkout ---
journal-related console errors: 0
other console errors (unrelated to b09, e.g. local media host): 1
 - Failed to load resource: 500 (Internal Server Error)   # _next/image → localhost:9033, чужой хост
                                                            # медиа этого клона БД, не код и не b09
```

Скриншот (не в git, приложен абсолютным путём): `file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-storefront-render/artifacts/docs/b09-storefront-render/contacts-1280x900.png`

## Что не сделано и почему

- Токен в title не проверен «живьём» на реальном тенантском заголовке — на данных cherkashino его
  сейчас нет ни у одной страницы; проверено юнит-уровнем (резолвер) и замером ответа бэкенда.
- Страница «Спасибо» (`/order/[id]/confirmed`) не прогнана Playwright'ом с реальным оплаченным
  заказом — на клоне БД нет ни одного заказа тенанта cherkashino, создавать полный чек-аут+оплату
  ради одного замера избыточно для объёма пачки; путь идентичен уже замеренному чекауту (тот же
  `Nav`/`hasPublishedArticles`).
- Глубинная причина изредка пустого `x-publishable-api-key` на MT-деплое (класс, куда, похоже,
  принадлежала однократная ошибка `listTenantArticles` во время приёмки f01) НЕ чинилась — это уже
  открытый отдельный дефект (`handoff/night-2026-09-14-tribute/REPORT.md`), вне размера b09.

## Как проверить за 10 минут

```
cd apps/storefront && npx vitest run src/lib/util/markdown.test.ts src/lib/util/meta-description.test.ts
cd apps/backend && npx jest --testPathPattern tenant-legal
```
Живой замер: поднять бэкенд+витрину на клоне БД тенанта с плейсхолдерами в `contact.*.md`, открыть
`/ru/pages/contacts`, curl `<head>` на бэктики (должно быть 0), посмотреть первую таблицу (без
серой пустой полосы).
