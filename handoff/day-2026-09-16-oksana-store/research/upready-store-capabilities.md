# Инвентарь возможностей upready-store — ветка `dev` на 2026-09-15

Срез сделан 2026-09-15 по `dev` = `814e5cd` (локальный и `origin/dev` совпадают). Read-only исследование для
gap-анализа против InSales Combo и для планирования работ по магазину реального клиента (Оксана Черкашина).

Легенда статусов: **DONE** — работает на живом продукте и проверено ночной приёмкой 2026-09-14
(`handoff/night-2026-09-14-tribute/REPORT.md`, единственный источник «живых» фактов ниже);
**PARTIAL** — код есть, но часть не сделана / не проверена живьём / дефект; **MISSING** — кода нет.
Всё, что не помечено «живьём», — вывод из кода на `dev`, не из прода.

## 1. Стенды, адреса, хост, деплой

| Что | Адрес / место | Источник |
|---|---|---|
| Лендинг | `https://upready.dev` — **с 2026-09-14 21:27 WITA домен занят НОВОЙ страницей из другого репозитория** `~/upready/projects/upready-dev` (Cloudflare Pages проект `upready-landing`, деплой `62ebca64`). Прежняя сборка `apps/homepage/port` (React/Vite, тарифы, воронка) живёт по постоянному адресу `https://fbdb8855.upready-landing.pages.dev/`. Команда `pnpm build && wrangler pages deploy dist --project-name upready-landing` из ночного отчёта **перезапишет живой домен** — не запускать | PR #20 (открыт), `apps/homepage/port/OFFLINE-NOTICE.md` |
| Онбординг (мастер) | `https://start.upready.dev/start/onboarding` (старый адрес — `shiftship.dev`). Это контейнер витрины: маршрут `apps/storefront/src/app/start/onboarding/{page,wizard}.tsx`, открывается только на хостах из `DEMO_HOSTS` (`apps/storefront/src/middleware.ts:60-92`) | реестр `~/upready/specs/protected-infra/registry.json` → `upready-store-mt-platform` |
| Панель владельца | `https://panel-store.upready.dev` (alt `panel.shipshift.dev`). `apps/tenant-panel` — Vite SPA (копия экранов Medusa Admin 2.19), nginx проксирует `/auth` и `/tenants` на `mt-backend:9000` (`apps/tenant-panel/nginx.conf`, `deploy/compose.mt.yml:240-…`) | там же |
| Витрина тенанта | `https://<handle>.shipshift.dev` (пример живого: `zolotaya-nit-1057.shipshift.dev`), wildcard-сертификат `*.shipshift.dev` (`deploy/mt/traefik-wildcard-tls.yml`, продление `deploy/scripts/renew-wildcard-cert.sh`, cron `20 4 * * *`, lego + Cloudflare DNS). CNAME-цель для своих доменов — `stores.shipshift.dev` | `deploy/compose.mt.yml`, память `upready-store-mt-deploy-shipshift-2026-09-11.md` |
| Движок / суперадмин | `https://shipshift.dev` — Medusa 2.19 API; родная админка `/app` с расширением «Магазины» (`apps/backend/src/admin/routes/tenants`, API `apps/backend/src/api/admin/tenants/**`: CRUD, `[id]/admins`, `[id]/export`, архивация) | код |
| Telegram-бот тарифов | `@upreadystore_bot`, контейнер `upreadystore-bot`, `/opt/upready-store-bot`, `apps/bot/DEPLOY.md` | PR #11/#14 |
| Хост | Contabo `84.46.251.149`, `root`, ключ `~/.ssh/id_ed25519_contabo`; Coolify стоит, но наш стек — свой `docker compose` в сети `coolify`, ingress = `coolify-proxy` (traefik, resolver `letsencrypt`) | `docs/multitenancy/hosting-spec.md` §1, `deploy/README.md` |
| Код на хосте | `/opt/upready-store/mt` — **rsync из worktree, без `.git`** (что задеплоено — читается по `docker images --format '{{.CreatedAt}}'`, не по git). Compose: `/opt/upready-store/mt/deploy/compose.mt.yml`, проект `mt`, env `/opt/upready-store/mt/deploy/mt/shipshift.env` (единственная копия секретов, вне git) | память `upready-store-mt-acceptance-measurement-traps-2026-09-12.md` |
| Контейнеры | `mt-postgres` (БД `medusa_mt`, том `mt_db-data` — ВСЕ магазины), `mt-backend`, `mt-storefront` (один процесс Next на все витрины), `mt-panel`, `mt-ingress-sync` (`postgres:16-alpine` + `deploy/scripts/tenant-ingress-sync.sh`, раз в 15 с пишет хосты тенантов из БД в `/data/coolify/proxy/dynamic/mt-tenants.yml`) | `deploy/compose.mt.yml` |
| Медиа | профили каталога: хост `/opt/upready-store/media` → `/app/static/store-profiles` (gitignored, «media never enter git», копия только в worktree `feat/abstract-datasets`); загрузки тенантов: `/opt/upready-store/media-tenants` → `/app/static/tenants/<tenant_id>/…`, публичный URL `LOCAL_FILE_BACKEND_URL=https://shipshift.dev/static` (`apps/backend/medusa-config.ts:68-90`, `apps/backend/src/tenant-files/index.ts`). S3 включается только при `S3_BUCKET` в проде — на МТ не задан | compose:112-118 |
| Бэкапы | ручной `pg_dump` в `/opt/upready-store/backups/` перед операциями со схемой; ночной per-tenant job и R2/restic — только спека `docs/multitenancy/backup-spec.md` | реестр, спека |
| Старые стенды | `kerbstone|ferrite|scruple|larchant|long-morning.upready.dev`, `/opt/upready-store/<stand>`, `deploy/compose.stand.yml`, `deploy/stands/*.env.example` | `deploy/README.md` |

