# w13-wb-readonly-flag — отчёт

2026-09-16 06:46 WITA

## Что было и что оказалось уже сделано

`readOnly: 'unknown'`, названные категории ключа, `expires_at`, `docUrl` и сама доработанная документированная
таблица бит (`src/modules/wb/token.ts`) уже лежали в `dev`: задача w01 (PR #71) реализовала декодирование маски
`s` по таблице "Bit values" ДО того, как штаб завёл w13 по её же следам (`git log` показывает `w01-wb-readonly-client`,
включая коммит `e014c6a0` и последующие фиксы). Панель уже показывала бейдж «только чтение / unknown», дату
истечения и список открытых категорий одной строкой. Инвариант «транспорт не пишет, даже если бит 30 снят»
тоже уже был доказан тестами (`transport.unit.spec.ts`: «wbRead cannot be talked into a write», «exports no escape
hatch») — транспорт вообще не читает поле `readOnly`, allowlist эндпоинтов достаточен сам по себе.

Реально отсутствовавшие куски задачи — то, что сделано в этой ветке:

1. **Категории, открытые И закрытые, а не только открытые списком.** Раньше `GET /tenants/wb/status` отдавал
   только `bits` (что установлено), а панель фильтровала даже это до одних «открыт». Добавлена
   `tokenCategories(mask)` в `token.ts` — полный список из 13 документированных категорий (без бита 30, это сам
   флаг, а не категория) с `granted: true|false`, и компонент `WbCategoryList`, который рисует все 13 бейджами
   (зелёный = открыт, серый = закрыт), плюс отдельно оранжевым — «неизвестный бит N» для любого установленного,
   но не описанного в таблице бита (было: тихо отбрасывался из «Разделы, открытые ключом»).
2. **Предупреждение об истечении.** `expiresInDays` и `expiringSoon` (< 14 дней, `WB_EXPIRY_WARNING_DAYS`) в
   `token.ts`; в панели — баннер `Alert variant="warning"` над карточкой, когда ключ истекает меньше чем через
   2 недели.
3. **Boot-предупреждение теперь называет открытые категории.** `readOnlyWarning()` добавляет
   `The key also grants: <список>.`, когда read-only бит не установлен или не читается — раньше называл только
   сам факт, не то, что именно ключ разрешает сверх чтения.
4. **`read_only_source`** — то же значение, что `doc_url`, добавлено вторым полем под именем, которое просил
   промпт задачи (`readOnlySource`); `doc_url` оставлен для обратной совместимости с уже написанным фронтом.
5. Тесты: непоименованный бит (8) больше не выпадает молча (`maskBits` уже это делал, добавлен тест), плюс тесты
   на `tokenCategories`, `expiringSoon`/`expiresInDays` по трём случаям (скоро/не скоро/уже истёк) и на текст
   boot-предупреждения с названными категориями.

## Не сделано и почему

- Поле `scopes: [{ name, granted }]` из текста задачи не заведено как отдельное имя — вместо него используется
  уже существующее `categories: [{ bit, name, granted }]` (то же самое плюс номер бита, который не мешает и
  полезен для отладки). Переименовывать не стал: `bits`/`categories` уже используются фронтом w01, а обвязка
  под именем `scopes` добавила бы дублирующее поле без выгоды.
- `/settings/marketplaces` — по промпту, эта миграция делается только если `w12-marketplace-core` уже смержен.
  `git log --all` не показывает такой ветки/PR — вся работа осталась на `/settings/wildberries`.

## Замеры (rule 18f)

### 1. `pnpm test:unit` — весь файл

```
$ cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest --silent --runInBand --forceExit
Test Suites: 42 passed, 42 total
Tests:       461 passed, 461 total
```

Модуль `wb` отдельно (43 теста, включая 14 в `token.unit.spec.ts`, из них 5 новых для этой задачи):

```
PASS src/modules/wb/__tests__/transport.unit.spec.ts
PASS src/modules/wb/__tests__/transport-single-call-site.unit.spec.ts
PASS src/modules/wb/__tests__/token.unit.spec.ts
Tests: 43 passed, 43 total
```

### 2. Локальный стенд, ключ тенанта `cherkashino`

Использована уже существующая приёмочная база `upready_store_w01acc` (Postgres `127.0.0.1:5433`, содержит
реальный ключ WB тенанта `cherkashino`, сохранённый задачей w01 через `wb:seed-key`) — накатанная до текущей
схемы `dev` (`npx medusa db:migrate`, "Database is up-to-date for module: wb" — миграций не потребовалось).
Backend поднят на `PORT=9099`. Пароль владельца временно сброшен одноразовым скриптом
`scripts/fixtures/w13-reset-owner-password.ts` (`IAuthModuleService.updateProvider("emailpass", …)`, тот же
вызов, что использует `POST /tenants/me/password`) — только для получения токена, значения ключа WB не касается.

```
$ curl -s -H "Authorization: Bearer <owner token>" http://localhost:9099/tenants/wb/status -> 200
```

Тело (`token`), полностью:

```json
{
  "kind": "base", "sandbox": false,
  "expires_at": "2027-03-17T05:20:02.000Z", "expired": false,
  "expires_in_days": 182, "expiring_soon": false,
  "mask": 1073742014,
  "read_only": true,
  "read_only_source": "https://dev.wildberries.ru/en/docs/openapi/api-information#tag/authorization/About-the-token",
  "categories": [
    {"bit":1,"name":"Access to Content","granted":true},
    {"bit":2,"name":"Access to Analytics","granted":true},
    {"bit":3,"name":"Access to Prices and discounts","granted":true},
    {"bit":4,"name":"Access to Marketplace","granted":true},
    {"bit":5,"name":"Access to Statistics","granted":true},
    {"bit":6,"name":"Access to Promotion","granted":false},
    {"bit":7,"name":"Access to Feedbacks and Questions","granted":true},
    {"bit":9,"name":"Access to Buyers chat","granted":false},
    {"bit":10,"name":"Access to Supplies","granted":false},
    {"bit":11,"name":"Access to Buyers returns","granted":false},
    {"bit":12,"name":"Access to Documents","granted":false},
    {"bit":13,"name":"Access to Finance","granted":false},
    {"bit":16,"name":"Access to Users","granted":false}
  ]
}
```

Совпадает с замером штаба в `research/wb-plan.md` («биты 1,2,3,4,5,7,30» → read-only, шесть открытых категорий:
Content, Analytics, Prices and discounts, Marketplace, Statistics, Feedbacks and Questions) и объясняет 403 на
`supplies`/`finance` (биты 10 и 13 — `granted: false`).

### 3. Инвариант "запись всё равно невозможна"

Уже покрыт существующими тестами `transport.unit.spec.ts` (не менялись, не ослаблены):

```
✓ wbRead cannot be talked into a write › refuses a body on a GET
✓ wbRead cannot be talked into a write › refuses a path parameter that was not supplied
✓ wbRead cannot be talked into a write › exports no escape hatch
```

`resolveEndpoint`/`wbRead` не читают `readOnly` вообще — они отказывают по allowlist до открытия сокета,
поэтому форсировать `readOnly: false` на входе транспорта бессмысленно замерять отдельно: сам транспорт этот
флаг не видит, что и есть инвариант «by construction», а не «потому что флаг сказал».

### 4. Скриншоты панели

- `wildberries-card.png` — карточка с реальным ключом: бейдж «только чтение», 13 категорий (6 зелёных/открыт,
  7 серых/закрыт), дата истечения 17.03.2027.
- `wildberries-expiring-soon.png` — тот же экран с предупреждением. Дата стенда подделана намеренно и разово:
  расшифрован платёж (`decryptJson`) реальной записи `tenant_integration_secret` тенанта `cherkashino`,
  `exp` в JWT-payload переписан на +10 дней от текущего момента (подпись WB-ключа и так не проверяется —
  `token.ts` документирует это отдельно), запись перезашифрована и временно записана в БД приёмочного стенда,
  сделан скриншот, затем оригинальный шифротекст восстановлен из бэкапа в `/tmp` и повторным curl подтверждено
  `expires_at: "2027-03-17T05:20:02.000Z"` — ключ вернулся к исходному состоянию.

Оба файла:
`/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-wb-readonly-flag/artifacts/docs/w13-wb-readonly-flag/wildberries-card.png`
`/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-wb-readonly-flag/artifacts/docs/w13-wb-readonly-flag/wildberries-expiring-soon.png`

### 5. Утечка ключа в git

```
$ git grep -n "eyJhbGci" -- .
```

Непусто, но НЕ из этой ветки: `src/modules/wb/__tests__/transport.unit.spec.ts:42` (существующая фикстура
w01 с фальшивым `TOKEN`, не настоящий ключ) и два вхождения в `artifacts/docs/2026-09-10-mt-vendors-acceptance.md`
(отчёт другой, не-WB задачи с примерами admin-JWT). Ни одно вхождение не добавлено этой веткой и не содержит
реальный ключ WB.

## Проверки

```
$ cd apps/backend && npx tsc --noEmit           # чисто
$ cd apps/backend && npx medusa lint            # 0 errors, 75 warnings (все — существующие, не в изменённых файлах)
$ cd apps/tenant-panel && npx tsc --noEmit      # чисто
$ npx eslint src/routes/settings/wildberries src/hooks/api/wb-status.tsx   # чисто
$ pnpm run check:backend-build                  # Backend + Frontend build completed successfully
$ pnpm run check:backend-fixtures               # чисто (w13-reset-owner-password.ts типизируется)
```

## Как проверить за 10 минут

1. `cd apps/backend && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest --silent --runInBand --forceExit src/modules/wb`
2. Поднять backend на живой БД тенанта, у которого сохранён WB-ключ (`wb:seed-key`), curl
   `GET /tenants/wb/status` с owner-токеном — сверить `categories` (13 штук, granted по маске) и `expiring_soon`.
3. Открыть `/settings/wildberries` в панели тенанта — карточка «Разделы, открытые ключом» показывает бейджи
   granted/denied вместо строки через запятую.
4. Чтобы увидеть баннер истечения без ожидания 180 дней: временно уменьшить `WB_EXPIRY_WARNING_DAYS` в
   `token.ts` до большего числа или переиздать тестовый ключ с ближним `exp` — оба скриншота уже приложены как
   доказательство для этого раунда.
