READY

# Платформенная ночь 11→12.09.2026 — отчёт архитектора-оркестратора (feat/mt-platform)

Сессия session_01MQKTcc6DWhp7ZFrq8zRzFJ, 08:32–09:3x WITA. Задачи: t-2026-09-11-mt-platform-admin (код),
t-2026-09-11-mt-ops-design (спеки с замерами), t-2026-09-11-mt-onboarding-design (спека с развилками).
Журнал хода с датами: artifacts/docs/2026-09-12-platform-progress.md. Push не делался.

## Что готово и где смотреть

**Родная админка → «Магазины»** (A1). `http://localhost:9025/app/tenants`, вход admin@upready.dev /
supersecret (backend этой ветки на 9025; 9023 — старая волна). Таблица магазинов с поиском и фильтром
«показать архивные», создание (название, handle, первый администратор с паролем), карточка (домен, канал,
публикуемый ключ с копированием, счётчики, экспорт), администраторы: добавить, сменить email и пароль,
удалить (последнего нельзя), «Удалить магазин» с подтверждением → статус «Архивирован», действия
отключены. Скриншоты 01–06 в artifacts/docs/platform-shots/ (PNG на диске, в git только README и
shoot.mjs, как у прежних shot-каталогов). Внешний вид — @medusajs/ui, как у остальной админки; Geist
намеренно не применён (родная оболочка админки живёт на своих токенах) — на усмотрение Ивана.

**API** `src/api/admin/tenants/**` по контракту docs/multitenancy/admin-tenants-api-contract.md:
GET/POST /admin/tenants, GET/POST/DELETE /admin/tenants/:id, GET/POST …/admins, POST/DELETE …/admins/:adminId,
POST …/export. Workflows: create-tenant-by-admin, add/update/remove-tenant-admin, update-tenant,
delete-tenant (soft). Пароль через `authModuleService.register("emailpass")`, смена — `updateProvider`
+ `updateProviderIdentities` (проверено в node_modules 2.19.0).

**Soft delete** без новых моделей (снимок миграций общий с feat/mt-panel-2): `tenant.metadata.archived_at`,
канал `is_disabled`, publishable key отозван, вход админа тенанта закрыт middleware на `/tenants/*` и
`POST /auth/tenant/emailpass` (401), витрина по отозванному ключу — **400** (не 401: NOT_ALLOWED в
ensure-publishable-api-key.js, проверено W1). Файлы удаляются только с явным `purge_files=true`.

**Файлы тенанта** (A2). Ключ `tenants/<tenant_id>/<имя>-<ulid>.<ext>` через `filename` в
`uploadFilesWorkflow` — file-s3 и file-local сохраняют сегменты каталогов (проверено в dist). Хелпер
`src/tenant-files` (список/удаление по префиксу: local — каталог `static/tenants/<id>/`, S3 —
ListObjectsV2/DeleteObjects через @aws-sdk/client-s3@3.1094.0, добавлен как прямая зависимость). Старые
файлы стенда без префикса оставлены. Live-проверка R2 не удалась: TLS handshake_failure именно к хосту
бакета (воспроизведено node/curl/openssl) — проверить биндинг бакета в Cloudflare.

**Экспорт тенанта** (A3). `exportTenantWorkflow` + JSON Schema бандла + `POST /admin/tenants/:id/export`
+ CLI `apps/backend/scripts/tenant-export.mjs <handle> [--out <dir>]`. Формат —
docs/multitenancy/tenant-bundle-format.md. Замер на стенде, тенант acme: 9 товаров, 6 заказов,
4 покупателя, 1 регион; 48 886 байт JSON / 11 433 байт gzip / 0,34 с. Страницы и home-config панели
(ветка A) в бандле как `pages: null`. Поле `files` — метаданные, не байты.

**Спеки** (часть B): docs/multitenancy/onboarding-spec.md (348 строк, 6 источников polar.sh/tribute),
detach-spec.md (164), backup-spec.md (216), hosting-spec.md (352, 14 файлов замеров, 6 источников).