**Деплой dev → живой хост** (только по команде Ивана, правило 21c; сама последовательность записана в
`~/upready/memory/upready-store-mt-deploy-shipshift-2026-09-11.md` строки 212-218 и 302-311):

```
# 1. env берётся С ХОСТА (копии расходились), md5 до/после
scp root@84.46.251.149:/opt/upready-store/mt/deploy/mt/shipshift.env deploy/mt/shipshift.env && chmod 600 deploy/mt/shipshift.env
# 2. код — rsync БЕЗ --delete
rsync -az --exclude node_modules --exclude .next --exclude .git --exclude .ai --exclude .turbo --exclude dist --exclude .medusa ./ contabo:/opt/upready-store/mt/
# 3. сборка образов detached в лог, потом up
ssh -n contabo 'cd /opt/upready-store/mt && setsid nohup docker compose -p mt -f deploy/compose.mt.yml --env-file deploy/mt/shipshift.env build backend storefront panel > /opt/upready-store/mt-build-$(date +%Y%m%d-%H%M%S).log 2>&1 < /dev/null & disown'
ssh -n contabo 'cd /opt/upready-store/mt && docker compose -p mt -f deploy/compose.mt.yml --env-file deploy/mt/shipshift.env up -d'
```

После пересборки бэкенда на проде гоняются `docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/{seed-mt-demo,backfill-hero-copy,backfill-option-translations}.js`
(память `upready-store-mt-storefront-head-footer-2026-09-12.md`). Зеркало живого стенда = ветка `feat/night-funnel-brand`,
целиком в `dev` через PR #16/#18/#19. Ловушки прода (кэш, `STOREFRONT_URL` ≠ витрина, файловый провайдер) —
`~/upready/memory/upready-store-mt-caching-and-media-traps-2026-09-14.md`.

## 2. Как создаётся магазин сегодня

Мастер (`wizard.tsx`) спрашивает: название, handle (субдомен, 3–63 символа, суффикс `.shipshift.dev`), email,
пароль (≥8), тему-пресет. Серверный маршрут `apps/storefront/src/app/api/demo/onboarding/route.ts` делает пять вызовов:

1. регистрация identity владельца (`/auth/tenant/emailpass/register`, тип актора `tenant`);
2. `POST /tenants {name, handle, admin:{email}}` → `apps/backend/src/workflows/tenant/create-tenant/index.ts`:
   строка `tenant` (`ten_…`) → `createSalesChannelsWorkflow` (свой канал продаж) → `createApiKeysWorkflow`
   (publishable key) → `linkSalesChannelsToApiKeyWorkflow` → `provisionTenantWarehouseWorkflow`
   (склад «<Магазин> warehouse», fulfillment set, **две плоские опции доставки** «<Магазин> pickup» и
   «<Магазин> courier», провайдер `manual_manual`, цена в каждой валюте регионов стора) → `createTenantAdminStep`
   → remote links `tenant-api-key`, `tenant-sales-channel`;
3. логин владельца (сессия панели);
4. `POST /tenants/seed {preset}` → `seed-tenant-dataset` — стартовый каталог из абстрактного датасета
   (`apps/backend/src/migration-scripts/data/abstract-datasets.ts`, `specs/catalog-taxonomy/ABSTRACT-DATASETS.md`):
   дерево категорий с картинками, коллекции, товары с вариантами/ценами/картинками на канале тенанта
   (живьём: 10 товаров в 5 категориях);
5. `PUT /tenants/home {theme:{preset}, hero}` — документ главной `tenant_home_config`.

