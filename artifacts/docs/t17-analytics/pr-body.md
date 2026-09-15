## Что изменилось

**Backend**
- `tenant.metadata.analytics` (`yandex_metrica_id`, `ga4_measurement_id`) — тот же приём, что и `seo_verification`. `PUT`/`GET /tenants/analytics`, валидация: Metrica — 6-10 цифр, GA4 — `G-XXXXXXXXXX`.
- `GET /storefront/by-host` отдаёт `analytics` для витрины (шаг 1).
- `GET /tenants/analytics/summary?period=today|7d|30d|custom` — выручка/заказы/средний чек за период, изменение к предыдущему периоду той же длины, разбивка по дням, топ-5 товаров. Считает по `order`+`order_summary` (у `order.total` нет колонки — она в `order_summary.totals->>'current_order_total'`, тот же факт, что уже был измерен в `tenants/customers/helpers.ts`) и по `order_item`+`order_line_item` для товаров. `has_orders: false` — единственный случай честного «заказов пока нет».

**Storefront**
- `x-tenant-analytics` — новый заголовок в цепочке middleware → `lib/data/analytics.ts`, тем же приёмом, что `seo-verification`.
- `Analytics` (`modules/common/components/analytics`) — решает, что показывать: у магазина есть свой счётчик — только его счётчик; счётчика нет вовсе — ничего (даже не платформенный `NEXT_PUBLIC_GA_MEASUREMENT_ID` — тот только для single-store инсталляции, когда тенанта вообще нет).
- Согласие на аналитику (`analytics-consent`) — этого не было в репозитории вовсе (README прямо документировал пробел: «There is no consent gate»). Баннер, localStorage, три состояния (`unknown`/`granted`/`denied`), оба счётчика не грузятся до `granted`.
- SPA-пейджвью на GA4 (`google-analytics/spa-pageviews.tsx`, через `sendGAEvent`) и на Metrica (`yandex-metrica/spa-hits.tsx`, через `ym(id,"hit",url)`) — библиотека `@next/third-parties` шлёт `page_view` только на первую загрузку.
- `PurchaseEvent` на `/order/[id]/confirmed` — шлёт `purchase` в GA4 и `reachGoal` в Metrica, ждёт готовности счётчиков (до 5с поллингом), дедуп через `sessionStorage`, обёрнут так, что не может уронить страницу подтверждения заказа.

**Tenant panel**
- `/settings/analytics` — форма (номер Метрики, GA4 id).
- Главная (`/`) — блок «Продажи»: переключатель периода, три карточки с изменением к прошлому периоду, столбчатый график по дням (без библиотек — 30 баров, YAGNI), топ-5 товаров. Три состояния честно (rule 19h): «Загрузка…», «Заказов пока нет», посчитанный ответ.

## Как измерено

Локальный стенд: свежая БД `medusa_t17_analytics` (localhost:5432), бэкенд на `:9217`, витрина на `:8217`, панель на `:5217`. Тестовые тенанты (`src/scripts/t17-seed-test-tenant.ts`, не для прод-базы):
- **t17shopa** — Metrica `12345678`, GA4 `G-TESTID1234`, 5 заказов (3 сегодня по 2500/1800/3200 ₽, 2 три дня назад по 1200/900 ₽).
- **t17shopb** — ни одного счётчика, ни одного заказа.

**Критерий 1 — счётчик грузится только у своего магазина.**
`curl` (SSR, скрипты не рендерятся до согласия — иначе баннер не имел бы смысла), затем реальный браузер (Playwright/Chromium) после клика «Принять»:
```
$ curl -s -H "Host: t17shopa.localhost" http://localhost:8217/ru | grep -c "mc.yandex.ru/metrika/tag.js"
0   # до согласия — верно, баннер именно для этого
$ curl -s -H "Host: t17shopb.localhost" http://localhost:8217/ru | grep -c "mc.yandex.ru\|googletagmanager"
0   # у шопа B нет счётчиков вовсе — ни баннера, ни скриптов
```
После клика «Принять» в браузере (headless Chromium, `verify-report.json`):
```json
{
  "shopA": {
    "bannerVisibleBeforeConsent": true,
    "scriptsBeforeConsentCount": 0,
    "hasGtagAfterConsent": true,
    "hasYmAfterConsent": true,
    "gaScriptLoadedAfterConsent": true,
    "ymScriptLoadedAfterConsent": true,
    "bannerGoneAfterConsent": true,
    "spaNavigationFiredYandexHit": true
  },
  "shopB": { "bannerVisible": false, "analyticsScriptRequestCount": 0 }
}
```
Скриншоты: `shopA-consent-banner.png` (баннер на витрине), `shopB-no-analytics.png` (ничего не грузится).

