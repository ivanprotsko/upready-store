# b02-legal-and-redirects — отчёт

Написан 2026-09-15 23:28 WITA. Ветка `fix/day16-legal-and-redirects`, база `dev`.
Источник задачи: `artifacts/q03-gap-recheck/gap-recheck.md`, пункты 3 и 4 раздела
«Что мы сегодня сломали или не доделали».

Живой хост не менялся: ни деплоя, ни записи в живую БД. Всё, что ниже, измерено на моём стенде
`upready_store_b02` — БД-клон магазина Оксаны — и на живом магазине ТОЛЬКО чтением (curl и
GET-запросы API владельца).

## 1. Покупатель видит `{{ТОКЕНЫ}}` на юридических страницах

### Почему так было (диагноз, не гипотеза)

Подстановка на живом РАБОТАЕТ — не работает то, что подставлять. `GET /store/tenant/pages/:key`
вызывает `resolveLegalPlaceholders`, а тот по замыслу t12 оставлял незаполненный токен НА СТРАНИЦЕ
как «сигнал незаполненности». Сигнал правильный для владельца и неправильный для покупателя:
таблица `tenant_requisites` живого тенанта пуста (`GET /tenants/requisites` живьём: «не заполнено: 15»), поэтому в HTML живых страниц стоят (замер 2026-09-15 22:30 WITA):

| Страница | Вхождения токенов в HTML |
|---|---|
| `/ru/pages/contacts` | ЮР_АДРЕС×10, ФИО_ИП×10, ОГРНИП×8, ИНН×8, EMAIL×4, ТЕЛЕФОН×2 |
| `/ru/pages/offer` | EMAIL×12, ФИО_ИП×8, ТЕЛЕФОН×8, ЮР_АДРЕС×6, ОГРНИП×4, ИНН×4, СПОСОБЫ_ДОСТАВКИ×2, ДАТА_ВСТУПЛЕНИЯ×2 |
| `/ru/pages/privacy` | ДАТА_РЕДАКЦИИ×8, EMAIL_ДПО×8, ФИО_ИП×6, ЮР_АДРЕС×4, ТЕЛЕФОН×2, РКН_РЕГ_НОМЕР×2, ОГРНИП×2, ИНН×2, ДАТА_УВЕДОМЛЕНИЯ_РКН×2, EMAIL×2 |

Ни кэш, ни рендер ни при чём: тела страниц в БД те же (`GET /tenants/pages/contacts?locale=ru`
живьём — 3417 знаков, 9 вхождений `{{`; ровно те же 3417/19274/15821 знаков лежат в клоне стенда).

### Что сделано

Правило Ивана: пустой реквизит НЕ показывается как токен — либо значение, либо блок скрыт с
пометкой владельцу. Публичный рендер вынесен в `apps/backend/src/tenant-legal/redact.ts`:

- значение есть → подставляется (как и раньше);
- значения нет → скрывается САМЫЙ МЕЛКИЙ блок, который витрина рисует отдельно: строка таблицы,
  пункт списка, абзац или цитата. Таблица, оставшаяся без строк, список без пунктов и заголовок
  без раздела уходят следом, лишние `---` схлопываются;
- чужой токен (`{{ДЕВИЗ_МАГАЗИНА}}`, который владелец написал сам) не трогается — это не реквизит;
- `{{ТЕЛЕФОН}}` по-прежнему удерживается, пока номер не подтверждён: теперь строка с ним просто не
  показывается, а не печатает подтверждение задним числом.

Панель (`GET /tenants/requisites`) получила поле `hidden_blocks`: страница, локаль и число скрытых
блоков — считается ТЕМ ЖЕ вызовом, что и рендер витрины, поэтому владелец видит не оценку, а факт.
На экране «Реквизиты продавца» появился блок «Заполните реквизиты: покупатель не видит часть
страниц», а вводный текст, обещавший «видимый плейсхолдер», исправлен.

### Замеры на стенде (клон базы Оксаны)

