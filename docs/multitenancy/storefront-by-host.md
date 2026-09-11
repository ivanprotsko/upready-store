# Витрина одна на всех: тенант по Host (дизайн куска 9, до кода)

Задача `t-2026-09-12-mt-storefront-by-host`. Автор — архитектор волны 2 (session_01477g3q3qsvgSsc4QHptDUh), 11.09.2026 ~09:00 WITA. Файл — единственный документ сессии A в `docs/multitenancy/**` (приказ Ивана в details задачи); остальное в этом каталоге — сессии B.

## 1. Как сейчас (замерено 11.09 08:05–08:45)

- Три процесса `next-server` из одного `apps/storefront` (:8000/:8001/:8002), у каждого свой `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` в окружении; ключ читается в двух местах: `src/middleware.ts:7` (запрос регионов) и `src/lib/config.ts:14` (SDK). По Host ничего не резолвится.
- Тема — build-time: `app/layout.tsx` ставит `data-theme`/`data-mode` на `<html>` из `readProfileTheme()` (профиль сборки `NEXT_PUBLIC_STORE_PROFILE`); пресетов семь: `electronics, geist, home-goods, medusa, sneakers, supplements, womens-fashion` (`lib/theme/presets.generated.ts`, CSS `styles/themes.css` по атрибутам). Пресеты ПОДХОДЯТ — минимальный свой пресет не нужен, развилки нет.
- Композиция главной — `store.metadata.storefrontSettings` (одна на весь backend, `GET /store/storefront-settings`); per-tenant документ — `tenant_home_config` (кусок 8, схема в `docs/tenant-panel/api-contract.md`, «Piece 8»).
- `/store/*` целиком закрыт глобальным гейтом publishable key: `GET /store/custom` без заголовка → 400 «Publishable API key required» (замер на :9026). Значит резолвер ключа не может жить под `/store/*`.

## 2. Целевая модель

**Домены.** Таблица `tenant_domain` (id `tdom_…`, `host` unique, `tenant_id`; миграция Migration20260911004426 накатана). Хранятся кастомные хосты в нижнем регистре без порта (`petya.com`, `shop.petya.com`). **Технический субдомен `<handle>.upready.dev`** (база — `upready.dev`, Иван 11.09 08:5x) не хранится: он выводится из `tenant.handle` (уже unique) и списка базовых доменов `TENANT_BASE_DOMAINS` (env бэкенда, по умолчанию `upready.dev,localhost`; `localhost` — чтобы стенд отвечал на `acme.localhost`). Так инвариант «у тенанта всегда есть технический субдомен» держится конструкцией: строку нельзя удалить, потому что её нет. Уникальность между тенантами: индекс на `host` + при POST проверка, что хост не равен `<чужой handle>.<база>`; коллизия → 409 `DUPLICATE_ERROR`.

**Резолвер.** `GET /storefront/by-host?host=<host>` — публичный, без ключа и без auth (namespace `/storefront/*`, не `/store/*` — см. §1; express `app.use("/store")` не матчит `/storefront`, это проверяется seam-тестом «без ключа → 200»). Алгоритм: хост в нижний регистр, порт отрезать; (1) точное совпадение в `tenant_domain`; (2) иначе если хост = `<x>.<база>` для одной из баз — тенант по `handle = x`; (3) иначе 404. Ответ:

```
{ tenant: { id, handle, name },
  publishable_key: "pk_…",              // tenant.api_key.token через link tenant-api-key
  theme: { preset, mode } | null,       // из tenant_home_config.config.theme / settings.defaultMode
  settings: StorefrontSettingsInput | null,
  home: TenantHome | null }             // весь документ куска 8
```

Ключ не секрет (он в HTML каждой витрины), поэтому анонимный маршрут допустим. Кэш ответа на стороне витрины — 60 с на хост в памяти процесса (Map в middleware, как `regionMapCache`), инвалидация по времени; «новый тенант без рестарта» = его хост впервые спрашивается и тут же находится.