Ответ мастера: `storefrontUrl = https://<handle>.<DEMO_TENANT_BASE_DOMAIN>`, `panelUrl = DEMO_PANEL_URL`.
Живьём магазин создаётся за 4–7 с. Технический хост НЕ хранится — выводится из `tenant.handle` + `TENANT_BASE_DOMAINS`
(`apps/backend/src/api/storefront/by-host/hosts.ts`).

**Где живут данные тенанта.** Одна БД `medusa_mt`, общие таблицы Medusa, изоляция ссылками
`apps/backend/src/links/tenant-{product,order,product-category,promotion,campaign,sales-channel,api-key}.ts`
плюс собственный модуль `apps/backend/src/modules/tenant` (таблицы `tenant`, `tenant_admin`, `tenant_domain`,
`tenant_handle_alias`, `tenant_home_config`, `tenant_page`). Витрина узнаёт магазин по `Host`:
`GET /storefront/by-host?host=` (публичный, без ключа) → middleware кладёт `x-tenant-key/handle/theme/mode/origin`
(`docs/multitenancy/storefront-by-host.md`). Гейт `/tenants/*` — `apps/backend/src/api/middlewares.ts:175-256`
(актор `tenant`, архивный тенант не входит).

**Свой домен.** Панель → `/settings/domains` → `POST /tenants/domains {host}` (`apps/backend/src/api/tenants/domains/route.ts`,
409 на технические хосты), владельцу показывается инструкция «CNAME → `stores.shipshift.dev`»
(`VITE_TENANT_CNAME_TARGET`). `mt-ingress-sync` через ≤15 с пишет хост в traefik file-provider, LE HTTP-01 выдаёт
сертификат; замер 2026-09-12: домен → https за ~70 с. `is_primary` + постраничный 301 со всех прочих адресов +
смена handle с алиасом (`tenant_handle_alias`, `middleware.ts:186-226`) — на `dev`; живьём 2026-09-14 проверены
только canonical на своём адресе и раздел «Адрес магазина» с инструкцией CNAME, цепочка 301 — нет.
Переезд зоны `shipshift.dev` → `upready.dev` не сделан (`specs/tenant-address/CANONICAL.md`).

## 3. Матрица возможностей

Замеры «нулей» в матрице сделаны 2026-09-15 широким `rg` (все расширения, без `node_modules`), команды и вывод:

```
rg -il --hidden -g '!node_modules' -g '!.git' -g '!pnpm-lock.yaml' 'robokassa|yookassa|юkassa|tinkoff|cloudpayments|paykeeper' apps deploy | wc -l   → 0
rg -il --hidden -g '!node_modules' 'telegram' apps/backend                          → 1 файл: apps/backend/README.md (ссылка на чат сообщества Medusa, не код)
rg -il --hidden -g '!node_modules' -g '!.git' 'gtag|googletagmanager|metrika|posthog|plausible|umami' apps/storefront apps/tenant-panel
    → 5 файлов, среди них apps/storefront/src/modules/common/components/google-analytics/index.tsx (GA4 есть, см. строку «Аналитика»)
rg -n 'GA_|GOOGLE_ANALYTICS' deploy/mt/shipshift.env.example deploy/compose.mt.yml  → пусто (на МТ ID не задан)
```

