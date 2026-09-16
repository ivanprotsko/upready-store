# w16-mp-scheduler-ops — планировщик синхронизации маркетплейсов

Ветка `feat/day16-mp-scheduler-ops`, база `dev`. Отчёт написан 2026-09-16 10:18 WITA.
В ветку влит `origin/dev` до PR (b100cf5a, w18-mp-reviews-desk). Два конфликта, оба в панели и оба
«обе стороны добавили свой пункт»: маршрут и ссылка на экран — оставлены ОБА, `/settings/marketplaces/sync`
рядом с `/settings/marketplaces/reviews`. Все проверки ниже прогнаны ПОСЛЕ мержа.
Живой хост не трогался. Инвариант «только чтение» (приказ Ивана 2026-09-16 02:46 WITA) не менялся:
планировщик зовёт `adapter.runSync`, тот зовёт только зарегистрированные чтения. Ни одного нового
места сетевого вызова, ни одного пути записи.

## Что сделано

### 1. Планировщик — `apps/backend/src/jobs/marketplace-sync.ts`
Медузовская scheduled job, просыпается раз в 5 минут (`*/5 * * * *`), обходит все тенанты стенда ×
реестр `MARKETPLACES` × виды каждого адаптера. Магазин без ключа площадки пропускается, а не падает:
не подключённый Ozon — нормальное состояние магазина, а не инцидент.

### 2. Интервалы — один именованный словарь, `apps/backend/src/modules/marketplace/schedule.ts`
Интервалы заданы по СЕМЕЙСТВАМ (`MP_SYNC_INTERVAL_MS`), а адаптерные виды разложены по семействам
вторым словарём (`MP_KIND_FAMILY`): WB грузит `cards`, Ozon — `products`, обновляются они вместе.
Спека 2.6 выполнена буквально: карточки и цены — раз в час, остатки — 15 мин, заказы — 10 мин,
отзывы и вопросы — 30 мин, аналитика — раз в сутки. Плюс своё семейство `projection` (10 мин,
ноль запросов к площадке: все экраны читают нормализованный слой, и отставший пересчёт превращает
свежий импорт в протухший экран).

Новый вид без интервала КРАСИТ СУИТУ: `__tests__/schedule.unit.spec.ts` берёт список видов из
`MARKETPLACES`, а не из своей копии — третья площадка попадёт под этот тест без правки файла.

### 3. Одиночность прогона — замок это строка `running`, держит его БАЗА
`Migration20260916014707` добавляет частичный уникальный индекс
`(tenant_id, marketplace, kind) WHERE status = 'running' AND deleted_at IS NULL`.
Правило, которое держат чтением-перед-записью, имеет окно между чтением и записью; два тика,
пришедшие вместе, оба увидели бы «ничего не идёт» и оба стартовали — а дальше два прогона делят один
лимит и оба ловят 429, ровно та поломка, ради которой правило и написано. INSERT — это и есть взятие
замка; второй получает 23505 и читается как «уже идёт».

Просроченный замок: `MP_STALE_LOCK_MS = 30 мин`. **Почему 30:** самый долгий ЗАВЕРШИВШИЙСЯ прогон на
стенде — 32 с (`wb.stocks`, 11 605 строк, замер по 35 строкам, перенесённым из приёмки w12); 30 минут
это 56× от него. Теоретический потолок одного прогона тоже ниже: самый большой таймаут запроса в
реестрах — 120 с (`statistics.orders`), одно ожидание по 429 ограничено 30 с, то есть запрос с
ретраями не выходит за ~7,5 мин. И это ровно 3× самого короткого интервала (10 мин), чтобы перехват
случался на третьем тике, а не в гонке с медленным, но живым прогоном. Перехват не молчит: мёртвая
строка закрывается как `failed` с текстом про таймаут, а не удаляется (правило 20a).

### 4. Backoff по 429 — одна политика на репозиторий, `modules/marketplace/backoff.ts`
Политика была написана ДВАЖДЫ — в `modules/wb/transport.ts` и в `modules/ozon/transport.ts`, одни и
те же три константы и две функции в обоих файлах. Планировщик сделал бы ТРЕТЬЮ копию. Вынесена в одно
место, оба транспорта импортируют её, цифры не менялись: три попытки, одно ожидание не больше 30 с,
уважается `Retry-After` / `X-Ratelimit-Retry` / `X-Ratelimit-Reset` самой площадки. Окно длиннее
потолка не высыпается, а называется: прогон заканчивается и говорит, КОГДА данные можно взять.