```
# тела в БД против того, что отдаётся покупателю
contacts  в БД 3417 знаков → покупателю 3152 (92%)
offer     в БД 19274 знаков → покупателю 16969 (88%)
privacy   в БД 15821 знаков → покупателю 14904 (94%)

# вхождений {{ в ответе /store/tenant/pages/<key>?locale=ru
contacts 200 → 0   offer 200 → 0   privacy 200 → 0

# в HTML витрины (cherkashino.localhost:8202/ru/pages/<key>)
contacts 200, ФИО_ИП/ОГРНИП/ЮР_АДРЕС: 0
offer    200, ФИО_ИП/ОГРНИП/ЮР_АДРЕС: 0
privacy  200, слово «ОГРНИП» ×4 — это проза документа («ИНН и ОГРНИП продавца (теги 1224/1226
         чека…)»), не плейсхолдер
```

Панель на том же стенде (реквизиты пусты, живые тексты Оксаны):

```
не заполнено: 15
hidden_blocks: [{"key":"contacts","hidden":8},{"key":"offer","hidden":22},{"key":"privacy","hidden":14}]
```

После прогона уже лежащего в репозитории `prefill-cherkashino-requisites.ts` (ФИО, ИНН, ОГРНИП,
адрес возврата, неподтверждённый телефон) — `не заполнено: 11`, скрыто 5 / 14 / 10, а на странице
контактов появляются «Индивидуальный предприниматель ИП Черкашина Оксана Ивановна», ОГРНИП и ИНН;
исчезает только строка «Адрес регистрации», которой у нас нет.

Кадры (вне git):
- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-legal-and-redirects/artifacts/docs/b02-legal-and-redirects/shots/stand-after-contacts-1280x1400.png`
- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-legal-and-redirects/artifacts/docs/b02-legal-and-redirects/shots/stand-after-offer-1280x1400.png`
- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-legal-and-redirects/artifacts/docs/b02-legal-and-redirects/shots/stand-after-privacy-1280x1400.png`
- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-legal-and-redirects/artifacts/docs/b02-legal-and-redirects/shots/stand-after-prefill-contacts-1280x1000.png`
- `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-legal-and-redirects/artifacts/docs/b02-legal-and-redirects/shots/stand-panel-requisites-1280x1000.png`

## 2. 301-редиректов нет на живом

### Чего не хватало живому (замер, а не догадка)

Механизм цел: миграция `tenant_redirect` на живом применена, middleware витрины
(`lib/tenant/redirects.ts`) ходит за таблицей и кэширует её на 60 с. Не хватало ДАННЫХ и способа их
завести: 47 строк писал одноразовый `import-cherkashino-redirects.ts`, которому на вход нужен
`02-mapping-registry*.json` из чужого worktree. Такой шаг деплой выполнить не может, поэтому на
стенде приёмки строки были, а живьём `tenant_redirect` пуста по всей платформе и старые адреса
отдают 404 (проверено 2026-09-15 22:30 WITA: `/ru/ru/products/zubnaya-pasta-tayskaya-otbelivayuschaya`
→ 404, `/ru/ru/categories/dobavki` → 404; `GET /tenants/redirects` живого владельца → `[]`).

### Что сделано

Источник правды переехал туда, куда деплой и так дотягивается — в САМИ перенесённые строки.
Импортёр пишет каждому товару и категории `metadata.migrated_from` и `metadata.source_url`, то есть
старый адрес и нынешний хендл лежат в базе:

- `apps/backend/src/tenant-redirects/migrated-redirects.ts` — чистая деривация правил;
- `apps/backend/src/scripts/backfill-tenant-redirects.ts` — идемпотентная запись;
- `apps/backend/docker-entrypoint.sh` — шаг 6 на КАЖДОМ старте контейнера, рядом с такими же
  «сходящимися» шагами 4 и 5. Отдельного ручного шага в процедуре деплоя не появляется;
- `import.mjs` теперь пишет `source_url` и категориям (класс, а не место). Категории, ввезённые
  ДО этой правки, восстанавливаются по префиксу, который несут их же товары того же
  `migrated_from`, и только если префикс у всех один; иначе строка уходит в `unmapped`, а не в
  догадку.

Два предохранителя: существующий `from_path` пропускается, а тенант после удачного прогона
штампуется (`tenant.metadata.redirects_seeded_from = {"<источник>": "<ISO>"}`) — иначе правило,
УДАЛЁННОЕ владельцем в панели, воскресало бы на каждом деплое. Каталог, ввезённый после штампа,
всё равно подхватывается (его строки новее), а `force` игнорирует штамп.

