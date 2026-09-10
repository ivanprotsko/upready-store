# Платформа: админка магазинов, онбординг после оплаты, эксплуатация тенантов (ночь 11→12.09.2026). Бриф архитектору-оркестратору

Автор: session_01HqysBVaN4S8qDwkauRQdvB, 11.09 ~07:25 WITA. Источник — слова Ивана 11.09 07:1x (пункты 6 и 7), дословно ключевое:

> «6. нужно сделать функционал который позволит создать магазин: 6.1 из админки администратора (чтобы я мог видеть все магазины и добавлять / удалять / редактировать). У меня должна быть возможность добавить администратора или сменить логин и пароль администратора, который там уже есть. 6.2 онбординг, на который человек будет попадать после того как он оплатит покупку магазина у меня … данные должны быть предзаполнены … возможно часть из них ему не стоит показывать … 6.2.1 покупатель будет заходить на сайт https://upready.dev/, затем выбирать тариф или товар и переходить к оплате. Оплата будет разными способами, например polar.sh, tribute (телеграм) и после оплаты мы будем его редиректить на нужную страницу (или давать ему ссылку) … после оплаты мы должны завести на клиента аккаунт, а также закрепить за клиентом оплаченную услугу (1 клиент может иметь множество покупок), перейдя по ссылке человек будет попадать на онбординг.
> 7. нужно решить: 7.1 как хранить изображения и файлы тенантов, чтобы удаляя магазин — удалялись и данные тенанта, не затрагивая файлы других; 7.2 отсоединять тенанта, если он решит сделать себе отдельный standalone магазин с полноценной админкой medusa; 7.3 как делать бэкап данных тенанта; 7.4 какой нужен сервер и хостинг, чтобы система стабильно работала, если станет много тенантов.»

Роль сессии: архитектор-оркестратор (слово Ивана «для оркестрации» 07:1x). Что решено — кодировать; что не решено — спека с рекомендацией и развилкой для Ивана утром, НЕ код. Записанные решения Ивана по МТ — `~/upready/memory/decisions/2026-09-10-multitenancy-target-first-config-in-db.md` (shared-модель; конфиг тенанта в БД; publishable key в БД; склад per-tenant; links вместо колонок; `/tenants/*` = backend панели) — им не противоречить.

## Что уже есть (замер 11.09)

- `modules/tenant`: `tenant` (handle, name, metadata), `tenant_admin` (email, имя; actor type `tenant`, вход `POST /auth/tenant/emailpass`); links tenant↔sales_channel, ↔api_key, ↔product, ↔order. `createTenantWorkflow` (канал + publishable key + склад с зоной и двумя опциями доставки через `provisionTenantWarehouseWorkflow` + первый админ + auth app_metadata). Регистрация сегодня — `POST /tenants` с registration-токеном (self-service), админской двери НЕТ.
- Файлы: `POST /tenants/uploads` = реэкспорт `@medusajs/medusa/api/admin/uploads` → `uploadFilesWorkflow` → провайдер `file-s3` (`medusa-config.ts`, `useS3`; ключи плоские, тенант в ключе не участвует) или local. Удаление тенанта — workflow ОТСУТСТВУЕТ.
- Админка Medusa :9023/app (admin@upready.dev) — родная; расширений `src/admin/**` под тенантов нет.
- Бэкап платформы — правило 42a (три яруса, restic → R2, 42d); per-tenant бэкапа нет.

## Часть A — кодировать этой ночью (решения есть)

