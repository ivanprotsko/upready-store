READY

# Волна 2 панели тенанта (11→12.09.2026) — отчёт оркестратора

Задачи `t-2026-09-11-mt-panel-wave-2` (куски 1–8) и `t-2026-09-12-mt-storefront-by-host` (кусок 9). Оркестратор — session_01477g3q3qsvgSsc4QHptDUh, worktree `feat/mt-panel-2`. Первая строка файла станет `READY`, когда все куски приняты моими прогонами. Ход — в `2026-09-12-tenant-panel-progress.md`, дефекты приёмщика — в `2026-09-12-tenant-panel-defects.md`.

## Что открыть утром

- Панель волны 2: http://localhost:5181 — вход `admin@acme.test` / `supersecret` (Globex `admin@globex.test`, Initech `admin@initech.test`, пароль тот же). Разделы сайдбара: Overview, Products (карточка товара со всеми подэкранами), Orders (карточка заказа: fulfill/ship/capture/cancel, экспорт CSV), Categories, Promotions (+ Campaigns), Pages, Home page; user-menu → Profile (имя, язык, смена пароля); Overview → Domains.
- Родная админка для сравнения: http://localhost:9026/app (`admin@upready.dev` / `supersecret`). Бэкенд волны 2: http://localhost:9026 (worktree `feat/mt-panel-2`, лог `/tmp/mt-backend-9026.log`). Старый стенд :9023 / :5180 / :8000–8002 не трогался и жив.
- Витрина одна на всех (кусок 9): http://acme.localhost:8010 и http://globex.localhost:8010 — один процесс `next dev` без `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` (лог `/tmp/mt2-storefront-8010.log`); Chrome резолвит `*.localhost` сам, /etc/hosts не нужен. Контент-страницы: `/en/pages/contacts` и ссылки в футере; главная — по документу из панели (Home page).
- Пары скриншотов «админка ↔ панель» и кадры витрины (1440×900): `file:///Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-panel-2/artifacts/docs/tenant-panel-shots/` (в git не идут).
- Код: ветка `feat/mt-panel-2`, worktree `/Users/ivanprotsko/upready/worktrees/upready-store/feat/mt-panel-2`; push не делался (приказ). Контракт: `docs/tenant-panel/api-contract.md` (раздел Wave 2), дизайн куска 9: `docs/multitenancy/storefront-by-host.md`.

## Как принималось (все прогоны — мои, не слова воркеров)

Каждый кусок: `tsc`+`eslint` панели, `tsc`+`medusa lint` бэкенда (для 7/8/9 — ещё `tsc`+`next lint` витрины), seam-suite куска на PORT 904x (throwaway БД), затем коммит из worktree воркера и merge в trunk; после каждого merge — те же проверки на trunk и e2e панели на живом :5181/:9026 (после 7 — с витриной :8010): 71 → 82 → 136 → 155 → 175 PASS без FAIL; седьмой прогон после куска 8 дал 4 тестовых FAIL (секция ссылалась на витрину воркера :8012; Globex получил документ главной от сидирования куска 9) — e2e поправлен (972a7e7), секция home 137 PASS. Финальные прогоны на слитом trunk (407389d; стенд :9026/:5181/:8010 без env-ключа, 11:31): tsc/lint трёх приложений rc=0; by-host e2e витрины 18 PASS / 0 FAIL; полный e2e панели 215 PASS / 0 FAIL (лог /tmp/mt2-e2e-trunk-final.log).

Seam-suites (все зелёные на моих прогонах): tenants 34–35, products-detail 7, profile 7, orders-detail 7, categories 12, promotions 14, pages 8, home 13, domains 12.

## Что знать до того, как кликнешь

