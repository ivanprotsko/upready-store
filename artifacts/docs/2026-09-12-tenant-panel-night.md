NOT READY

# Волна 2 панели тенанта (11→12.09.2026) — отчёт оркестратора

Задачи `t-2026-09-11-mt-panel-wave-2` (куски 1–8) и `t-2026-09-12-mt-storefront-by-host` (кусок 9). Оркестратор — session_01477g3q3qsvgSsc4QHptDUh, worktree `feat/mt-panel-2`. Первая строка файла станет `READY`, когда все куски приняты моими прогонами. Ход — в `2026-09-12-tenant-panel-progress.md`, дефекты приёмщика — в `2026-09-12-tenant-panel-defects.md`.

## Что открыть утром (заполняется по мере приёмки)

- Панель волны 2: http://localhost:5181 (вход `admin@acme.test` / `supersecret`; Globex/Initech — те же пароли). Бэкенд волны 2: http://localhost:9026, его админка для сравнения http://localhost:9026/app (`admin@upready.dev` / `supersecret`). Старый стенд :9023/:5180/:8000–8002 не трогался.
- Витрина одна на всех (кусок 9): http://acme.localhost:8010 и http://globex.localhost:8010 — появится после приёмки куска 9.

## Куски

| # | Кусок | Состояние | Коммит |
|---|---|---|---|
| 4 | Профиль + смена пароля (`/settings/profile`, user-menu 404 закрыт) | ПРИНЯТ: мои прогоны tsc/eslint/lint rc=0, seam tenants-profile.spec.ts 7/7; пары profile/profile-edit | 5f87bb2, merge 4dd51d0 |
| 1 | Карточка товара (+ варианты, опции, цены, медиа, склад) | ПРИНЯТ: мои прогоны tsc/eslint/lint rc=0, seam 7/7; 4 пары скриншотов | 2b7cf57, merge 7fdfeb9 |
| 2+3 | Карточка заказа (fulfill/ship/capture/cancel) + экспорт CSV | ПРИНЯТ: мои прогоны tsc/eslint/lint rc=0, seam tenants-orders-detail.spec.ts 7/7; пары order-detail/fulfillment-create/export | 2522f01, merge 952ea2e |
| 5 | Категории (список, создание, карточка, товары, organize; публичный /store/tenant/product-categories) | ПРИНЯТ: мои прогоны tsc/eslint/lint rc=0, seam tenants-categories.spec.ts 12/12; пары categories/category-detail/category-create | 6bf3591, merge dd94096 |
| 6 | Промо + кампании | в работе (mt2-piece-6) | — |
| 7 | Контент-страницы (контакты, реквизиты, о магазине, политика, оферта) + витрина `/pages/:key` и ссылки в футере | ПРИНЯТ: мои прогоны панель/бэкенд tsc+lint rc=0, витрина tsc/next lint rc=0, seam tenants-pages.spec.ts 8/8; кадры pages/page-edit/storefront-page-contacts/storefront-footer | d743d8f |
| 8 | Настройки главной + витрина | в работе (mt2-piece-8) | — |
| 9 | Витрина по Host | в работе (mt2-piece-9); дизайн `docs/multitenancy/storefront-by-host.md` | bb40bb7 (дизайн) |

## Решения архитектора (см. также memory/decisions, раздел «Волна 2 панели 2026-09-11»)

- Схема главной одна: `settings` = документ feat/stands-composition дословно, `content` — контентное расширение (hero-текст/CTA/картинка, источник товаров, порядок блоков), `theme.preset` из семи пресетов витрины. Развилки нет.
- Резолвер по Host — `GET /storefront/by-host` (не `/store/*`: гейт publishable key отвечает 400 без ключа, замер на :9026).
- База доменов `upready.dev` (поправка Ивана 08:5x); технический субдомен выводится из handle, не хранится.