Локаль цели: сохраняется локаль старого адреса, если магазин в ней отвечает. У живого тенанта
`tenant_locale_settings` ВООБЩЕ НЕТ (`GET /tenants/locale-settings` → `{"locale_settings":null}`),
а `/ru` отвечает 200 — поэтому «настроек нет» читается как «ограничений нет», и русский адрес
уезжает на русский. Читай это как `["en"]` (дефолт `getTenantEnabledLocales`) — все 47 правил
увели бы покупателя на `/en/...`.

### Замеры на стенде

```
## ДО бэкфилла — 2026-09-15 22:51 WITA, строк в tenant_redirect: 0
/ru/ru/products/zubnaya-pasta-tayskaya-otbelivayuschaya      404
/ru/ru/categories/dobavki                                    404
/ru/ru/products/ingalyator-portativnyy                       404

## прогон (то же, что сделает деплой)
dry-run: cherkashino — 47 written, 0 already present, 0 unmapped (sources: chrxnasdmds)
запись:  cherkashino — 47 written, 0 already present, 0 unmapped
метка тенанта: {"chrxnasdmds": "2026-09-15T14:52:09.370Z"}

## ПОСЛЕ бэкфилла — 2026-09-15 22:53 WITA
/ru/ru/products/zubnaya-pasta-tayskaya-otbelivayuschaya  301 → /ru/products/zubnaya-pasta-tayskaya-otbelivayuschaya-cherkashino
/ru/ru/categories/dobavki                                301 → /ru/categories/dobavki-cherkashino
/ru/ru/products/ingalyator-portativnyy                   301 → /ru/products/ingalyator-portativnyy-cherkashino
/ru/ru/categories/multivarki                             301 → /ru/categories/multivarki-cherkashino
конечные адреса: /ru/products/…-cherkashino 200, /ru/categories/dobavki-cherkashino 200

## идемпотентность и уважение к правке владельца
второй прогон:                      0 written
владелец удалил /ru/ru/categories/dobavki → третий прогон: 0 written, строк 46 (не воскресло)
tenant=cherkashino force:            1 written, 46 already present, строк 47

## как это выполнит контейнер (СОБРАННЫЙ .js из .medusa/server)
medusa exec ./src/scripts/backfill-tenant-redirects.js → rc=0, «0 written … 12 tenant(s) examined»
```

## 3. Побочная находка: образ бэкенда не собирался

`npx medusa build --lint false` — ровно та команда, что стоит в `apps/backend/Dockerfile`
(`RUN npx medusa build --lint false && node scripts/copy-migration-data.js`) — на текущем `dev`
падала с rc=1:

```
src/scripts/f12-seed-test-order.ts:55:16 - error TS2322: Type '{ id: string[]; }' is not assignable to type 'undefined'.
```

Это сборка ОБРАЗА: следующий деплой (d05) на этом бы и встал, вместе с моим шагом 6. Причина —
`filters: { sales_channels: { id: [...] } }` инлайном: сгенерированный тип фильтров сущности знает
только её собственные колонки. Запрос не менялся, фильтр передан через промежуточный объект;
после правки `npx tsc --noEmit` по всему бэкенду — rc=0, `medusa build --lint false` — rc=0, а сам
скрипт прогнан на стенде: `f12-seed: created order order_f12testc4hga1 for cherkashino`.