- Панель целиком по-английски (копия экранов админки, i18n не переводился — вне объёма волны).
- Числа на стенде выросли: e2e-прогоны создают товары/заказы/категории (Acme: 30+ товаров, 10+ заказов) — приёмка сверяет владельца строк, а не числа.
- Загрузки файлов (медиа товара, картинка hero) на стенде отдаются локальным провайдером на порту 9000 — картинка в панели может быть «битой» до настройки провайдера (пробел стенда, не маршрута; см. контракт, uploads).
- Промо: правило `sales_channel_id = канал тенанта` добавляется бэкендом при создании и не удаляется через rules/batch (400); в UI правило видно в карточке промо.
- Экспорт заказов — синхронный CSV, URL открывается из тоста.

## Куски

| # | Кусок | Состояние | Коммит |
|---|---|---|---|
| 4 | Профиль + смена пароля (`/settings/profile`, user-menu 404 закрыт) | ПРИНЯТ: мои прогоны tsc/eslint/lint rc=0, seam tenants-profile.spec.ts 7/7; пары profile/profile-edit | 5f87bb2, merge 4dd51d0 |
| 1 | Карточка товара (+ варианты, опции, цены, медиа, склад) | ПРИНЯТ: мои прогоны tsc/eslint/lint rc=0, seam 7/7; 4 пары скриншотов | 2b7cf57, merge 7fdfeb9 |
| 2+3 | Карточка заказа (fulfill/ship/capture/cancel) + экспорт CSV | ПРИНЯТ: мои прогоны tsc/eslint/lint rc=0, seam tenants-orders-detail.spec.ts 7/7; пары order-detail/fulfillment-create/export | 2522f01, merge 952ea2e |
| 5 | Категории (список, создание, карточка, товары, organize; публичный /store/tenant/product-categories) | ПРИНЯТ: мои прогоны tsc/eslint/lint rc=0, seam tenants-categories.spec.ts 12/12; пары categories/category-detail/category-create | 6bf3591, merge dd94096 |
| 6 | Промо + кампании (правило sales_channel_id навязано и защищено) | ПРИНЯТ: мои прогоны tsc/eslint/lint rc=0, seam tenants-promotions.spec.ts 14/14 (скидка только в канале Acme); пары promotions/promotion-create/promotion-detail/campaigns | f4bea0d |
| 7 | Контент-страницы (контакты, реквизиты, о магазине, политика, оферта) + витрина `/pages/:key` и ссылки в футере | ПРИНЯТ: мои прогоны панель/бэкенд tsc+lint rc=0, витрина tsc/next lint rc=0, seam tenants-pages.spec.ts 8/8; кадры pages/page-edit/storefront-page-contacts/storefront-footer | d743d8f |
| 8 | Настройки главной (`/home-settings`: пресет темы, композиция, hero, источник товаров, порядок блоков) + витрина по документу | ПРИНЯТ: мои прогоны панель/бэкенд tsc+lint rc=0, витрина tsc/next lint rc=0, seam tenants-home.spec.ts 13/13; кадры home-settings + storefront-home-acme before/after/geist-light + globex-default | db129dc |
| 9 | Витрина по Host: ОДИН процесс next на всех тенантов (`GET /storefront/by-host`, домены в БД `/tenants/domains` + экран Domains, ключ/тема per request из заголовков, env-ключ = fallback одиночного режима) | ПРИНЯТ: мои прогоны три приложения tsc+lint rc=0, seam tenants-domains.spec.ts 12/12 + tenants-home 13/13 на слитом коде; стенд :8010 без env-ключа: acme.localhost → `sneakers`/dark, globex.localhost → `home-goods`/light, каталоги разные; кадры storefront-acme/storefront-globex/panel-domains | eff0577 + c3b9194/51313a2 (слияние с 8), merge 407389d |

## Решения архитектора (см. также memory/decisions, раздел «Волна 2 панели 2026-09-11»)

- Схема главной одна: `settings` = документ feat/stands-composition дословно, `content` — контентное расширение (hero-текст/CTA/картинка, источник товаров, порядок блоков), `theme.preset` из семи пресетов витрины. Развилки нет.
- Резолвер по Host — `GET /storefront/by-host` (не `/store/*`: гейт publishable key отвечает 400 без ключа, замер на :9026).
- База доменов `upready.dev` (поправка Ивана 08:5x); технический субдомен выводится из handle, не хранится.