**Критерий 2 — счётчик считает переход внутри SPA, не только первую загрузку.**
После перехода по ссылке (`/ru` → `/en/store`) в сети реально ушёл новый Metrica-хит с `page-url=…%2Fstore` — не только первый `watch`, а именно повторный на переходе:
```
mc.yandex.ru/watch/12345678?...page-url=http%3A%2F%2Ft17shopa.localhost%3A8217%2Fen%2Fstore...
```

**Критерий 3 — сводка продаж совпадает с прямым запросом.**
```
$ curl "http://localhost:9217/tenants/analytics/summary?period=today" -H "Authorization: Bearer <t17shopa>"
{"has_orders":true,"currency_code":"rub","current":{"revenue":7500,"order_count":3,"aov":2500}, ...}

$ curl "http://localhost:9217/tenants/analytics/summary?period=7d" -H "Authorization: Bearer <t17shopa>"
{"has_orders":true,"currency_code":"rub","current":{"revenue":9600,"order_count":5,"aov":1920}, ...}
```
Прямой SQL:
```sql
select count(*) as orders, sum((os.totals->>'current_order_total')::numeric) as revenue
from "order" o join order_summary os on os.order_id = o.id
where o.email = 'buyer@t17shopa.example';
-- { orders: '5', revenue: '9600' }
```
Совпадает: 5 заказов, 9600 ₽ (7д), из них 3 заказа / 7500 ₽ сегодня. Скриншот панели `panel-shopA-home-today.png` и `panel-shopA-home-sales-summary.png` (7 дней) — цифры на экране совпадают с API/SQL. Топ товаров подтверждён текстом DOM (клипается внутренним скроллом на полноэкранном скриншоте, но реально в разметке): «Medusa T-Shirt — 5 шт — ₽ 9,600.00 RUB».

**Критерий 4 — честный пустой экран.**
`panel-shopB-home-empty.png` — «Заказов пока нет», не нули.

**Наборы проверок:**
```
cd apps/backend && npx tsc --noEmit && npx medusa lint
  → tsc: чисто; lint: 0 errors, 40 warnings (было 34 до ветки — 1 новое предупреждение того же класса,
    что уже принят в seo-verification.ts: `updateTenants` напрямую в роуте; остальные — от t17-seed-скрипта,
    тот же класс предупреждений, что уже есть у t13-seed-test-tenant.ts)

cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build
  → всё чисто, rc=0; единственное предупреждение — no-img-element на <noscript> пикселе Metrica
    (пиксель нельзя оптимизировать через next/image — noscript не рендерит JS-компоненты), не блокирует сборку
cd apps/storefront && npm test (vitest)
  → 14 файлов, 141 тест — все зелёные (включая обновлённый headers.test.ts со новым `x-tenant-analytics`)

cd apps/tenant-panel && npx tsc --noEmit && npx eslint src && npx vite build
  → всё чисто, rc=0, только преждевременные warning'и (react-hooks/exhaustive-deps) — все в коде,
    который эта задача не трогала
```

## Чего нет

- `test:integration:http` бэкенда не прогонялся (нужен `DB_HOST=localhost` + отдельный поднятый `medusa develop`,
  тестовая БД пересоздаётся на каждый тест — не совместимо с уже поднятым для ручной проверки стендом в этом
  же ране; юнит-тестов на новые роуты в проекте вообще нет ни у одного `/tenants/*` роута — только линт+тайпчек,
  как и для остальных подобных роутов в этом репозитории).
- Версионность строк заказа (`order_item.version`) не учитывается в топ-товарах — для малого магазина без
  правок заказа это не влияет, но при редактировании заказа после отправки суммы может задвоиться.
- GA4 events API v4 debug-режим не проверялся живым Google-акаунтом (id тестовый, `G-TESTID1234`) — проверено,
  что запрос НА `googletagmanager.com/gtag/js?id=G-TESTID1234` и вызов `gtag('event','purchase',...)` уходят;
  что Google принимает данные с реальным id — не проверялось (нет доступа к реальному GA4-свойству).
- Хронология гидратации (несовпадение aria-label у переключателя темы) — существующий баг, не создан этой
  веткой (не трогали ModeToggle/тему), упомянут для полноты картины замера, в задачу не входит.

## Как принять за 10 минут

1. `git checkout` этой ветки, `pnpm install`.
2. Поднять бэкенд на своей БД (`DB_NAME` в `.env`, `npx medusa db:migrate`, `npx medusa develop`).
3. `npx medusa exec ./apps/backend/src/scripts/t17-seed-test-tenant.ts` — создаст t17shopa/t17shopb.
4. Открыть панель, зайти как `admin@t17shopa.example` / `supersecret` → «Обзор» — сводка продаж; `/settings/analytics` — счётчики.
5. Открыть витрину с `Host: t17shopa.localhost` (или через `/etc/hosts`) — баннер согласия внизу; принять — через ~3с/первое действие подгружаются оба счётчика.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01T1WBKHEKobxA3UnqwMAuDF
