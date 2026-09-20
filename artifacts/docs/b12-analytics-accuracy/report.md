# b12-analytics-accuracy — аналитика: выручка по смешанным валютам и версии строк заказа

Дата: 2026-09-16 00:03 WITA · ветка `fix/day16-analytics-accuracy` · база `dev`
Источник задачи: `logs/accept-t17-analytics-1.findings.md`, ниты 4 и 5.

## Порядок: правка b01 в базе ветки

```
$ git merge-base --is-ancestor b1a86507 HEAD && echo "b01 (b1a86507) is an ancestor of HEAD"
b01 (b1a86507) is an ancestor of HEAD

$ git log --oneline -1 b1a86507
b1a86507 fix(backend,tenant-panel): Пачка: двойной счёт заказов в Обзоре/Клиентах, выгрузка каталога
         в USD, импорт CSV ни разу не запускался (b01-owner-numbers) (#57)
```

Дедупликацию `order_summary` и отменённые заказы (канон `apps/backend/src/api/tenants/order-totals.ts`)
эта ветка не трогает.

## Решение по валютам — назвал явно

**Выбрана разбивка, а не фильтр.** Фильтр «по валюте магазина» молча выбросил бы заказы в другой
валюте, а подмножество, выглядящее как итог, — та же ложь, что и смешанная сумма (правило 20a).
Поэтому:

- все числа экрана (карточки, график, топ товаров) считаются **по одной валюте за раз**;
- рядом с периодами появляется переключатель валют — **только если магазин реально брал деньги
  больше чем в одной валюте**. У магазина Оксаны сегодня одна валюта, и экран не меняется вовсе;
- под карточками стоит строка про остальные валюты периода: «Ещё заказы в других валютах:
  200,00 $ — заказов: 2. В цифры выше они не входят — переключите валюту, чтобы посмотреть».

**Что видит владелица, если валют две:** по умолчанию — самую крупную валюту периода (₽ у неё),
её выручку/заказы/средний чек, и одну строку текстом про то, что ещё есть заказы в $ на такую-то
сумму. Одним кликом по «USD» тот же экран пересчитывается в долларах. Ни одно число двух валют
больше не складывается, и ни один заказ не исчезает с экрана без упоминания.

API: `GET /tenants/analytics/summary` получил query `currency=<код>` и два новых поля —
`currencies` (все валюты магазина за всё время) и `currency_breakdown` (период, по строке на валюту;
показанная валюта в нём есть всегда, при пустом периоде — честным вычисленным нулём).

## Что изменено

| Файл | Что |
|---|---|
| `apps/backend/src/analytics-summary/currency.ts` | новый: `summariseByCurrency`, `pickCurrency`, `withSelectedCurrency` — вся логика разбивки по валютам, без БД |
| `apps/backend/src/analytics-summary/top-products.ts` | новый: `currentVersionRows`, `topProductsFromItemRows` — фильтр по текущей версии строки заказа и агрегация топ-5 |
| `apps/backend/src/api/tenants/analytics/summary/route.ts` | все агрегаты считаются в выбранной валюте; топ-товары читают строки с версиями и сводятся чистой функцией |
| `apps/backend/src/analytics-summary/__tests__/currency.unit.spec.ts` | юнит-тесты фикстуры А |
| `apps/backend/src/analytics-summary/__tests__/top-products.unit.spec.ts` | юнит-тесты фикстуры Б |
| `apps/backend/scripts/fixtures/b12-seed-analytics-accuracy.ts` | фикстуры А и Б на стенде (вне `src/`, гейт `fixtures-outside-src`) |
| `apps/tenant-panel/src/routes/home/sales-summary-currency.tsx` | новый: переключатель валют + строка «заказы в других валютах» |
| `apps/tenant-panel/src/routes/home/sales-summary.tsx` | состояние выбранной валюты, прокидка в query, рендер двух блоков выше |
| `apps/tenant-panel/src/hooks/api/analytics-summary.tsx` | типы `currencies`, `currency_breakdown`, query-параметр `currency` |
| `apps/tenant-panel/src/i18n/translations/{ru,en}.json` | два ключа: `salesSummary.otherCurrenciesNote`, `salesSummary.otherCurrencyItem` |

## Стенд

БД `upready_store_b12` на `127.0.0.1:5433` — клон `upready_store_cherkashina` (тенант `cherkashino`,
`ten_01M29Q4KYQHC70JZBENWZ8Z88M`, каталог Оксаны) + `medusa db:migrate`.
Бэкенд `medusa develop` на `:9411` (cwd = этот worktree, проверено `lsof -a -p <pid> -d cwd`),
панель `vite` на `:5411`. Личность токена подтверждена у владельца, а не по коду ответа:

```
$ curl -s localhost:9411/tenants/me -H "authorization: Bearer $TOK" | head -c 200
{"tenant_admin":{"id":"tenadm_01M29Q4KZWQ15STQR56GJD21E4","email":"owner-cherkashino@example.test",
 "first_name":"Оксана","last_name":"Черкашина","tenant_id":"ten_01M29Q4KYQHC70JZBENWZ8Z88M",
 "tenant":{"handle":"cherkashino", …
```

Фикстуры засеяны `npx medusa exec ./scripts/fixtures/b12-seed-analytics-accuracy.ts`:

```
b12-seed: fixture А — a1=order_b12a17036hf (rub), a2=order_b12a2yuus9p (rub), a3=order_b12a30285gs (rub),
                      a4=order_b12a4addbx6 (usd), a5=order_b12a522pnsq (usd)
b12-seed: fixture Б — order_b12b1jf9hvn, order.version=2, order_item rows: v1×2, v2×3
```

Фикстура Б правится **настоящими** воркфлоу Medusa (`beginOrderEditOrderWorkflow` →
`orderEditUpdateItemQuantityWorkflow` → `confirmOrderEditRequestWorkflow`), а не руками вписанной
второй версией: 2 шт → 3 шт, и Medusa сама завела `order.version=2` и вторую строку `order_item`.

## Фикстура А — смешанные валюты

**СВОЙ SQL по базе** (что на самом деле лежит у тенанта):

```
$ psql -d upready_store_b12 -c "
select o.currency_code, count(*) orders, sum((os.totals->>'current_order_total')::numeric) revenue
from \"order\" o join tenant_tenant_order_order l on l.order_id = o.id
left join order_summary os on os.order_id = o.id and os.version = o.version and os.deleted_at is null
where l.tenant_id = 'ten_01M29Q4KYQHC70JZBENWZ8Z88M' and o.deleted_at is null
  and o.is_draft_order = false and o.status <> 'canceled' group by 1 order by 3 desc"

 currency_code | orders | revenue
---------------+--------+---------
 rub           |      4 |    5700
 usd           |      2 |     200
```

**ДО** (`artifacts/docs/b12-analytics-accuracy/01-before-summary-7d.json`, снято на коде базы ветки):

```
currency_code: rub
current: {"revenue":5900,"order_count":6,"aov":983.33}
top_products: … | Тройчатка плюс 4 шт / 200 …
```

₽5 700 и $200 сложены в «5 900,00 ₽», шесть заказов двух валют посчитаны одной кучей, средний чек
983,33 ₽ не существует ни в одной валюте, а долларовый товар стоит в одном рейтинге с рублёвыми.
Экран: `02-before-overview-1280x900.png` — «Выручка 5 900,00 ₽ · Заказы 6 · Средний чек 983,33 ₽».

**ПОСЛЕ** (`03-after-summary-7d-rub.json`, `04-after-summary-7d-usd.json`):

```
?period=7d          → currency_code: rub | currencies: ["rub","usd"]
                      current: {"revenue":5700,"order_count":4,"aov":1425}
                      breakdown: [{"rub",5700,4,1425},{"usd",200,2,100}]
                      top: Мумие 1шт/2400 | Свечи АСД 3шт/1800 | Сорбент 3шт/1500
?period=7d&currency=usd → currency_code: usd
                      current: {"revenue":200,"order_count":2,"aov":100}
                      top: Тройчатка плюс 4шт/200
```

Экраны: `05-after-overview-rub-1280x900.png` (₽5 700 · 4 заказа · ₽1 425 + строка про $200 в 2 заказах),
`06-after-overview-usd-1280x900.png` ($200 · 2 заказа · $100 + строка про ₽5 700 в 4 заказах).
Числа совпадают с SQL выше построчно.

## Фикстура Б — версии строк заказа

**СВОЙ SQL по базе**, наивный и версионный запрос по одному и тому же заказу:

```
-- НАИВНО (join по order_id, без версии)
 Натуральный сорбент от отравлений от температуры | 5 | 2500
-- ПО ТЕКУЩЕЙ ВЕРСИИ (+ join "order" o on o.id = oi.order_id and o.version = oi.version)
 Натуральный сорбент от отравлений от температуры | 3 | 1500
```

Фактически продано 3 шт на ₽1 500.

**Важная поправка к ниту 5.** SQL-часть этого дефекта уже починена в `b01-owner-numbers`
(`b1a86507`, комментарий в `order-totals.ts`), поэтому на базе ЭТОЙ ветки экран уже показывал 3 шт.
Чтобы ДО/ПОСЛЕ было замером, а не рассказом, я воспроизвёл дефект на стенде: временно снял фильтр
по версии в `currentVersionRows` (одна строка), дождался перезапуска стенда, снял замер и вернул
файл через `git checkout --`:

```
ДО  (07-before-versionfix-topproducts.json, 08-before-versionfix-topproducts-1280x900.png):
    top: Натуральный сорбент … 5шт/2500 | Мумие … 1шт/2400 | Свечи АСД … 3шт/1800
    — отредактированный заказ задваивается И вылезает на первое место рейтинга

ПОСЛЕ (после git checkout --, замер на живом стенде):
    restored top: Мумие … 1шт/2400 | Свечи АСД … 3шт/1800 | Натуральный сорбент … 3шт/1500
```

Что здесь всё-таки сделано кодом, а не унаследовано от b01: фильтр по версии переехал из SQL-джойна
в чистую функцию `topProductsFromItemRows`, которую можно замерить без базы — иначе юнит-теста на
эту фикстуру не существует в принципе. Заодно снялся риск INNER JOIN: Medusa копирует в новую версию
**каждую** живую строку заказа (`@medusajs/order` 2.19, `dist/utils/apply-order-changes.js` — каждый
item пересчитанного заказа апсертится с новым `version` и новым id, а строка с количеством 0
пропускается), это подтверждено живыми данными той же базы — заказ `order_01M2640GHNN75FE6C4A4A5ZX18`
на версии 3 несёт обе свои строки трижды, по разу на версию.

## Проверки

```
cd apps/backend    && npx tsc --noEmit                      → rc=0
cd apps/tenant-panel && npx tsc --noEmit                    → rc=0
cd apps/backend    && npx medusa lint                       → 65 problems (0 errors, 65 warnings), rc=0
cd apps/tenant-panel && npx eslint src                      → 24 problems (0 errors, 24 warnings), rc=0
pnpm check:backend-build                                    → Backend build completed successfully (15.53s),
                                                              Frontend build completed successfully (38.40s), rc=0
pnpm check:backend-fixtures                                 → rc=0
cd apps/backend && TEST_TYPE=unit npx jest --testPathPattern analytics-summary
                                                            → Test Suites: 2 passed, Tests: 22 passed, rc=0
cd apps/backend && TEST_TYPE=unit npx jest (вся сюита)      → Test Suites: 1 failed, 29 passed, 30 total
                                                              Tests: 1 failed, 327 passed, 328 total, rc=1
```

После влитого `origin/dev` @ `5383acb1` (мерж-коммит `3c35679a`) те же гейты прогнаны заново:

```
cd apps/backend    && npx tsc --noEmit                      → rc=0
cd apps/tenant-panel && npx tsc --noEmit                    → rc=0
pnpm check:backend-build                                    → Backend build completed successfully (13.71s),
                                                              Frontend build completed successfully (27.02s), rc=0
cd apps/backend && TEST_TYPE=unit npx jest (вся сюита)      → Test Suites: 1 failed, 32 passed, 33 total
                                                              Tests: 1 failed, 357 passed, 358 total, rc=1
                                                              (тот же profile-data.unit.spec.ts, см. ниже)
```

Предупреждения линтеров — в файлах, которых ветка не касается.

**Красный тест в общей сюите — не мой и не от этой ветки.**
`src/migration-scripts/__tests__/profile-data.unit.spec.ts › i18n merge › leaves a locale the profile
never translated identical to the base`: в каталоге профиля появился ключ `productOptions: {}`,
которого нет в базовом. Ветка не трогает ни один вход этого теста:

```
$ git diff --name-only 342c3843..HEAD
apps/backend/scripts/fixtures/b12-seed-analytics-accuracy.ts
apps/backend/src/analytics-summary/__tests__/currency.unit.spec.ts
apps/backend/src/analytics-summary/__tests__/top-products.unit.spec.ts
apps/backend/src/analytics-summary/currency.ts
apps/backend/src/analytics-summary/top-products.ts
apps/backend/src/api/tenants/analytics/summary/route.ts
apps/tenant-panel/src/hooks/api/analytics-summary.tsx
apps/tenant-panel/src/i18n/translations/en.json
apps/tenant-panel/src/i18n/translations/ru.json
apps/tenant-panel/src/routes/home/sales-summary-currency.tsx
apps/tenant-panel/src/routes/home/sales-summary.tsx
```

Ни `src/migration-scripts/data/**`, ни сам тест в списке не стоят, то есть его входные файлы
побайтово те же, что на `dev` @ `342c3843`. Ключ `productOptions` в каталоги профиля завезли раньше
(`361ddc93`, `7e4ad3f8` — `t-2026-09-12-catalog-taxonomy`). Отдельный долг, чинить его в этой пачке
я не стал.

## Чего НЕ сделано и почему