### A1. Админка магазинов (6.1) — расширение родной админки Medusa
- `src/api/admin/tenants/**`: `GET /admin/tenants` (список с каналом, ключом, числом товаров/заказов по links), `POST /admin/tenants` (тело = handle, name, first admin {email, password, first_name, last_name} → `createTenantWorkflow`; пароль заводится через auth module emailpass — проверить API `AuthModuleService.register/updateProvider` по `@medusajs/auth` 2.19/2.20 в node_modules, не по памяти), `GET/POST/DELETE /admin/tenants/:id`, `GET/POST /admin/tenants/:id/admins`, `POST/DELETE /admin/tenants/:id/admins/:adminId` (смена email и пароля — «сменить логин и пароль администратора»).
- `src/admin/routes/tenants/**` (UI route, `defineRouteConfig`, пункт сайдбара «Магазины»): таблица тенантов, создание, карточка (данные, админы: добавить / сменить email+пароль / удалить), удаление с подтверждением. Внешний вид — компоненты `@medusajs/ui`, как остальная админка.
- Платформенные администраторы (сотрудники upready) — уже родной раздел Settings → Users (invite); НЕ дублировать.
- Удаление тенанта — `deleteTenantWorkflow`: см. A3; пока Иван не решил hard/soft — реализовать **soft** (флаг `archived_at`, канал `is_disabled`, ключ отозван, вход админов закрыт), purge — отдельным шагом после решения.
- Приёмка: seam-тесты `integration-tests/http/admin-tenants.spec.ts` (создание → вход нового админа в панель → товар виден в своём канале; удаление → вход 401, витрина по ключу 401); скриншоты экрана в `artifacts/docs/platform-shots/`; tsc + medusa lint rc=0.