**Отклонение от буквы задания, названное явно.** В задании: «после трёх попыток прогон помечается
`failed`». Сделано иначе: исчерпанный 429 пишется как `rate_limited` с `retry_at`, а `failed`
остаётся за настоящими ошибками. Причина не вкусовая — это урок приёмки w03, записанный в
`~/upready/memory/upready-store-wb-sales-questions-funnel-2026-09-16.md`: первая версия красила любой
429 в `failed`, у владелицы на экране выходили четыре красных «с ошибкой» из восьми видов, при том
что три из четырёх просто ждали окна. На базовом токене WB лимит — ШТАТНЫЙ режим (в замере ниже
четыре вида из десяти вернули 429), и красная метка на штатном режиме читается как сломанная
интеграция. Значение `rate_limited` уже есть в контракте `SyncOutcome` с w03; эта задача добавила его
в общий `mp_sync_run` и научила расписание уважать `retry_at` площадки.

### 5. Видимость — экран «Маркетплейсы → Синхронизация»
`GET /tenants/marketplaces/sync` + `/settings/marketplaces/sync` в панели. Строка на
(площадка, вид): состояние, последний УДАЧНЫЙ прогон, строки, запросы, интервал, следующий запуск и
**текст последней ошибки целиком** — последняя ошибка переживает следующий успех, потому что импорт,
падающий через раз, сломан, а таблица «только последний прогон» дала бы хорошей половине спрятать
плохую.

- вид, который ни разу не запускался, говорит «ни разу не запускалась», а не показывает ноль;
- `rate_limited` — жёлтая метка «ждём площадку» и строка «площадка просит подождать до …»;
- предупреждение, когда до истечения ключа меньше 14 дней (`EXPIRY_WARNING_DAYS`, один порог на все
  площадки, уже был в контракте);
- строка оператора на КАЖДУЮ неудачу несёт площадку, вид, id эндпоинта и статус. Эндпоинт и статус
  берутся из транспортного журнала САМОГО прогона (`adapter.loadJournal`), а не разбором текста
  ошибки регуляркой.

Одна строка = один прогон: строка планировщика несёт `source_run_id` (собственный id прогона
адаптера), и `carryJournal` в `project.ts` больше не переносит этот же импорт вторым разом под
производным id — иначе каждая синхронизация показывалась бы на экране дважды.

## Что померено (правило 18f) — команды и вывод

Стенд: локальный Postgres `127.0.0.1:5433`, база `upready_store_w16` (клон `upready_store_w12` —
тенант `cherkashino`, ключ WB, 425 карточек, 35 строк `mp_sync_run` из приёмки w12).
Бэкенд `medusa develop` на 9316, панель vite на 5316. Оба остановлены по ПОРТУ в конце хода.

### Проверки

```
$ cd apps/backend && npx tsc --noEmit
rc=0
$ TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest --silent --runInBand --forceExit
Test Suites: 67 passed, 67 total
Tests:       839 passed, 839 total
$ npx medusa lint
rc=0 (0 errors, 93 warnings — их было 92 до задачи; +1 это намеренный
      `@medusajs/no-service-mutation-in-route` в новом маршруте, ровно как в status-payload.ts:
      это одна учётная строка о запросе, который САМ этот обработчик и отправил)
$ pnpm check:backend-build      # ровно то, что делает Dockerfile бэкенда
Backend build completed successfully (16.06s)
Frontend build completed successfully (21.64s)   rc=0
$ pnpm check:backend-fixtures
rc=0
$ cd apps/tenant-panel && npx tsc --noEmit && npx eslint src
rc=0, rc=0 (24 warning, ни одного нового error)
```

Суита самой задачи:

```
$ npx jest src/modules/marketplace/__tests__/schedule.unit.spec.ts
PASS  Tests: 31 passed, 31 total
$ npx jest src/modules/marketplace/__tests__/scheduler.unit.spec.ts
PASS  Tests: 9 passed, 9 total
```

`scheduler.unit.spec.ts` содержит оба теста, которых требует задание:

- **одновременность** — два `runOneSync` одного триплета, запущенных вместе: один `succeeded`,
  второй возвращает `skipped/locked`, в таблице ОДНА строка, адаптер вызван ОДИН раз, `fetch`-шпион
  `toHaveBeenCalledTimes(0)`;
