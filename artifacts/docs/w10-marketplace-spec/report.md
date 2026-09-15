# w10-marketplace-spec — отчёт

Ветка `feat/day16-marketplace-spec`. Задача исследовательско-проектная: **кода продукта не трогала**
(`apps/**` в диффе отсутствует), меняет только `handoff/day-2026-09-16-oksana-store/` и
`artifacts/docs/w10-marketplace-spec/`.

## Что сделано

1. **Прочитана документация обеих площадок через браузер Ивана** (его разрешение 04:41 WITA) и сохранена
   как текст рядом с отчётом — 13 файлов в `artifacts/docs/w10-marketplace-spec/docs/`, включая ВСЮ справку
   Ozon Seller API 2.1 одной страницей (1 441 722 символа) и четыре раздела WB.
2. **Построены индексы методов**: `ozon-methods-index.tsv` — 467 методов Ozon (METHOD / PATH / SUMMARY /
   первая строка описания), `wb-methods-index.tsv` — 262 метода WB по пяти разделам.
3. **Написана спецификация** `handoff/day-2026-09-16-oksana-store/research/marketplace-spec.md` (495 строк):
   матрица паритета из 26 строк против InSales «Комбо», архитектура общего ядра `marketplace` с адаптерами,
   что нужно от Ивана под Ozon, фаза записи (проектируется, не строится), разбивка на задачи.
4. **Заведена очередь задач** `research/marketplace-tasks.json` — 9 задач `w11`…`w19` в формате записей
   `tasks.json`, с зависимостями, приоритетами и измеримой приёмкой.
5. **Написаны промпты исполнителям** `research/marketplace-prompts/<id>.md` — 9 файлов, 700 строк,
   по образцу `prompts/w01-wb-readonly-client.md`.
6. **Закрыт открытый вопрос задачи w01**: найден источник смысла битов маски `s` у WB-токена.

## Главные находки (каждая с источником)

### 1. У Ozon глагол не защищает — нужен реестр чтений, и двойная бухгалтерия POST станет нормой
Из 467 разобранных методов Ozon **461 POST и 6 GET**. `POST /v3/product/list` — «получить список товаров»,
`POST /v3/product/import` — создать и обновить товар, `POST /v2/products/stocks` — переписать остатки,
`POST /v1/review/comment/create` — опубликовать комментарий под отзывом покупателя. Один глагол, один хост.
Значит подход w01 (allow-list точных пар «метод + путь» с цитатой из документации и ручным дублем списка
POST-ов в тесте) — единственный работающий, и для Ozon он покрывает весь реестр, а не исключения.

Измерение (команда и вывод):
```
$ node parse-ozon.cjs docs.ozon.ru-api-seller-index.txt ozon-methods-index.tsv
methods: 467
by verb: {"GET":6,"POST":461}
groups: v1/fbp:46 v1/product:40 v1/warehouse:33 v1/carriage:26 v2/posting:23 v1/posting:22 …
```

### 2. У WB один путь бывает и чтением, и записью
`POST /api/v3/stocks/{warehouseId}` — «Get Inventory», `PUT` того же пути — «Update Inventory», `DELETE` —
«Delete Inventory». `GET /api/v3/supplies` — список поставок, `POST` того же пути — создание поставки
(`docs/dev.wildberries.ru-en-orders-fbs.txt`, строки 1810 и 1889). Из 262 разобранных методов WB 52 мутирующие.
Отсюда в спеке появился **пятый пояс — deny-list мутаций** (раздел 2.5): опечатка в глаголе глазом не видна.

### 3. Закрыт `readOnly: 'unknown'` из w01 — найдена документированная таблица битов
`dev.wildberries.ru/en/docs/openapi/api-information`, раздел Authorization, таблица «Bit values»
(копия: `docs/dev.wildberries.ru-ru-api-information.txt`): бит **30 = «Read only token»**, биты 1–16 —
категории доступа. Ключ Оксаны имеет биты 1,2,3,4,5,7,30 → **токен только на чтение**, категории Content,
Analytics, Prices and discounts, Marketplace, Statistics, Feedbacks and Questions. Это же объясняет
измеренные штабом 403 у `supplies-api` (бит 10) и `finance-api` (бит 13). Заведено задачей `w13`.