**Панель.** `GET /tenants/domains` → `{ domains: [{id, host}], technical: ["acme.upready.dev", "acme.localhost"] }`, `POST /tenants/domains {host}`, `DELETE /tenants/domains/:id`. Экран «Domains» в панели — своя простая страница (`/settings/domains`, ссылка из обзора): технические хосты read-only, список кастомных с добавлением/удалением; DNS-инструкция одной строкой: «CNAME → `stores.upready.dev`» (Иван 11.09: wildcard `*.upready.dev`, CNAME-target `stores.upready.dev`, on-demand TLS для кастомных доменов — реализация прокси/TLS в hosting-spec B4 сессии B, не в этом куске). Админка магазинов (сессия B, `/admin/tenants/*`) может показать те же данные позже — из тех же строк.

**Витрина.**
1. `src/middleware.ts`: по `request.headers.get("host")` вызывает резолвер (кэш 60 с); при 404 — single-store fallback: ключ из `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`, тема из профиля (сегодняшнее поведение, ничего не ломается). Найденное кладётся в заголовки запроса (`NextResponse.next({ request: { headers } })`): `x-tenant-key`, `x-tenant-handle`, `x-tenant-theme`, `x-tenant-mode`. Запрос регионов в middleware использует ключ тенанта.
2. `src/lib/config.ts`: SDK создаётся без `publishableKey`; обёртка `sdk.client.fetch` (уже есть — добавляет `x-medusa-locale`) дописывает `x-publishable-api-key` из `headers()` (`next/headers`, серверный код) или из env-fallback. `fetchWithoutLocale` получает ту же подпись. Клиентские вызовы SDK из браузера (если есть) берут ключ из `<meta name="x-tenant-key">`, который кладёт `app/layout.tsx` — воркер измеряет, есть ли такие вызовы (`grep -rn "sdk\." src --include=*.tsx | grep -v "use server"`).
3. Кэш: теги `getCacheOptions()` получают суффикс handle тенанта (`products-<handle>`…), `POST /api/revalidate` принимает необязательный `handle` — иначе один `force-cache` отдаст каталог Acme посетителю Globex.
4. `app/layout.tsx`: `data-theme`/`data-mode` из заголовков, иначе профиль (как сейчас). `(main)/page.tsx` — документ тенанта (кусок 8) вместо `getStorefrontSettings()`, когда он есть.
5. Витрина поднимается ОДНА: `next dev -p 8010` (стенд оркестратора; :8000–:8002 старого стенда не трогаем до приёмки). `acme.localhost` и `globex.localhost` резолвятся в 127.0.0.1 без /etc/hosts (Chrome и curl `--resolve`).

## 3. Приёмка (критерии задачи, как проверяются)

| Критерий | Проверка |
|---|---|
| один процесс, разные каталоги и темы | `curl -s http://acme.localhost:8010/en/store \| grep -o product-wrapper \| wc -l` = 9, для globex = 3; `data-theme` в `<html>` разный (acme `sneakers`/dark, globex `home-goods`/light — сидируется через `PUT /tenants/home`); скриншоты обеих в `artifacts/docs/tenant-panel-shots/storefront-{acme,globex}.png` |
| ключ не из env | витрина стартует БЕЗ `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` и отдаёт каталоги; с env-ключом и неизвестным хостом (`localhost:8010`) — single-store режим |
| домены в БД, правятся из панели | `POST /tenants/domains {host:"acme.example"}` → резолвер отвечает по `acme.example` (curl `--resolve`) |
| новый тенант без рестарта | `POST /tenants` (регистрация) → `http://<handle>.localhost:8010` открывается |
| seam + e2e + tsc/lint | `tenants-domains.spec.ts` (резолвер без ключа 200, чужой домен 409, B не видит доменов A), e2e витрины двух хостов, `tsc`/`next lint` rc 0 |

## 4. Что НЕ входит

Прокси/wildcard TLS/on-demand сертификаты (hosting-spec B4, сессия B); удаление тенанта; перенос старых стендов :8000–:8002 на один процесс (делает утренний приёмщик, когда примет кусок 9).