- **backoff** — три попытки, ожидания `[5000, 5000]` мс, сумма проверяется против
  `MP_MAX_TOTAL_BACKOFF_MS` (произведение общих констант, а не литерал), терминальный статус
  `rate_limited` с `retry_at`; отдельный случай — окно 10 524 с (настоящий ответ WB базовому токену)
  не высыпается вовсе: одна попытка, ноль ожиданий.

### Приёмочная фикстура на стенде

`W16_TENANT=cherkashino npx medusa exec ./scripts/fixtures/w16-scheduler-acceptance.ts` (rc=0).
Полный вывод — `artifacts/docs/w16-mp-scheduler-ops/acceptance-run.txt`. Существенное:

```
=== 1. SCHEDULE (cron */5 * * * *, stale lock 30 min)
  wb: key set (…c6Sg), enabled true
    wb.cards       every    60 min | last succeeded    | due true  (interval_elapsed)
    wb.stocks      every    15 min | last succeeded    | due true  (interval_elapsed)
    wb.orders      every    10 min | last failed       | due true  (interval_elapsed)
    wb.sales       every    10 min | last NEVER RAN    | due true  (never_ran)
    wb.analytics   every  1440 min | last NEVER RAN    | due true  (never_ran)
  ozon: key NOT set, enabled false

=== 2. A STALE LOCK IS TAKEN OVER, AND THE DEAD ROW STAYS VISIBLE
  [mp-sync] wb projection: stale lock mprun_w16_stale taken over after 31 min (limit 30 min), the row is now failed
  takeover run: succeeded (stale_lock_taken_over), rows 12364
  the dead row: mprun_w16_stale — Прогон не завершился: строка «running» стоит 31 мин, дольше замка
  в 30 мин. Процесс, который его начал, пропал (перезапуск бэкенда или падение). Замок снят, вид
  разрешён к запуску.

=== 3. TWO RUNS OF ONE KIND AT DIFFERENT TIMES (wb.projection)
  run 1: succeeded, rows 12364, requests 0, run mprun_01M2KZ73EY193AY8X4181P29GQ
  run 2: succeeded, rows 12364, requests 0, run mprun_01M2KZ76FJCR0B5NPNWH8XKFS1
  run 3 (no ageing, interval not elapsed): skipped (waiting)

=== 3b. ONE RUN PER TRIPLE
  two concurrent starts -> succeeded/interval_elapsed + skipped/locked
  rows left in status=running: 0
  raw second running row: refused by Postgres — duplicate key value violates unique constraint
  "IDX_mp_sync_run_tenant_id_marketplace_kind_unique"

=== 4. A RUN THAT FAILS ON PURPOSE (wb.cards with a key WB will refuse)
  [mp-sync] wb cards: failed after 1 attempt(s), endpoint content.cards.list, status 401:
  WB content.cards.list answered 401: {"status":401,…"detail":"invalid API access token: token is
  malformed: token contains an invalid number of segments"…}
```

Про пункт 4: задание просит «направить фикстуру в 500». Хост и путь берутся из реестра чтений и
подменить их нечем — второе место сетевого вызова запрещено и ловится репо-линтом
(`single-call-site.unit.spec.ts`). Поэтому неудачный прогон вызван НЕГОДНЫМ КЛЮЧОМ: настоящий ответ
настоящей площадки, 401 вместо 500, и он проходит ровно тот же путь — красная строка, текст целиком,
строка оператора с id эндпоинта и статусом.

### Планировщик, работающий сам (не фикстура)

Бэкенд подняли и НЕ трогали; job отработала свои тики в 10:05 и 10:10 WITA. Строки, которые она
написала сама (`select kind, status, rows, requests, attempts …`):

```
    kind    |    status    | rows  | requests | attempts | sec
------------+--------------+-------+----------+----------+-----
 prices     | succeeded    |   463 |        1 |        1 |   3
 stocks     | running      |     0 |        0 |        0 |
 orders     | rate_limited |     0 |        1 |        1 |   2
 sales      | rate_limited | 21567 |        2 |        1 |  48
 feedbacks  | rate_limited |   125 |        2 |        1 |  32
 questions  | rate_limited |     0 |        1 |        1 |   1
 analytics  | succeeded    |   140 |        1 |        1 |   4
 supplies   | succeeded    |   908 |        1 |        1 |   2
 fbs_orders | succeeded    | 16311 |       19 |        1 |  18
```

и лог оператора:

```
[mp-sync] wb prices: 463 rows in 1 requests (attempt 1/3)
[wb] GET feedbacks-api.wildberries.ru/api/v1/feedbacks -> 429, attempt 1/3, waiting 28000 ms (Authorization: ***)
[mp-sync] wb orders: rate_limited after 1 attempt(s), endpoint statistics.orders, status 429: …
  [WB asks to retry in 10736 s, which is longer than this client waits inside one run (30 s).]
  Площадка откроет окно в 2026-09-16T05:08:57.667Z. Это ограничение площадки, а не поломка импорта.
```

Это и есть живая проверка того, ради чего сделан пункт 4 раздела «Backoff»: интервал `orders` — 10
минут, но площадка попросила 10 736 с, и расписание НЕ пойдёт за данными раньше названного ею
момента. Ожидание 28 000 мс у `feedbacks` — общая политика внутри потолка 30 с.

**Строка `stocks` осталась `running` — и это не дефект, а мой собственный промах, показавший работу
замка.** Я правил `src/api/tenants/marketplaces/sync/route.ts`, пока стенд работал; `medusa develop`
— это ВОТЧЕР (правило 5d), он перезапустил сервер посреди импорта остатков:

```
[Watcher] modified src/api/tenants/marketplaces/sync/route.ts modified: restarting dev server
```

Процесс, начавший прогон, пропал — ровно тот случай, ради которого написан таймаут замка. На экране
вид показан как «идёт», а следующий тик через 30 минут закроет строку как `failed` с текстом про
пропавший процесс и разрешит вид к запуску. Механику перехвата я померил отдельно (пункт 2 фикстуры
выше) и тестом.

### Экраны

- `artifacts/docs/w16-mp-scheduler-ops/sync-screen.png` — экран целиком: успех, «ни разу не
  запускалась», две красные строки с текстом ошибки целиком, мёртвая строка просроченного замка,
  Ozon с «ключ не сохранён».
- `artifacts/docs/w16-mp-scheduler-ops/live-screen.png` и `live-table-crop.png` — тот же экран во
  время работы планировщика: «Заказы — ждём площадку, через 3 ч, площадка просит подождать до
  16.09.2026 13:08:57», «Остатки на складах — идёт прямо сейчас», «Цены и скидки — успешно, 463
  строки» (это написала сама job).
- `artifacts/docs/w16-mp-scheduler-ops/expiry-screen.png` и `expiry-warning-crop.png` —
  предупреждение об истечении ключа: «Wildberries: ключ истекает через 9 дн. Выпустите новый в личном
  кабинете площадки — после истечения импорт остановится.»

**Как заглушена дата истечения — сказано явно.** Настоящий ключ Оксаны действует до 2027-03-17, за 14
дней предупреждение не покажешь. Подменён не КОД, а ДАННЫЕ: собран синтетический WB-ключ той же формы
JWT с `exp` через 10 дней и битом 30 (read only), положен обычным `wb:seed-key`, снят кадр, затем
настоящая строка `tenant_integration_secret` восстановлена из дампа (`COPY 1`, проверено
`select id, provider, is_enabled`). Наружу синтетический ключ не уходил: WB-адаптер разбирает свой JWT
локально и никуда не звонит (замер w01). Скрипт съёмки — `artifacts/docs/w16-mp-scheduler-ops/shot.mjs`.

Абсолютные пути кадров:
`file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-scheduler-ops/artifacts/docs/w16-mp-scheduler-ops/`

## Два дефекта, которые нашла приёмка (а не обзор)

1. **`isUniqueViolation` не узнавал ошибку в том виде, в каком её отдаёт продакшен.** Юнит-тест с
   собственной подделкой бросал ошибку драйвера (`code === "23505"`), а модульный сервис бросает
   другое: `dbErrorMapper` (`@medusajs/utils` 2.19) ловит 23505 и перебрасывает `MedusaError` БЕЗ
   кода и БЕЗ `cause`, оставляя только предложение «Mp sync run with tenant_id: …, marketplace: wb,
   kind: projection, already exists.». Первый прогон фикстуры на этом и умер. Починено, подделка в
   тесте теперь бросает ИЗМЕРЕННУЮ форму, плюс отдельный случай на «чужое `already exists`»,
   которое глотать нельзя.
2. **Замок искался по СВЕЖЕСТИ строки, а не по СТАТУСУ.** `newestRun` брал последнюю строку триплета;
   как только рядом с `running` оказывается более новая завершённая строка (перехват, ручная правка,
   сдвинутые часы), замок переставал быть виден, и следующий тик умирал бы на уникальном индексе
   вместо честного «уже идёт». Введён `lockOrNewest`: сначала `running`, потом самая свежая. Закрыто
   тестом, который воспроизводит именно ту раскладку.