### 4. Лимиты и песочницы — из документации, не по памяти
- **Ozon**: не больше **50 запросов в секунду** на все методы с одного Client-Id; `/v1/analytics/data` — не
  чаще 1 раза в минуту; ключ живёт **3 месяца**, дата в `expires_at` метода `POST /v1/roles`.
- **WB**: token bucket; для категории Marketplace персональный токен 300 запросов/мин, burst 20; ответ 4XX
  считается за 10 запросов; заголовки `X-Ratelimit-Remaining / -Retry / -Reset / -Limit`.
- **Песочница у WB есть** (`*-sandbox.wildberries.ru`, токен с опцией Test scope, 1 запрос/сек).
  **У Ozon песочницы не найдено** — на странице Seller API тестового контура нет. Следствие: задача `w11`
  принимается на записанных фикстурах, живой прогон — когда появится ключ.

### 5. Платные подписки Ozon упираются в паритет
Отзывы требуют подписки «Управление отзывами» или Premium Pro, вопросы — Premium Plus, чаты — Premium
Plus/Pro, часть финансовых отчётов — Premium Plus/Pro. Это не наше ограничение и обойти его кодом нельзя;
в промптах `w18` и `w19` прямо сказано записывать реальный ответ кабинета, а не предполагать.

## Как это снято (антибот) — воспроизводимо

Дешёвая проба сначала:
```
$ curl -s -o /dev/null -w "%{http_code}" https://docs.ozon.ru/api/seller/      -> 307 (и цикл ?__rr=1…5, затем 403)
$ curl -s -o /dev/null -w "%{http_code}" https://dev.wildberries.ru/           -> 498
$ curl -s -o /dev/null -w "%{http_code}" https://api-seller.ozon.ru/           -> 403
$ curl -s -o /dev/null -w "%{http_code}" https://www.insales.ru/page/marketplace -> 200
```
Playwright, поднимающий Chrome сам, тоже отбивается — измерение сохранено
(`docs/BLOCKED-by-antibot-playwright-launch-dev.wildberries.ru.txt`, HTTP 498, 17 символов тела):
```
OK  403 191ch 1links  -> docs.ozon.ru-api-seller-index.txt
OK  498 17ch  0links  -> dev.wildberries.ru-api-information.txt
```
Проходит Chrome, запущенный руками с `--remote-debugging-port` и управляемый по CDP (тот же вывод, что у w01):
```
OK  403 1043014ch 1612links -> docs.ozon.ru-api-seller-index.txt
OK  200 6667ch    90links   -> insales.ru-page-marketplace.txt
OK  498 28912ch   142links  -> dev.wildberries.ru-ru-api-information.txt
OK  200 71152ch   142links  -> dev.wildberries.ru-en-orders-fbs.txt
OK  200 46580ch   84links   -> dev.wildberries.ru-en-analytics.txt
OK  200 3579ch    57links   -> dev.wildberries.ru-en-sandbox.txt
```
(HTTP в шапке — код ПЕРВОГО ответа; содержимое приезжает SPA после него, поэтому 403/498 рядом с сотнями
килобайт текста — это не противоречие, а честная запись обоих фактов.)

Браузер остановлен по ПОРТУ, не по имени:
```
$ /usr/sbin/lsof -t -nP -iTCP:9333 -sTCP:LISTEN | xargs -r kill -9
$ /usr/sbin/lsof -t -nP -iTCP:9333 -sTCP:LISTEN | wc -l   -> 0
$ ps -axo pid=,command= | grep 'chrome-cdp-profile' | grep -v grep | wc -l  -> 0
```

Рецепт и оба скрипта лежат рядом: `artifacts/docs/w10-marketplace-spec/scripts/`.

## Проверки