### A2. Файлы тенантов (7.1) — префикс на ключе
- Рекомендация (кодировать): ключ объекта `tenants/<tenant_id>/<ulid>-<filename>`. Свой `POST /tenants/uploads` (вместо реэкспорта): тенант из `req.auth_context`, `uploadFilesWorkflow` с `filename` под префиксом — ПРОВЕРИТЬ по `@medusajs/file-s3` (`dist/services/s3-file.js`), как провайдер строит key из filename и сохраняет ли `/`; если нет — свой провайдер-обёртка над s3 с `prefix` из контекста. Local-провайдер — тот же путь в каталоге.
- Удаление = `ListObjectsV2` по префиксу + `DeleteObjects` (шаг `deleteTenantFilesStep` в `deleteTenantWorkflow`, с компенсацией «нельзя» → шаг последний, после soft-delete). Публичный URL содержит id тенанта — допустимо (публичные ассеты).
- Уже загруженные файлы стенда без префикса — оставить, отметить в отчёте.
- Приёмка: seam-тест — загрузка от Acme даёт ключ с `tenants/ten_acme…/`, объект Globex не виден в листинге Acme; удаление тенанта убирает ровно его префикс (на local-провайдере и, если есть креды R2 в `~/upready/.env.keys`, на bucket'е стенда).

### A3. Экспорт тенанта = основа для 7.2 и 7.3 (один код)
- `exportTenantWorkflow` → bundle `tenant-<handle>-<YYYY-MM-DD>.json.gz` (+ манифест файлов по префиксу): tenant, admins (без паролей), products/variants/options/prices/inventory levels, categories/collections (по links, волна 2 панели добавит их), контент-страницы и home-config (модели волны 2 — читать, если уже есть), customers c заказами канала, orders + line items + payments + fulfillments (как есть, для истории), regions/shipping options своего склада.
- CLI `apps/backend/scripts/tenant-export.mjs <handle>` и `POST /admin/tenants/:id/export` (скачать).
- Импорт — ТОЛЬКО спека (часть B), не код.

## Часть B — спека с рекомендацией и развилками (код не писать)

### B1. Онбординг после оплаты (6.2, 6.2.1)
Цепочка: upready.dev → тариф → оплата (polar.sh / tribute) → webhook → **аккаунт клиента** + **покупка** (entitlement) → ссылка/редирект с одноразовым токеном → мастер онбординга (предзаполнен) → `createTenantWorkflow` → авто-вход в панель.
Спроектировать и записать в `docs/multitenancy/onboarding-spec.md`:
- Модуль `platform` в backend: `account` (id, email, telegram_id?, name), `purchase` (account_id, provider ∈ {polar, tribute, manual}, provider_event_id UNIQUE — идемпотентность, plan, status, paid_at), `onboarding_token` (purchase_id, token, expires_at, used_at); link account↔tenant (1:N — «1 клиент может иметь множество покупок»).
- Webhooks `POST /webhooks/polar`, `POST /webhooks/tribute` — подпись проверяется по первоисточникам (docs polar.sh и tribute — fetch, 17a), ретраи, идемпотентность по event id.
- Мастер `/onboarding/:token` в `apps/tenant-panel` (PublicLayout): шаг 1 название + handle (предзаполнены из покупки/email), шаг 2 контакты (email из аккаунта), шаг 3 валюта/регион/язык (дефолт из тарифа), финиш → вход. НЕ показывать: склад, опции доставки, ключ (провижнятся сами). Всё остальное правится потом в панели.
- Контракт для сайта upready.dev: формат ссылки, параметры, страница «оплата прошла» — сайт в эту ночь не трогать (найти его репо в `~/upready/projects/` и записать путь).
- Развилки Ивану (каждая — `handoff.mjs question add`): идентичность аккаунта (email vs telegram id vs оба); что даёт тариф (1 магазин / N / срок, продление); hard vs soft delete тенанта и срок хранения после удаления; ручная «покупка» из админки (без оплаты — для тестов и рассрочки).

### B2. Отсоединение в standalone (7.2)
Рекомендация: standalone = новый инстанс Medusa (родная админка) + импорт bundle из A3: товары/категории/контент/клиенты — штатно (workflows), заказы — CSV-архив + опционально прямой DB-перенос как платная услуга (у Medusa нет import API для заказов — проверить по докам 2.20). Файлы — копия префикса в bucket клиента. Домен — перенос DNS. Записать шаги и цену в `docs/multitenancy/detach-spec.md`.

### B3. Бэкап данных тенанта (7.3)
Платформа — 42a как есть (вся БД + bucket, restic → R2, 42d). Per-tenant — ночной `exportTenantWorkflow` (A3) → `tenants/<id>/backups/<date>.json.gz` в R2, retention 30 дней + месячные; восстановление = импорт bundle (B2) в тот же инстанс с заменой. Оценить размер bundle на стенде (число + единица) и время экспорта. `docs/multitenancy/backup-spec.md`.

### B4. Сервер и хостинг при росте тенантов (7.4)
Замерить на стенде: RSS `medusa develop`/`medusa start`, размер БД (`pg_database_size`), p95 `/store/products` под 50 rps (autocannon или k6 — что есть в `~/upready`), размер bucket. Где сейчас прод upready-store — прочитать `~/r/s5.md`, `~/upready/memory/*deploy*`, `*contabo*` — не выдумывать.
Рекомендация к проверке: один Medusa backend (server + worker режимом `workerMode`) + PG 17 + Redis + одна мультитенантная витрина Next.js (тенант по Host — следствие решения «ключ в БД») + статичная панель; reverse proxy с wildcard `*.<домен>` и on-demand TLS для кастомных доменов; объектное хранилище R2; managed PG при >N тенантов или >X ГБ (N и X — из замера). Итог — `docs/multitenancy/hosting-spec.md` с таблицей «тенантов → конфигурация → цена/мес» и развилкой провайдера.

## Протокол ночи
- Ветка `feat/mt-platform` от `feat/mt-vendors` (worktree `~/upready/worktrees/upready-store/feat/mt-platform`); коммиты `IVAN_OK=1`, литеральный pathspec, `(t-2026-09-11-mt-platform-admin)` / `(t-2026-09-11-mt-onboarding-design)` / `(t-2026-09-11-mt-ops-design)`. **Push не делать.**
- Файлы связи: `artifacts/docs/2026-09-12-platform-night.md` (READY первой строкой), `…-progress.md`. Промпты воркерам по-английски (3a), модель на каждом agent() (5e), воркеры не коммитят.
- Границы с сессией A (панель, `feat/mt-panel-2`): B владеет `apps/backend/src/admin/**`, `src/api/admin/tenants/**`, `src/workflows/tenant/{delete-tenant,export-tenant}/**`, `src/api/tenants/uploads/**`, `scripts/tenant-export.mjs`, `docs/multitenancy/**`. B **не добавляет моделей в `modules/tenant`** этой ночью (снимок миграций общий с A); `archived_at` для soft-delete — через `metadata` тенанта до утра, миграцию — после слияния веток.
- Стенд общий: backend :9023 и панель :5180 запущены из worktree `feat/mt-panel` (старая волна). Для своих проверок поднять свой backend на другом порту (`PORT=9024`, та же БД `medusa_mt` на :5433 — см. креды) — чужие процессы не гасить.