Оба — про то, что подделка в тесте знает не всё, а замер знает (правило 18f).

## Чего НЕ сделано и почему

- **Ozon в живую не проверялся** — ключа Ozon на стенде нет (`ozon: key NOT set`), и задача w11
  принималась на записанных ответах. Планировщик обходит Ozon как «нет ключа» и пропускает его без
  ошибки; это видно на экране строкой «Ozon: ключ не сохранён, синхронизация не запускается».
- **Режим записанных ответов Ozon (`options.fixtures`) планировщику не прокинут.** `runOneSync`
  собирает `SyncDeps` без `options`, то есть по расписанию Ozon всегда пойдёт «вживую». Для продакшена
  это правильно; если понадобится расписание на фикстурах, это отдельная ручка и отдельное решение —
  молча я её не заводил.
- **Деплой** — задача его не предписывает, живой хост не тронут. Миграция `Migration20260916014707`
  добавляет три колонки и частичный уникальный индекс; на живой базе она потребует, чтобы в
  `mp_sync_run` не стояло двух `running` строк одного триплета (на стенде их не было). Перед
  выкаткой — `pg_dump`, как велит памятка.
- **Кнопки «запустить сейчас» на экране нет** намеренно: это был бы второй способ стартовать прогон,
  со своим представлением о замке.
- **Дизайн-система**: панель — форк Medusa Admin 2.19 на `@medusajs/ui`, и новый экран сделан её
  компонентами. Расхождение с каноном Geist то же самое, что записано в отчёте w01 и повторено в w12
  (втащить Geist в форк Admin значит сделать один экран непохожим на двадцать соседних); повторяю его
  здесь, а не умалчиваю.

## Как принять за 10 минут

```bash
cd /Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-mp-scheduler-ops

# 1. суита (включая оба теста задания)
cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest --silent --runInBand --forceExit
#    ждём: Tests: 816 passed, 816 total

# 2. стенд: база уже поднята и промигрирована
psql-17 -h 127.0.0.1 -p 5433 -U ivanprotsko -d upready_store_w16 \
  -c "\d mp_sync_run" | grep unique
#    ждём: IDX_mp_sync_run_tenant_id_marketplace_kind_unique UNIQUE … WHERE status = 'running'

# 3. вся приёмка одной командой (rc=0)
W16_TENANT=cherkashino npx medusa exec ./scripts/fixtures/w16-scheduler-acceptance.ts

# 4. строки прогонов
psql-17 -h 127.0.0.1 -p 5433 -U ivanprotsko -d upready_store_w16 \
  -c "select marketplace, kind, status, started_at, finished_at, rows, requests, attempts
      from mp_sync_run order by started_at desc limit 20"

# 5. экран: поднять бэкенд и панель и открыть /settings/marketplaces/sync
#    (owner@cherkashino.example / supersecret)
cd apps/backend && npx medusa develop          # PORT=9316 из apps/backend/.env
cd apps/tenant-panel && npx vite --port 5316 --strictPort
```

## Экономия

- **Скрипт вместо раунда критика.** Вся приёмка — один файл
  `scripts/fixtures/w16-scheduler-acceptance.ts`, который печатает расписание, перехват замка, две
  даты прогонов, гонку, отказ индекса и неудачный прогон одним `rc`. Он поймал ОБА дефекта из раздела
  выше — их не нашёл бы ни обзор кода, ни юнит-тест с собственной подделкой. Стоимость: 4 прогона
  фикстуры вместо неизвестного числа раундов приёмщика.
- **Тест, который нельзя обойти переименованием.** `schedule.unit.spec.ts` берёт список видов из
  `MARKETPLACES`; третья площадка попадёт под него без правки теста. Это дешевле, чем помнить.
- **Ноль сабагентов, ноль Workflow.** Задача одноголовая; фан-аут здесь стоил бы токенов и ничего не
  ускорил.
- **Что автоматизировал бы дальше.** Подделка модульного сервиса в тестах (`fakeService`) написана
  третий раз в этом репозитории (есть похожие в w03 и w12). Её место — общий помощник рядом с
  `modules/marketplace`, и тогда «бросает ту ошибку, что бросает Medusa» чинится один раз на все
  тесты, а не по месту. Отдельно: `pnpm check:backend-build` (32 с) стоит повесить перед пушем в
  любой задаче, трогающей `apps/backend` — он ловит ровно тот класс, что однажды остановил образ
  mt-backend.