```
$ node -e '<схема marketplace-tasks.json>'
tasks: 9
schema OK
w11-ozon-readonly-client(88) w12-marketplace-core(86) w13-wb-readonly-flag(84) w14-mp-catalog-link(80)
w15-mp-orders-desk(78) w16-mp-scheduler-ops(76) w17-mp-price-stock-table(74) w18-mp-reviews-desk(72)
w19-mp-analytics(70)

$ node -e '<сверка задач и промптов>'
prompts <-> tasks OK (9)

$ git diff --name-only origin/dev...HEAD | wc -l     -> 29
$ git diff --name-only origin/dev...HEAD | grep -c HANDOFF   -> 0
$ git diff --name-only origin/dev...HEAD | grep -c '^apps/'  -> 0
```

Секреты:
```
$ git diff --name-only origin/dev...HEAD | xargs grep -lE "eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\."   -> пусто (rc=1)
$ grep -rlE "Api-Key: *[A-Za-z0-9-]{20,}" artifacts/docs/w10-marketplace-spec/                          -> пусто (rc=1)
$ git grep -n -E "Client-Id: *[0-9]{3,}" -- .                                                           -> пусто (rc=1)
```
Оговорка честно: `git grep -n "eyJhbGci" -- .` по ВСЕЙ ветке НЕ пуст — совпадения приходят из файлов,
которые стоят на `dev` до этой ветки (`artifacts/docs/2026-09-10-mt-vendors-acceptance.md`, тестовая
константа в `modules/wb/__tests__/transport.unit.spec.ts`, тексты промптов, где строка упомянута как
предмет проверки). Ни в одном ДОБАВЛЕННОМ этой веткой файле JWT-подобной строки нет — это и показано
первой командой выше.

## Чего НЕ сделано и почему

- **Кода не написано** — по заданию: задача ставит спецификацию и очередь задач, строят `w11`…`w19`.
- **К API площадок не обращались**: ключ Ozon ещё не выдан, ключ WB для этой задачи не нужен. Поэтому все
  утверждения о методах — из документации и сохранённых копий, ни одно не из живого ответа.
- **Уровни доступа ключа Ozon не перечислены** — страница Seller API их не перечисляет. Так и записано,
  без домысла; фактические права отдаёт `POST /v1/roles` после подключения.
- **Яндекс Маркет и Avito** (строка 1 матрицы) не заведены задачами — ключей нет, документация не читалась.
- **Реклама CPC/CPA** (строка 18) не заведена: у WB нужна категория Promotion, бита 6 у ключа Оксаны нет;
  у Ozon рекламная статистика живёт в Performance API, а не в Seller API — это отдельное исследование.
- **Фаза записи** (передача остатков и цен, ответы на отзывы, сборка заказов) спроектирована на бумаге
  (раздел 4 спеки), но не заведена задачей — нужен явный приказ Ивана.
- **Разделы WB `promotion`, `documents-and-accounting`, `orders-dbs`, `orders-dbw`, `in-store-pickup`,
  `orders-fbw`** не выкачаны: ключ Оксаны этих категорий не имеет, и для сегодняшней матрицы они не нужны.

## Как приёмщику проверить за 10 минут

1. Открыть `handoff/day-2026-09-16-oksana-store/research/marketplace-spec.md` — раздел 1 (матрица паритета,
   26 строк) и раздел 5 (разбивка на задачи).
2. Взять любую строку матрицы с методом и проверить его по сохранённой копии, например:
   ```
   grep -n "/v4/posting/fbs/list" artifacts/docs/w10-marketplace-spec/docs/ozon-methods-index.tsv
   grep -n "Read only token"      artifacts/docs/w10-marketplace-spec/docs/dev.wildberries.ru-ru-api-information.txt
   grep -n "50 запросов в секунду" artifacts/docs/w10-marketplace-spec/docs/docs.ozon.ru-api-seller-index.txt
   ```
3. Проверить очередь задач:
   ```
   node -e 'const a=require("./handoff/day-2026-09-16-oksana-store/research/marketplace-tasks.json");
            console.log(a.length, a.map(t=>t.id).join(" "))'
   ls handoff/day-2026-09-16-oksana-store/research/marketplace-prompts/
   ```
4. Убедиться, что кода нет: `git diff --name-only origin/dev...HEAD | grep '^apps/'` → пусто.