Файл чужой (PR #50, f12-owner-raw-keys). Если приёмщик предпочитает отдельный PR — коммит
`99853a05` снимается одним `git revert`, но тогда образ не соберётся.

## Проверки

| Проверка | Результат |
|---|---|
| `TEST_TYPE=unit pnpm test:unit` (весь бэкенд) | 266 passed, 1 failed — падает `src/migration-scripts/__tests__/profile-data.unit.spec.ts` («productOptions»), файл и его данные на этой ветке не менялись, дефект пришёл из `dev` |
| юниты моих модулей (`src/tenant-legal`, `src/tenant-redirects`) | 4 suites, 40 passed |
| паритет с реестром импорта | 47 из 47 строк реестра воспроизведены деривацией, `unmapped` пуст |
| `pnpm test:integration:http tenants-requisites.spec.ts` | 5 passed (контракт переписан под новое правило + `hidden_blocks`) |
| `npx medusa lint` | rc=0, 61 warning (все — чужие, в моих файлах ноль) |
| `npx tsc --noEmit` (backend) | rc=0 после правки из §3 |
| `npx tsc --noEmit` (tenant-panel) | rc=0 |
| `npx medusa build --lint false` | rc=0; `.medusa/server/src/scripts/backfill-tenant-redirects.js` на месте |
| `sh -n docker-entrypoint.sh` | rc=0 |

Docker локально не запускался (приказ Ивана 2026-09-15 22:05): образ собирает живой хост в задаче
деплоя.

Оговорка про стенд: зависимости в этом worktree ставил `pnpm` 8.12.0 с PATH, а репозиторий пинит
10.11.1, и установка переписала `pnpm-lock.yaml` на `lockfileVersion: 6.0`. Файл возвращён
(`git checkout -- pnpm-lock.yaml`, в ветке его нет), но мои прогоны шли на свежем разрешении версий,
а не на залоченном. Затронутые пакеты — инструментальные (prettier, turbo); `@medusajs/*` те же
2.19.0. Приёмщику: ставить `corepack pnpm install` (AGENTS.md, «Package Manager»).

## Что НЕ сделано и почему

1. **Живой магазин не тронут.** Редиректы появятся на нём после ближайшего деплоя — старт
   контейнера напишет 47 строк сам. Проверка после деплоя:
   `curl -I https://cherkashino.shipshift.dev/ru/ru/categories/dobavki` → ожидается 301 на
   `/ru/categories/dobavki-cherkashino` (первые 60 с после старта возможен 404 — TTL кэша middleware).
2. **Реквизиты Оксаны по-прежнему неизвестны.** После деплоя покупатель перестанет видеть токены,
   но увидит МЕНЬШЕ текста, чем сегодня: скрыто будет 8 / 22 / 14 блоков. Рекомендую в d05 после
   миграций прогнать `npx medusa exec ./src/scripts/prefill-cherkashino-requisites.ts` — это
   снимает скрытие с 5 / 8 / 4 блоков (замерено на стенде) и ничего не выдумывает. В
   `docker-entrypoint.sh` я его не ставил: это данные одного клиента, а не сходимость платформы.
3. **`tenant_locale_settings` у живого тенанта нет.** Мой код это переживает, но для магазина это
   отдельный дефект (язык витрины держится на `STOREFRONT_DEFAULT_LOCALE` деплоя). Отдельной
   задачей — не моей.
4. **Пустой заголовок таблицы «Продавец»** (`| | |` в исходном тексте страницы) остаётся серой
   полосой над данными — это разметка самой страницы, была и до правки; трогать текст документа
   без владелицы не стал.

## Как приёмщику проверить за 10 минут

```bash
# 1. стенд: клон базы Оксаны + миграции
createdb -h localhost -p 5433 -U ivanprotsko -T upready_store_cherkashina upready_store_acc_b02
# apps/backend/.env: DATABASE_URL=postgres://ivanprotsko@localhost:5433/upready_store_acc_b02, PORT=92NN
cd apps/backend && npx medusa db:migrate && npx medusa develop
cd apps/storefront && npx next dev -p 82NN     # .env: NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:92NN

# 2. редиректы: до / прогон / после
curl -sI -H 'Host: cherkashino.localhost:82NN' http://127.0.0.1:82NN/ru/ru/categories/dobavki | head -1   # 404
cd apps/backend && npx medusa exec ./src/scripts/backfill-tenant-redirects.ts                              # 47 written
sleep 60 && curl -sI -H 'Host: cherkashino.localhost:82NN' http://127.0.0.1:82NN/ru/ru/categories/dobavki | head -1  # 301

# 3. юр-страницы: в ответе покупателю токенов нет
KEY=$(psql -h localhost -p 5433 -U ivanprotsko -d upready_store_acc_b02 -Atc "select k.token from tenant t join tenant_tenant_api_key_api_key l on l.tenant_id=t.id join api_key k on k.id=l.api_key_id where t.handle='cherkashino'")
for p in contacts offer privacy; do curl -s -H "x-publishable-api-key: $KEY" "http://localhost:92NN/store/tenant/pages/$p?locale=ru" | grep -c '{{'; done   # 0 0 0

# 4. владельцу это видно: GET /tenants/requisites → hidden_blocks
```