- **Пер-тенантная валюта магазина не заводится.** Разбивка выведена из самих заказов, а не из
  настройки магазина: строка `store` общая на платформу, `tenant_locale_settings` у многих тенантов
  нет вовсе (память `medusa-versioned-order-tables-and-tenant-currency-2026-09-15.md`). Если Иван
  решит, что «валюта магазина» должна быть настройкой, дефолт переключателя будет браться из неё —
  это правка в `pickCurrency`, не в разметке.
- **Курсовой пересчёт не делается.** Показать «всего ₽6 500, из них $200 по курсу» нельзя честно:
  источника курса в проекте нет, а курс на дату заказа не хранится. Разбивка — единственный вариант,
  который не требует выдумывать число.
- **`oi.unit_price` в выручке топ-товаров не используется.** `order_item` тоже хранит цену по версиям,
  но на этой базе она не расходится с `order_line_item.unit_price` ни в одной строке
  (замер: `rows_compared=31, differ=0`), а у 17 из 48 строк её нет вовсе. Менять источник цены без
  доказанного расхождения — риск без выигрыша.
- **Скидки и налоги в топ-товарах.** Выручка строки считается как `quantity × unit_price`, промо-скидки
  строк (`order_line_item_adjustment`) в неё не входят — так было и до этой ветки, задача этого не
  просила. Долг записан здесь.
- **Живой хост не трогался.** Деплой задача не предписывает.

## Как приёмщику проверить за 10 минут

```
# 1. стенд
createdb -h localhost -p 5433 -U ivanprotsko -T upready_store_cherkashina upready_store_b12acc
cat > apps/backend/.env <<EOF
DATABASE_URL=postgres://ivanprotsko@localhost:5433/upready_store_b12acc
PORT=9411
JWT_SECRET=supersecret
COOKIE_SECRET=supersecret
AUTH_CORS=http://localhost:5411,http://localhost:9411
STORE_CORS=http://localhost:5411
ADMIN_CORS=http://localhost:5411,http://localhost:9411
EOF
cd apps/backend && npx medusa db:migrate
npx medusa exec ./scripts/fixtures/b12-seed-analytics-accuracy.ts   # печатает id заказов и v1×2, v2×3
npx medusa develop                                                   # :9411

# 2. API
TOK=$(curl -s -X POST localhost:9411/auth/tenant/emailpass -H 'content-type: application/json' \
  -d '{"email":"owner-cherkashino@example.test","password":"<свой, см. ниже>"}' | jq -r .token)
curl -s "localhost:9411/tenants/analytics/summary?period=7d" -H "authorization: Bearer $TOK" | jq \
  '{currency_code, currencies, currency_breakdown, current}'
# ждать: rub / ["rub","usd"] / два бакета / {"revenue":5700,"order_count":4,"aov":1425}
curl -s "localhost:9411/tenants/analytics/summary?period=7d&currency=usd" -H "authorization: Bearer $TOK" | jq .current
# ждать: {"revenue":200,"order_count":2,"aov":100}

# 3. экран
cd apps/tenant-panel && VITE_MEDUSA_BACKEND_URL=http://localhost:9411 npx vite --port 5411 --strictPort
# войти владельцем → «Обзор» → рядом с периодами кнопки RUB / USD, под карточками строка про другую валюту

# 4. юниты
cd apps/backend && TEST_TYPE=unit npx jest --testPathPattern analytics-summary   # 22 passed
```

Пароль владельца на снимке неизвестен; на своём клоне ставится через
`auth.updateProvider("emailpass", { entity_id: "owner-cherkashino@example.test", password: "<свой>" })`
в скрипте вне `apps/backend` (`npx medusa exec <абсолютный путь>`), рецепт — память
`cherkashino-local-stand-from-snapshot-2026-09-15.md`.

**Ловушка снимка (не дефект правки):** у товаров этого клона `thumbnail` указывает на порт стенда,
которого уже нет, поэтому на скриншотах картинки товаров отсутствуют. Свойство снимка.

## Артефакты

Все PNG и JSON — `/Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/fix/day16-analytics-accuracy/artifacts/docs/b12-analytics-accuracy/`

- `01-before-summary-7d.json` — ДО, смешанная сумма 5900
- `02-before-overview-1280x900.png` — ДО, экран «Обзор»
- `03-after-summary-7d-rub.json`, `04-after-summary-7d-usd.json` — ПОСЛЕ, API в обеих валютах
- `05-after-overview-rub-1280x900.png`, `06-after-overview-usd-1280x900.png` — ПОСЛЕ, экран в обеих валютах
- `07-before-versionfix-topproducts.json`, `08-before-versionfix-topproducts-1280x900.png` — воспроизведённый
  дефект версий (5 шт / ₽2 500)