## Приёмка по строкам задач

t-2026-09-11-mt-platform-admin:
1. seam admin-tenants: создание → вход нового админа → товар в своём канале; удаление → вход 401, витрина по ключу 400 — **5/5 зелёные** (ожидание 401 для ключа заменено на 400 по коду Medusa).
2. Раздел «Магазины»: таблица, создание, карточка с админами, удаление с подтверждением — **есть**, 6 скриншотов против живого :9025.
3. Загрузка от Acme даёт `tenants/<id>/…`, удаление убирает ровно его префикс — seam tenant-uploads **2/2** (local-провайдер).
4. tenant-export.mjs выдаёт бандл с числом записей и размером — **да** (числа выше).
5. tsc + medusa lint rc=0 — **да** (сквозной прогон оркестратора 09:20–09:2x: tsc 0 после правки import attributes в src/admin/i18n/index.ts, lint 0, seam 5/5 + 2/2 + 4/4).

t-2026-09-11-mt-ops-design: 7.1 закодирован и покрыт тестом — да; detach-spec (шаги, штатно/вручную,
что не переносится; нативного импорта заказов в Medusa нет — проверено по node_modules и докам) — да;
backup-spec (ярус поверх 42a, байты и секунды бандла, экстраполяция по размеру, restore drill) — да;
hosting-spec (RSS, БД, p95, прод из памяти, таблица конфигураций, развилка провайдера) — да, с оговоркой ниже.

t-2026-09-11-mt-onboarding-design: спека, развилки вопросами, кода нет — да (done, 816dddc).

## Оговорки (честные дыры)

- Нагрузочные p95 в hosting-spec скомпрометированы: во время прогонов на стендовом PG было ~27 чужих
  соединений ночных сессий (p95 /store/products 51,8 с при 24 rps на develop, 205 с при 6,5 rps на start).
  Качественно — один процесс насыщается около 50 rps; для планирования мощности нужен изолированный повтор.
- Живые цены Hetzner не сняты (страница на JS); объём бакета R2 не измерен (TLS, см. выше).
- Побайтовая сборка подписей вебхуков Polar (Standard Webhooks) и Tribute (trbt-signature) — проверить по
  SDK/OpenAPI перед кодом; в спеке помечено, не выдумано.
- Restore после случайного удаления: отозванный publishable key «раз-отозвать» нельзя — выпускается новый.

## Вопросы Ивану (HANDOFF)

q-mt-onb-identity (email / telegram_id / оба), q-mt-onb-plan (что даёт тариф), q-mt-tenant-delete-mode
(hard/soft и срок хранения; сегодня soft), q-mt-onb-manual-purchase (ручная покупка из админки),
q-mt-onb-tribute-link (у Tribute нет редиректа — ссылку слать ботом/письмом). Рекомендации — §7 onboarding-spec.

## Прод сейчас (из памяти, не выдумано)

Contabo VPS 84.46.251.149, Coolify + traefik, пять стендов *.upready.dev
(memory/agent-creatr-prod-deploy-contabo.md, stands-deploy-decisions-2026-09-09.md). Целевая топология
и прокси доменов тенантов (wildcard *.upready.dev + on-demand TLS, инструкция DNS для тенанта,
маппинг Host на единственный процесс витрины) — hosting-spec §3–4.

## Коммиты ветки feat/mt-platform (порядок)

4a78d1b контракт+брифы · 1bc3d3a/816dddc/d70d80a HANDOFF · 9fc3969 onboarding-spec · 33544fc файлы+экспорт ·
8b11f0e hosting-spec · далее: admin API+UI (t-…-platform-admin), detach/backup (t-…-ops-design), этот отчёт.
Память: 0bf5056 (базовый домен upready.dev). Бандлы `artifacts/deliverables/tenant-exports/*.json.gz` и PNG
скриншотов — на диске, не в git (21f).