| Область | Статус | Что есть (пути) | Чего нет / дефекты |
|---|---|---|---|
| Тенанты и онбординг | **DONE** (живьём) | цепочка §2; суперадмин `/admin/tenants` (CRUD, admins, export, soft-delete); контракт `docs/multitenancy/admin-tenants-api-contract.md` | связи «оплаченный тариф → магазин» нет: платные тарифы уводят в бота, мастер бесплатен для всех; вебхуки Polar/Tribute + `onboarding_token` — только спека `docs/multitenancy/onboarding-spec.md`; подтверждения email нет; список товаров в панели грузится 14–45 с (REPORT «Мелочи») |
| Домены / субдомены / canonical | **DONE** субдомен + подключение своего домена (код + ingress, замер 70 с); **PARTIAL** остальное | §2; `specs/tenant-address/CANONICAL.md` | зона всё ещё `shipshift.dev`; 301/primary/смена handle не проверены живьём; проверки владения доменом нет (только CNAME); покупка домена/почты — открытый вопрос `q-regru-adjacent-model` |
| Каталог: товары, варианты, опции, цены, медиа, остатки | **DONE** (живьём: заголовок/подзаголовок/описание, цена ₽, вес/габариты, 3 варианта с опцией «Размер», две загруженные картинки) | панель `apps/tenant-panel/src/routes/products/**` (create, general, variants, options batch, prices, media, stock, metadata, organize, attributes), API `apps/backend/src/api/tenants/products/**`, `product-variants`, `inventory-items/location-levels` | характеристики = только встроенные поля Medusa (вес/габариты/материал/страна/HS) + `metadata` — **нет схемы произвольных характеристик и фильтров по ним**; типы и теги — глобальные справочники только на чтение (`tenants/product-types`, `product-tags`) |
| Категории | **DONE** (живьём: название, описание, картинка; витрина и плитка на главной обновились) | панель `routes/categories`, API `tenants/product-categories`, ссылка `tenant-product-category`, публичный `/store/tenant/product-categories` | у категории нет SEO-полей и произвольных атрибутов |
| Коллекции | **PARTIAL** | API `apps/backend/src/api/tenants/collections` | экрана в панели нет (`components/layout` nav: `/`, `/products`, `/categories`, `/orders`, `/promotions`, `/campaigns`, `/pages`, `/home-settings`) |
| Массовый импорт/экспорт | **MISSING** для товаров; **DONE** CSV-экспорт заказов | `apps/backend/src/api/tenants/orders/export/route.ts` (CSV) | импорта товаров (CSV/XLSX/InSales/WB) нет; скрипты переноса магазина Черкашиной — на неслитой ветке `feat/cherkashina-tenant` (`apps/backend/scripts/cherkashina-migration/`); памятка WB-токена — ветка `chore/marketplace` (только docs) |
| Склады / остатки | **PARTIAL** | один склад на тенанта (provision), остатки per-variant per-location в панели (`stock`), API `tenants/stock-locations`, `reservations` | экрана складов в панели нет (`routes/locations/common` — только общие компоненты); мультисклад только через API/Admin |
| Главная, hero, блоки | **DONE** (живьём: заголовок/подзаголовок/кнопка hero из панели видны на витрине) | панель `routes/home-settings` (пресет, композиция блоков H1–H6/F1–F6/hero-варианты, hero title/subtitle/CTA/image, `productsSource`, `tiles`), документ `upready.tenant-home/v1`, публичный `/store/tenant/home`; ревалидация `tenant.home` (`tenants/home/route.ts:119`) | нет произвольных блоков/баннеров-карусели, редактора меню, WYSIWYG; парные картинки светлый/тёмный — неслитая `feat/mode-image-pairs`; названия блоков в панели — из каталога переводов |
| Страницы магазина | **DONE** (живьём: «О магазине» опубликована, `/ru/pages/about`, ссылка в подвале) | `tenant_page` c ключами **только** `contacts|legal|about|privacy|offer` (`modules/tenant/models/tenant-page.ts:11`), markdown, панель `routes/pages`, витрина `/[locale]/pages/[key]`, ревалидация `tenant.pages` | нет произвольных страниц (у Черкашиной нужны delivery/faq/wholesale/returns/consent — не переносятся, отчёт миграции §«Не перенесено»); страницы одноязычные en-первые (фикс локали посетителя — на ветке cherkashina) |
| Заказы | **DONE** (живьём: заказ #1 на 7 777 ₽ виден владельцу, «Авторизован», кнопка «Получить платеж») | панель `routes/orders/**` (копия Admin: детали, fulfillment, shipments, mark-as-delivered, cancel, line-items, edits, returns, exchanges, claims, refund, transfer, allocate), API `tenants/orders/[id]/**`, `payments`, `returns`, `exchanges`, `claims`, `order-edits`; статусы — стандартные Medusa; на витрине ЛК с таймлайном заказа (`modules/account/components/order-timeline`) | ручная смена «своих» статусов (как в InSales) отсутствует — только статусы Medusa |
| Уведомления покупателю | **PARTIAL** (код есть, живьём нет) | подписчики `apps/backend/src/subscribers/order-{placed,fulfillment-created,shipment-created,delivered,canceled,completed}-email.ts`, `payment-captured`, `password-reset`, `customer-created`; React Email на 36 языках; модуль `modules/smtp-notification` | включается только при `SMTP_HOST` — в `deploy/mt/shipshift.env.example` его **нет** → на МТ письма не уходят; ссылки в письмах строятся из `STOREFRONT_URL`, который на МТ = домен движка, а не витрины тенанта |
| Уведомления владельцу | **MISSING** | `order-placed-tenant-link.ts` лишь привязывает заказ к тенанту | ни email, ни Telegram владельцу о новом заказе (замер `telegram` по `apps/backend` выше: только README) |
| Покупатели / CRM | **PARTIAL** | витрина: регистрация, вход, адреса, заказы, профиль, сброс пароля, перенос заказа (`modules/account/**`); API только `GET /tenants/customers/[id]`; хук `hooks/api/customers.tsx` в панели | экрана «Клиенты» в панели нет (маршрута и пункта меню нет); списка/поиска/экспорта/сегментов нет |
| Касса и оплата | **PARTIAL** (заказ оформляется живьём) | одноэкранный checkout с шитами (`modules/checkout/components/checkout-*`), гостевой заказ, промокод, самовывоз, демо-карта (`demo-card-fields`, `api/demo/pay`), `api/payment-return` под редирект-провайдеры | **только ручной провайдер `pp_system_default`** — деньги не списываются; российских PSP нет (замер `rg` выше: 0 файлов в `apps`/`deploy`, платёжных модулей в `medusa-config.ts` и `package.json` бэкенда нет); плагин `@gorgo/medusa-payment-robokassa` оценён на ветке cherkashina, заблокирован вопросом пер-тенантных секретов `q-cherkashina-tenant-secrets`; Stripe-константы в `lib/constants.tsx` — наследие апстрима, не настроены; Tribute — только для оплаты ТАРИФОВ через бота (`TRIBUTE_URL_PLAN_*` не заданы), не для кассы магазина. **Открытый дефект:** первый рендер «Спасибо» после оплаты → «Application error» digest `2524605575` (`Publishable API key required`; копать `placeOrder()` → `redirect()` в `apps/storefront/src/lib/data/cart.ts`; репро `node handoff/night-2026-09-14-tribute/scripts/a37-order-final.mjs`) |
| Доставка | **PARTIAL** | две плоские опции на тенанта (§2), профили `tenants/shipping-profiles`, `shipping-options`, `fulfillment-providers`; ПВЗ: `GET /store/pickup-points` из статического сида (`migration-scripts/data/pickup-points`), шит выбора точки с поиском в checkout | экрана «Доставка» в панели нет (переоценка опций — только Admin/API); нет расчётных тарифов, реальных ПВЗ и служб (СДЭК/Boxberry/Почта — ApiShip-провайдер у Черкашиной = `port_later`); названия машинные «<Магазин> courier/pickup» (REPORT) |
| Акции / скидки / промокоды | **DONE** по коду и seam 14/14; живьём — раздел «Акции» и поле промокода в корзине | панель `routes/promotions`, `routes/campaigns` (копия Admin, правило `sales_channel_id` тенанта принудительно), API `tenants/promotions/**`, `campaigns/**`, витрина `checkout/components/discount-code` | применение кода до заказа живьём 2026-09-14 не прогонялось; типы = стандарт Medusa (процент/сумма/buy-get, бюджеты кампаний) |
| SEO | **PARTIAL** | canonical/hreflang на своём адресе (живьём), `app/sitemap.ts`, `robots.ts`, `llms.txt`, JSON-LD (`modules/common/components/json-ld`, товар и листинг), og/twitter-картинки, `X-Robots-Tag: noindex` на редиректах | нет полей meta title/description/slug у товаров, категорий, страниц (Medusa их не имеет — только `metadata`); нет верификации Яндекс/Google; hreflang на все 36 локалей; og-картинка общая, не магазина |
| Аналитика | **PARTIAL** | GA4 через `NEXT_PUBLIC_GA_MEASUREMENT_ID` (`modules/common/components/google-analytics`, монтируется в `app/layout.tsx:86`) | ID один на образ витрины, т.е. **на все магазины сразу**, и на МТ не задан (замер выше); Яндекс.Метрики и пер-тенантного счётчика нет; дашборда продаж в панели нет (главная панели = обзор) |
| Правовые страницы | **PARTIAL** | у магазина: статические `/terms`, `/privacy`, `/returns`, `/shipping`, `/customer-service`, `/contact` из переводов стартера (`app/[locale]/(main)/terms/page.tsx` → `ContentPage`) + редактируемые `legal/offer/privacy` в `tenant_page`; у платформы: тексты `docs/legal/*.md`, генератор `apps/homepage/port/scripts/build-legal.mjs` — **отказ, 29 из 32 реквизитов пусты** (`docs/legal/requisites.json`) | у реального магазина стартовые Terms/Privacy — чужой текст; согласий 152-ФЗ в checkout нет; страниц «Возврат», «Доставка» под ключ нет; лендинг теперь в другом репозитории — генератор к нему не относится |
| Telegram-бот и Mini App | бот **DONE** (живьём `/start plan_2`, `plan_3`); Mini App **PARTIAL** | `apps/bot` (polling, `plans.ts`, `payments.ts`), деплой `apps/bot/DEPLOY.md`; Mini App — PR #5 `feature/telegram-miniapp` (вход `/mini`, мост `modules/telegram/components/mini-app-bridge`, provisioning бота по Bot API `apps/backend/src/telegram/**`, решение «без пула») | бот пишет «оплату сейчас подключаем» (шесть `TRIBUTE_URL_PLAN_*` пусты); Mini App не слит и не задеплоен, при этом лендинг обещает его во всех тарифах (`q-lending-upready-dev-vo-vseh`); токен бота тенанта — где хранить, открыто (`q-tg-tenant-token-store`) |
| Локали и валюта | **DONE** (живьём: редирект на `/ru`, цены в ₽; на `/en` — $) | 36 локалей (`src/i18n/config.ts`, `preferredLocales=["ru"]`), `STOREFRONT_DEFAULT_LOCALE=ru`, валюта через регион `LOCALE_COUNTRY_MAP=ru:ru,en:us`; переводы каталога через `x-medusa-locale` и модуль переводов Medusa (в панели — `product-general-section` translations) | стартовый каталог на русской витрине по-английски (переводы профиля не применяются — воркер `fix-seed-i18n` погиб, `PARENT-NOTES.md`); список включённых языков на тенанта не настраивается (всегда 36); у посеянных acme/globex/initech нет контролов языка/валюты (`t-2026-09-12-seeded-hosts-no-locale-controls`); дубли фильтра «Size» (`t-2026-09-12-seed-option-filter-duplicates`) |
| Темы и дизайн | **DONE** | 7 пресетов `electronics, geist, home-goods, medusa, sneakers, supplements, womens-fashion` (`lib/theme/presets.generated.ts`), светлый/тёмный режим на `<html data-theme/data-mode>`, выбор пресета и композиции владельцем в `home-settings`; скрытая студия на витрине (удержание бренда 2 с → пароль `STOREFRONT_STUDIO_PASSWORD`, `modules/studio`) для операторов платформы; реестры вариантов шапки/подвала/hero; канон Geist `~/upready/packages/geist-kit` | владелец не загружает логотип, не меняет цвета/шрифты/фавикон — только пресет; парные картинки под режим — неслитая ветка |
| Отзывы | **MISSING** | — | у Черкашиной 332 отзыва (en+ru) — переносить некуда |
| Блог | **MISSING** | — | у Черкашиной 18 статей — переносить некуда |
| Поиск и фильтры | **PARTIAL** | `modules/store/components/{category-sidebar,refinement-list,sort-select,pagination,mobile-refinement}`; компонент `modules/layout/components/search` в нижней навигации | поиск живьём не проверялся; полнотекстового/опечаткоустойчивого (Meilisearch/Algolia) нет; фильтры только по опциям, дефект дублей |
| Роли сотрудников | **MISSING** | `tenant_admin` без поля роли (`modules/tenant/models/tenant-admin.ts`); `add/remove-tenant-admin` — только для суперадмина `/admin/tenants/[id]/admins` | экрана «Команда» в панели нет; один тип доступа — владелец |
| Бэкапы и экспорт данных тенанта | **PARTIAL** | `exportTenantWorkflow`, `POST /admin/tenants/[id]/export`, `src/scripts/tenant-export.ts` (JSON-бандл, формат `docs/multitenancy/tenant-bundle-format.md`); ручной `pg_dump` на хосте | ночной job, ретеншн, R2/restic — только спека `backup-spec.md`; байты файлов бандл не несёт; медиа не в git и не в S3 — единственный хост |
| Витрина как таковая | **DONE** | Next 15, App Router, 36 локалей, RTL, категории/коллекции/товар/корзина/ЛК, PWA-иконки, здоровье `/healthz`, ревалидация по вебхуку `POST /api/revalidate` (`STOREFRONT_REVALIDATE_URL`; правка видна за ~8 с живьём) | «Спасибо»-дефект выше; бренд Medusa в нижней навигации на телефоне (`t-2026-09-12-medusa-mark-bottom-nav`) |

## 4. Открытые PR и неслитые ветки (замер `git rev-list --count origin/dev..<b>` 2026-09-15)

| Ветка | PR | Состояние | Ahead | Что держит | Риск слияния |
|---|---|---|---|---|---|
| `feature/telegram-miniapp` | #5 | OPEN | 2 (21 файлов, +1590, только добавления + 4 строки `app/layout.tsx`, `.env.template`) | Mini App витрины, provisioning бота по Bot API, юнит-тесты, замеры | конфликтов почти нет; живьём не проверялось; нужны токены и решение по хранению; Иван назвал кандидатом на пропуск |
| `feature/price-cost-calculator` | #7 | OPEN | 3 (16 файлов, +2575) | модель и UI-калькулятор себестоимости товара (N = 0,10 ₽/мес) | продукт не трогает |
| `feature/market-intelligence` | #8 | OPEN | 3 (21 файл, +2331) | исследование/дорожная карта/спеки (docs) | продукт не трогает |
| `fix/restore-homepage-previous-version` | #20 | OPEN | 2 (5 файлов) | `OFFLINE-NOTICE.md`, пометки в REPORT о снятии сборки с upready.dev, HANDOFF | безопасен; фиксирует смену лендинга |
| `feat/cherkashina-tenant` | нет | ветка от `fix/mt-storefront-head-footer` (2026-09-12) | 6 (46 файлов, +43207 — снимок каталога источника JSON) | **перенос магазина Оксаны в тенант `cherkashino`**: скрипты `apps/backend/scripts/cherkashina-migration/`, реестр соответствий, инвентарь 20 фич, отчёт `artifacts/docs/2026-09-12-cherkashina-migration/03-migration-report.md`; правки кода: страницы тенанта по локали посетителя с фолбэком, локальный файловый провайдер с `backend_url` | база сильно отстала от `dev`; файловый провайдер в `dev` уже решён иначе (`LOCAL_FILE_BACKEND_URL`) → конфликт в `medusa-config.ts`; страницы по локали — полезная правка, `store/tenant/pages` могла разойтись. Данные: 38 товаров, 9 категорий, 313 картинок перенесены локально; 46 клиентов, 88 заказов, 332 отзыва, 18 статей — нет |
| `feat/mode-image-pairs` | нет | от `feat/catalog-taxonomy` (слита) | 8 (105 файлов, +3659/−414) | парные картинки светлый/тёмный: витрина, панель, сид, тесты | средний: трогает компоненты картинок главной/товара и панель; принято только локально, деплой Иван отменил (`4252d17`) |
| `chore/marketplace` | нет | — | 3 (docs) | памятка сотруднику по WB API-токену | безопасен |
| `feature/editing-mode/commenting` | нет | — | 4 (журналы HANDOFF) | ничего продуктового | сливать нечего |
| `feature/homepage-rework`, `homepage`, `feature/page-editing-mode`, `feature/pricing-plans`, `feature/legal-docs`, `feature/legal-docs-on-dev` | #3/#1/#2/#4/#9/#10 | смёржены/закрыты | 1–10 | устаревшие форки уже слитой работы: журналы, планы ночи, `homepage-rework` показывает старое дерево (−8349 строк) | **не сливать** — откатят `dev`; кандидаты на удаление после сверки |
| Локальные ветки без remote (`feat/mt-*`, `feat/stands/*`, `feat/store/*`, `feat/ds-foundation`, `feat/seam-tests`, `feature/content-pages`) | — | вне PR-потока | не мерялось | волны МТ и стендов (в `dev` через `feat/mt-into-dev`), профили, DS-фундамент, seam-тесты (`t-ds-1-seam-tests` in_progress), исследование контентных страниц insales/shopify/tilda | считать архивом; перед любым слиянием — замер |

Задачи в `HANDOFF.json` со статусом `in_progress` (14 шт.) — большинство волн 2026-09-09…12 без движения
(вопросы `q-old-inprogress-accept-or-freeze`); живые: `t-2026-09-13-04` (Mini App), `t-2026-09-14-01..03`.

## 5. Тесты, качество, порты, сид

**Проверки перед коммитом** (`AGENTS.md` «Verifying Your Work»):

```
cd apps/storefront && npx tsc --noEmit && npx next lint && npx next build      # сборка валит на любой находке
cd apps/backend   && npx medusa lint && npx tsc --noEmit                       # medusa develop не стартует с lint-ошибкой
cd apps/tenant-panel && pnpm typecheck && pnpm lint
cd apps/bot && pnpm typecheck && pnpm test                                     # node --test
```

**Сюиты.** Витрина: `pnpm test` (vitest, юниты вроде `i18n/config.test.ts`), Playwright в Docker —
`pnpm test:studio`, `test:profile`, `test:stands` (`STAND_URL`, `STAND_API_URL`, `STUDIO_PASSWORD`), ui-lab на `:8001`
(`playwright.config.ts`), e2e по хосту `apps/storefront/e2e/by-host.e2e.mjs` (18/18 на `:8010`, запись ветки
`feat/mt-panel-2`). Бэкенд: `pnpm test:unit` (jest, 6 spec: `migration-scripts/__tests__/*`, `api/storefront/by-host/__tests__/*`),
`pnpm test:integration:http` — 12 seam-спек `apps/backend/integration-tests/http/` (tenants, domains, home, pages,
promotions, products-detail, orders-detail, profile, categories, uploads, export, admin-tenants); нужен живой Postgres,
`DB_HOST=localhost` (не `127.0.0.1`), свободный `PORT`. Панель: `node apps/tenant-panel/e2e/tenant-panel.e2e.mjs`
(136 проверок, запись `feat/mt-panel-2-orders`). Всего spec/test-файлов в `apps/`: 32.

**Живая приёмка:** `node scripts/accept-homepage.mjs --url …` (34 проверки; нацелен на старую сборку лендинга),
`node handoff/night-2026-09-14-tribute/scripts/a37-order-final.mjs` (путь покупателя до заказа на витрине тенанта),
verify-команды записи `upready-store-mt-platform` в реестре защищённой инфраструктуры.

**Порты локально:** backend `:9000` (Admin `/app`), storefront `:8000`, ui-lab `:8001`, панель `vite --port 5180`,
локальный МТ-стенд по памяти `mt-stand-local-run-2026-09-14.md`: backend `:9031` (`medusa develop`, БД
`upready_store_abstract` на `127.0.0.1:5433`), витрина+воронка `:8041` с `DEMO_HOSTS=localhost`,
`STOREFRONT_STUDIO_PASSWORD`, `STOREFRONT_SETTINGS_SECRET` (тот же у бэкенда), `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`;
магазин открывается как `http://<handle>.localhost:8041/ru`. Turbopack-дефект `t-2026-09-12-turbopack-use-server-type-export`
(`pnpm storefront:dev` может не подняться — использовать `npx next dev`).

**Сид:** `pnpm backend:seed` — 241 регион, 36 локалей, каталог профиля `STORE_PROFILE` из
`apps/backend/src/migration-scripts/data/profiles/{abstract,electronics,home-goods,sneakers,supplements,womens-fashion}`
(сид однократный: повтор на засеянной БД ничего не делает). МТ-скрипты `apps/backend/src/scripts/`: `seed-tenants.ts`,
`seed-mt-demo.ts` (acme/globex/initech), `seed-tenant-home.ts`, `seed-storefront-settings.ts`, `backfill-*`,
`reprovision-tenant-warehouses.ts`, `ensure-accounts.ts`. Каталог нового тенанта — `POST /tenants/seed {preset}`.
Медиа профилей (`profiles/<id>/media/*.webp`) gitignored: свежий клон даёт витрину без картинок. Демо-логины:
`MEDUSA_ADMIN_EMAIL=admin@upready.dev`, `DEMO_CUSTOMER_EMAIL=user@upready.dev` (пароли — в env на хосте).

## 6. Топ-15 разрывов для «реальный магазин принимает реальных покупателей» (по важности)

1. **Приём денег.** Только ручной провайдер; нужен российский PSP (Robokassa/ЮKassa/T-Bank) с пер-тенантными
   секретами — вопрос `q-cherkashina-tenant-secrets` открыт, спайк на `@gorgo/medusa-integration` не сделан.
2. **Ошибка на странице «Спасибо»** сразу после оплаты (digest `2524605575`) — покупатель видит краш в момент денег.
3. **Уведомления:** на МТ не настроен SMTP (писем покупателю нет), владельцу о заказе не сообщает никто
   (ни email, ни Telegram), ссылки в письмах ведут на домен движка.
4. **Доставка по-настоящему:** расчётные тарифы, реальные ПВЗ и службы (СДЭК/Boxberry/Почта через ApiShip),
   экран доставки в панели, человеческие названия способов.
5. **Правовой контур магазина:** стартовые Terms/Privacy чужие, нет страниц «Доставка/Возврат/FAQ», нет согласий
   152-ФЗ в checkout; ключей `tenant_page` только пять.
6. **Локализация каталога:** русская витрина с английскими названиями стартового каталога; переводы товаров в панели
   живьём не проверены; список языков на тенанта не ограничить.
7. **Клиенты в панели** — экрана нет вовсе (API только `GET /tenants/customers/[id]`).
8. **Импорт/экспорт товаров** (CSV/XLSX, перенос с InSales/WB/текущего Medusa) — нет; скрипты Черкашиной на
   неслитой ветке от устаревшей базы.
9. **Брендинг владельца:** логотип, цвета, шрифты, фавикон, og-картинка — не настраиваются, только пресет.
10. **Аналитика:** GA4-ID один на все магазины и не задан; Метрики и пер-тенантных счётчиков нет; дашборда продаж нет.
11. **Отзывы** — функции нет (у клиента 332 отзыва).
12. **Блог/журнал** — функции нет (у клиента 18 статей).
13. **SEO-поля** (meta title/description, слаги) у товаров/категорий/страниц; верификация поисковиков; общая
    og-картинка на все магазины.
14. **Поиск и фильтры:** поиск живьём не проверен, полнотекстового нет, фильтры только по опциям и с дублями.
15. **Эксплуатация:** список товаров в панели 14–45 с (и один раз завис в скелетоне), медиа только на одном хосте
    без S3 и без автоматических бэкапов (спека `backup-spec.md` не реализована), зона магазинов всё ещё
    `shipshift.dev`, Mini App обещан в тарифах, но не слит (PR #5); ролей сотрудников и мультисклада в панели нет.

Черкашина отдельно: перенос каталога (38 товаров, 9 категорий, 313 картинок) уже отработан скриптами ветки
`feat/cherkashina-tenant`; не переносятся клиенты (46, вопрос согласия), заказы (88, архивом), отзывы, статьи,
курсы, 10 страниц без ключа, ApiShip/Robokassa — см. `03-migration-report.md` §«Не перенесено» на той ветке.
