# Аудит security — 2026-09-23

## Охват и метод

Прочитано (только чтение, ни один файл вне `handoff/audit-2026-09-23/` не менялся):

- Бриф `/Users/ivanprotsko/upready/prompts/2026-09-23-project-audit.md`, `/Users/ivanprotsko/upready/projects/upready-store/AGENTS.md`,
  `/Users/ivanprotsko/upready/projects/upready-store/handoff/audit-2026-09-23/standards.md`.
- Инвентарь API бэкенда: 181 файл `route.ts` под `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/`
  (основная масса — `/tenants/*`, 12 — `/store/tenant/*`, 6 — публичные вне обоих гейтов).
- Слой изоляции целиком: `apps/backend/src/api/tenants/tenant-scope.ts` (348 строк), `apps/backend/src/api/store/tenant/resolve-tenant.ts`,
  `apps/backend/src/api/field-guard.ts`, цепочка `apps/backend/src/api/middlewares.ts` (1496 строк, разобраны секции авторизации и матчеры).
- Платежи и вебхуки: `apps/backend/src/api/robokassa/result/route.ts`, `apps/backend/src/api/cdek/webhook/route.ts`,
  `apps/backend/src/api/telegram/link/route.ts`, `apps/storefront/src/app/api/revalidate/route.ts`.
- Конфигурация и деплой: `apps/backend/medusa-config.ts`, `deploy/compose.mt.yml`, `deploy/compose.stand.yml`, `deploy/mt/*.env*`,
  `deploy/stands/*.env.example`, `deploy/.gitignore`, `.gitignore`, `apps/storefront/next.config.js`.
- Панель овнера: `apps/tenant-panel/src/lib/client/client.ts`, `apps/tenant-panel/vite.config.mts`, поиск хранилищ токенов по всему `src`.
- Загрузки и PII: `apps/backend/src/tenant-files/upload-policy.ts`, `apps/backend/src/tenant-files/static-headers.ts`,
  `apps/backend/src/api/tenants/customers/export/route.ts`, провайдер файлов
  `node_modules/.pnpm/@medusajs+file-local@2.19.0_*/node_modules/@medusajs/file-local/dist/services/local-file.js`.

Применённые стандарты из `standards.md`: OWASP ASVS 4.0.3 L2 (V2, V3, V4, V7, V8, V9, V12, V14), OWASP Top 10:2021 (A01, A02, A03, A05,
A06, A07, A09), OWASP API Security Top 10:2023 (API2, API3, API4, API8), CWE, PCI DSS 4.0 (только вопрос области), 152-ФЗ/GDPR
(минимизация и сроки хранения), 12-factor III.

Запущенные команды:

| Команда | Код выхода | Результат |
|---|---|---|
| `nice -n 15 corepack pnpm audit --prod --json > handoff/audit-2026-09-23/pnpm-audit-prod.json` | 1 | 683 КБ JSON, 112 уязвимостей |
| `nice -n 15 node -e '<разбор pnpm-audit-prod.json по severity>'` | 0 | critical 3, high 54, moderate 52, low 7 |
| `git merge-base --is-ancestor 954c860d dev` | 0 | PR #109 (исправление T-6) в `dev` есть |
| `git merge-base --is-ancestor 3d8a0048 dev` | 1 | hotfix-коммит T-6 в `dev` не влит (это cherry-pick на live-коммит) |
| `git grep -nE "(sk_live\|sk_test\|whsec_\|BEGIN (RSA\|OPENSSH\|PRIVATE)\|password\s*[:=]…)"` | 0 | только `supersecret` в тестах и фикстурах (намеренно, см. AGENTS.md) |
| `git ls-files \| grep -iE "(^\|/)\.env"` | 0 | отслеживаются только 5 `.env.template` / `.env.example` |

Ни один секрет в этом отчёте не приведён значением: только файл и тип.

## Итог одной строкой

**Оценка D** (по шкале `standards.md`: есть Critical). Ядро мультитенантности спроектировано правильно и держится — тенант выводится из
токена овнера и из publishable key, никогда из тела запроса; T-6 закрыт в `dev`; IDOR по заказам закрыт трёхуровневым guard-ом. Оценку
опускают не дефекты изоляции, а три вещи вокруг неё:

1. **Две выгрузки ПД пишутся в публичную статику** (`/tenants/customers/export`, `/tenants/orders/export`) с предсказуемым именем файла:
   ФИО, e-mail и телефоны всех покупателей магазина доступны по неаутентифицированному URL бессрочно. Три соседние выгрузки в том же
   репозитории сделаны правильно, потоком в ответ, — то есть это не архитектурная проблема, а две строки `access: "public"`.
2. **`COOKIE_SECURE` не выставлен нигде** и даже не передаётся в контейнер в `deploy/compose.mt.yml`: сессионная cookie овнера идёт без
   атрибута `Secure`.
3. **Ограничения частоты нет ни на одном своём маршруте** — ни на логине овнера, ни на регистрации магазина, ни на публичном
   `/storefront/by-host`.

Распределение: Critical 2, High 4, Medium 4, Low 3, Info 2. Все шесть Critical/High закрываются небольшими правками (S), суммарно около
дня работы: ни одна не требует переделки архитектуры.

## Находки

| ID | Серьёзность | Стандарт | Где (абсолютный путь:строка) | Что не так | Риск | Что сделать | Объём |
|---|---|---|---|---|---|---|---|
| A-01 | Critical | ASVS 4.0.3 §8.3.4, §12.4.1; OWASP A01:2021; CWE-552; 152-ФЗ минимизация | `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/tenants/customers/export/route.ts:89` (имя файла) и `:99` (`access: "public"`) | `POST /tenants/customers/export` строит CSV со столбцами `first_name,last_name,email,phone,…` (строки 20-29) и отдаёт его в `uploadFilesWorkflow` с `access: "public"`. Локальный провайдер кладёт файл в публичный `upload_dir` под ключом `${Date.now()}-${filename}` (`node_modules/.pnpm/@medusajs+file-local@2.19.0_*/node_modules/@medusajs/file-local/dist/services/local-file.js:69-74`), а фреймворк монтирует `static/` через `express.static` ДО загрузки `src/api`, поэтому ни один middleware проекта не видит запрос к существующему файлу — это описано самим репозиторием в `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/tenant-files/static-headers.ts:6-16`. Имя не случайное: `customers-export-<ISO-время-с-миллисекундами>.csv`, то есть URL выводится из момента нажатия «Экспорт» с точностью до ~10³ вариантов на секунду | Вся клиентская база магазина (ФИО, e-mail, телефон, число заказов, сумма покупок) доступна по неаутентифицированному URL любому в интернете, бессрочно, и остаётся там после того как овнер скачал файл. Нарушение 152-ФЗ (передача ПД неограниченному кругу лиц) и ASVS V8 | Заменить `access: "public"` на `"private"` и отдавать файл либо потоком в ответе того же запроса (`res.setHeader("Content-Disposition"…)` — CSV укладывается в один ответ, он уже целиком в памяти на строке 88), либо через presigned-URL провайдера с коротким TTL. Это же касается остальных экспортов, см. A-02 | S |
| A-02 | Critical | ASVS 4.0.3 §8.3.4; OWASP A01:2021; CWE-552 | `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/tenants/orders/export/route.ts:139` (`access: "public"`) и `:130` (имя файла) | Ровно тот же дефект, что A-01, на выгрузке заказов: `orders-export-<ISO-время>.csv` уходит в `uploadFilesWorkflow` с `access: "public"`, среди столбцов — `email` покупателя (`:35`, `:49`, `:91`). Проверены и остальные три выгрузки — они сделаны ПРАВИЛЬНО и отдают файл потоком в том же ответе: `apps/backend/src/api/tenants/products/export/route.ts:34-38`, `apps/backend/src/api/tenants/marketplace-orders/export/route.ts:27-31`, `apps/backend/src/api/admin/tenants/[id]/export/route.ts:27-29` (`Content-Disposition: attachment` + `res.send`) | Список заказов магазина с адресами почты покупателей по неаутентифицированному URL, бессрочно | Переписать A-01 и A-02 по образцу трёх остальных выгрузок: `res.setHeader("content-type"/"content-disposition")` + `res.send(csv)` вместо `uploadFilesWorkflow`. Готовый шаблон уже в репозитории, менять нужно по ~10 строк в двух файлах | S |
| A-03 | High | ASVS 4.0.3 §3.4.1; OWASP A02:2021; CWE-614 | `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/medusa-config.ts:163-166` | `cookieOptions.secure` читается из `process.env.COOKIE_SECURE === "true"`, а переменная не выставлена НИГДЕ: `grep -rn "COOKIE_SECURE"` по всему репозиторию даёт только это чтение и строку документации `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/README.md:145` (там же написано, что по умолчанию `false`). В `deploy/compose.mt.yml` она даже не передаётся в контейнер, в отличие от `JWT_SECRET` (`deploy/compose.mt.yml:66`), поэтому выставить её в env-файле стенда сейчас недостаточно | Сессионная cookie овнера панели и `_medusa_jwt` покупателя уходят без `Secure`. Traefik делает 301 с http на https (`deploy/compose.mt.yml:160`), но первый запрос по http всё равно несёт cookie в открытом виде, и активный сетевой посредник забирает сессию овнера магазина | В `deploy/compose.mt.yml` и `deploy/compose.stand.yml` добавить `COOKIE_SECURE: "true"` в env сервиса `backend`. Лучше — инвертировать значение по умолчанию в `medusa-config.ts`: `secure: process.env.COOKIE_SECURE !== "false"`, чтобы конфиг закрывался, а не открывался при забытой переменной | S |
| A-04 | High | ASVS 4.0.3 §2.2.1; OWASP API4:2023, A07:2021; CWE-307 | `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/middlewares.ts:305-311` (единственный middleware на `/auth/tenant/emailpass` — `blockArchivedTenantLogin`) | Ни на логине овнера, ни на `POST /tenants` (регистрация), ни на публичных `/storefront/by-host`, `/store/tenant/*` нет ограничения частоты. `grep -rniE "rate.?limit\|express-rate\|bruteforce\|throttle"` по `apps/backend/src`, `deploy/`, `apps/storefront/src` находит только разбор лимитов ЧУЖИХ API (Wildberries, Ozon: `apps/backend/src/modules/marketplace/scheduler.ts:16-23`), ничего своего. В traefik-метках `deploy/compose.mt.yml:158-170` middleware ограничения тоже нет | Перебор пароля овнера без счётчика и без блокировки: политика пароля — 8 символов (A-07), так что перебор реалистичен. Компрометация одного овнера = полный доступ к его магазину, заказам и базе покупателей | Добавить middleware ограничения частоты на `/auth/tenant/emailpass`, `/auth/*/register` и `/storefront/by-host` (по IP и по e-mail), либо метку traefik `rateLimit` на `mt-backend` как первый шаг за 15 минут | M |
| A-05 | High | OWASP A06:2021; ASVS 4.0.3 §14.2.1 | `/Users/ivanprotsko/upready/projects/upready-store/handoff/audit-2026-09-23/pnpm-audit-prod.json` (вывод `corepack pnpm audit --prod --json`) | В продакшн-графе 112 уязвимостей: **critical 3, high 54, moderate 52, low 7**. Прямые зависимости среди них: `lodash@<=4.17.23` (CVE-2026-4800, инъекция кода через `_.template`, путь `apps__storefront>lodash`), `nodemailer@<=7.0.10` (CVE-2025-14874, DoS разбора адреса, путь `apps__backend>nodemailer`), `sharp@<0.35.0` (GHSA-f88m-g3jw-g9cj, четыре CVE libvips, путь `apps__storefront>next>sharp`). Три critical — `protobufjs` (CVE-2026-41242 выполнение кода и др.), путь `apps__backend>@gorgo/medusa-integration>@medusajs/deps>@opentelemetry/sdk-node>…>protobufjs` | `sharp` обрабатывает загруженные овнером картинки, то есть данные извне, — это реальный путь. `lodash` и `nodemailer` тоже на горячем пути. **предположение**: три critical в `protobufjs` не на пути запроса (OpenTelemetry-экспортёр, вход не контролируется атакующим), поэтому серьёзность находки выставлена High, а не Critical | Поднять три прямые зависимости: `lodash` до >=4.18.0, `nodemailer` до >=7.0.11, `sharp` до >=0.35.0 (последняя — через `pnpm.overrides`, так как приходит из `next`). Остальное — транзитивное из `@medusajs/*`, закрывается обновлением Medusa и в отдельную задачу | M |
| A-06 | High | 12-factor III; ASVS 4.0.3 §14.1.3, §6.4.1; CWE-1188, CWE-798 | `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/medusa-config.ts:160`, `:161`, `:114-115`, и `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/store-order-access/token.ts:27` | Четыре секрета падают на литерал `"supersecret"`: `jwtSecret`, `cookieSecret`, `stateSecret` провайдера Yandex и `ORDER_ACCESS_SECRET` токена доступа к заказу гостя. Конфиг открывается, а не закрывается: при незаданной переменной сервис поднимается с ПУБЛИЧНО известным секретом (он в README стартера и находится в десятке фикстур через `git grep`). AGENTS.md:14 называет `supersecret` намеренным дефолтом стартера, и для одномагазинного шаблона это так, но эта кодовая база теперь ещё и живая мультитенантная платформа | При незаданном `JWT_SECRET` две дыры сразу: подделка токена овнера ЛЮБОГО магазина (полный доступ ко всем тенантам) и подделка `x-order-token` для любого заказа любого магазина, то есть чтение почты, телефона и адреса доставки любого покупателя в обход `ensureOrderAccess`. На живом MT-хосте переменная задана (`deploy/mt/shipshift.env`, значение не приводится), поэтому сейчас не эксплуатируется — это дефект «отказ в открытую», а не активная дыра, и серьёзность выставлена High, а не Critical | Разделить два режима: оставить дефолт для `NODE_ENV !== "production"`, а в продакшене падать на старте с внятной ошибкой, если `JWT_SECRET` или `COOKIE_SECRET` не заданы. Шесть строк в `medusa-config.ts` закрывают все четыре места, так как три из них читают ту же переменную | S |
| A-07 | Medium | ASVS 4.0.3 §14.4.3, §14.4.5; OWASP A05:2021 | `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/next.config.js:82-96` | `headers()` возвращает ровно одно правило — `Cache-Control` на `/flags/:path*`. Ни `Content-Security-Policy`, ни `Strict-Transport-Security`, ни `X-Frame-Options`/`frame-ancestors`, ни `Referrer-Policy`, ни `X-Content-Type-Options`. В деплое обратного прокси со своими заголовками нет: в `deploy/` нет ни одного `.conf`/`Caddyfile`, а метки traefik (`deploy/compose.mt.yml:158-170`, `247-267`) задают только маршрутизацию и TLS | Без HSTS первый заход по http доступен для перехвата (усиливает A-03). Без `frame-ancestors` витрину любого магазина можно вложить в iframe и провести clickjacking на кнопку оформления. Без CSP любая будущая XSS не ограничена ничем | Добавить в `headers()` один блок на `/:path*` с `Strict-Transport-Security`, `X-Frame-Options: SAMEORIGIN` (или `frame-ancestors 'self'`), `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`. CSP — отдельно и в режиме `Report-Only` сначала, из-за `inlineCss: true` (`next.config.js:80`) и скрипта темы в `apps/storefront/src/app/layout.tsx:125` | S |
| A-08 | Medium | ASVS 4.0.3 §2.1.1, §2.1.7; OWASP A07:2021; CWE-521 | `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/tenants/validators.ts:62-65` | `new_password: z.string().min(8)` — 8 символов, без проверки по списку утёкших паролей. ASVS L2 §2.1.1 требует минимум 12 символов для пароля, задаваемого пользователем, §2.1.7 — сверку с базой утечек | В сочетании с отсутствием ограничения частоты (A-04) перебор пароля овнера практичен | Поднять до `.min(12)` в этой схеме и в схеме регистрации; сверка с утечками — отдельная задача | S |
| A-09 | Medium | ASVS 4.0.3 §14.1.3; OWASP A05:2021; CWE-1188 | `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/app/api/revalidate/route.ts:31-36` | Проверка секрета — `if (process.env.REVALIDATE_SECRET && secret !== process.env.REVALIDATE_SECRET)`. При незаданной переменной условие ложно и маршрут отвечает без всякой аутентификации. Сравните с правильным поведением в `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/telegram/link/route.ts:47-56`, где пустой секрет даёт 503 и явный комментарий «Fail closed». Все `deploy/**/*.env.example` везут `REVALIDATE_SECRET=` пустым (`deploy/mt/shipshift.env.example:111`) | Неаутентифицированный сброс кэша всей витрины: `revalidatePath` в этом маршруте чистит путь сразу для ВСЕХ магазинов процесса (комментарий в файле, строки 19-24), то есть один запрос в цикле кладёт весь MT-хост под нагрузку регенерации. На живом хосте переменная задана, эксплуатации сейчас нет | Отказ в закрытую: `if (!process.env.REVALIDATE_SECRET \|\| secret !== process.env.REVALIDATE_SECRET) return 401`. Две строки | S |
| A-10 | Medium | OWASP API6:2023; ASVS 4.0.3 §2.2.1 | `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/middlewares.ts:283-292`, `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/tenants/route.ts:15-34` | `POST /tenants` создаёт магазин с первым овнером по токену регистрации (`allowUnregistered: true`). Ни подтверждения e-mail, ни инвайта, ни ограничения частоты (A-04) на пути «`POST /auth/tenant/emailpass/register` → `POST /tenants`» не видно. **предположение**: не проверено, требует ли `createTenantWorkflow` подтверждённый адрес — воркфлоу не дочитан | Автоматическая регистрация магазинов пачками: каждый вызов провижионит склад, канал продаж, publishable key и сеет стартовый каталог (`seed-tenant-dataset`), то есть дешёвый запрос порождает дорогую работу и мусорные тенанты в живой базе | Либо закрыть регистрацию инвайтом/подтверждением адреса, либо поставить жёсткий лимит частоты на `POST /tenants` по IP. Решение продуктовое — за Иваном | M |
| A-11 | Low | ASVS 4.0.3 §8.3.1; 152-ФЗ минимизация | `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/subscribers/password-reset-email.ts:106`, `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/scripts/ensure-accounts.ts:143`, `:207`, `:249` | Адрес e-mail печатается в лог целиком (`Sent to ${email}`). Тел и адресов доставки в логах не нашёл, тел запросов тоже: `console.log` в `apps/backend/src` — 27 штук, ни один не печатает `req.body` | Персональные данные попадают в логи и в их бэкапы, где нет ни срока хранения, ни контроля доступа | Логировать идентификатор клиента или маскированный адрес (`a***@example.com`). Правка в одну строку на каждое место | S |
| A-12 | Low | ASVS 4.0.3 §14.2.3; CWE-1295 | `/Users/ivanprotsko/upready/projects/upready-store/apps/tenant-panel/src/lib/client/client.ts:22-24` | `(window as any).__sdk = sdk` без проверки режима сборки — аутентифицированный SDK-клиент лежит на `window` в продакшн-бандле панели. Комментарий рядом честно говорит, что это для консоли | Расширение браузера или любой сторонний скрипт на странице панели получает готовый клиент с сессией овнера. Сама по себе не уязвимость (при XSS доступ и так есть), но снимает барьер | Обернуть в `if (import.meta.env.DEV)` | S |
| A-13 | Low | ASVS 4.0.3 §9.2.3; CWE-598 | `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/cdek/webhook/route.ts:37`, `:55-58` | Токен вебхука CDEK передаётся в строке запроса (`?token=…&tenant=…`). Токены в URL попадают в access-логи traefik, в `Referer` и в историю прокси. Сравнение `!==` не константное по времени | Утечка токена через логи позволяет подделывать статусы доставки для магазина. Область ограничена одним тенантом, денег не касается | CDEK не умеет заголовки — оставить как есть, но не писать query в access-лог и сравнивать через `crypto.timingSafeEqual`. Тот же приём для `/telegram/link` (`route.ts:58`) | S |
| A-14 | Info | OWASP API9:2023 | `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/storefront/by-host/route.ts:42-50`, `:105-125` | Маршрут публичный по конструкции (комментарий, строки 19-23) и берёт `host` из query, а не из заголовка `Host`, поэтому перебором имён можно получить список всех магазинов платформы с их handle, названием, доменами и publishable key. Ключ действительно не секрет (каждая витрина везёт его в своём HTML), но `metadata` тенанта отдаётся целиком (строка 113) вместе с `analytics` | Инвентаризация платформы конкурентом; риск возрастает, если в `tenant.metadata` когда-нибудь окажется непубличное поле | Действия не требует. Точечно: отдавать из `metadata` только `analytics`, а не объект целиком | S |
| A-15 | Info | ASVS 4.0.3 §4.1.3; OWASP A01:2021 | `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/field-guard.ts:1-27`, `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/middlewares.ts:293-296` | **Подтверждено закрытым.** Корневая причина T-6 описана в самом файле и проверена по коду: Medusa 2.19 отдаёт `?fields=` прямо движку запросов, тот идёт по всем link-ам модулей, а списки `allowed`/`restricted` в query-config действуют только под флагом `rbac_filter_fields`. Поэтому анонимный посетитель с publishable key читал `*tenant.admins` и `*tenant.notification_settings` с любого продукта, а овнер — `*customer.orders`, то есть заказы того же покупателя во всех других магазинах. Исправление — allow-list `guardRequestedFields` на двух wildcard-матчерах `/store/*` и `/tenants/*`, которые сортируются раньше любого статического маршрута. `git merge-base --is-ancestor 954c860d dev` = 0: в `dev` исправление есть (PR #109). Коммит `3d8a0048` в `dev` не влит — это тот же фикс, перенесённый на живой коммит, и это ожидаемо | — | Ничего. Для лида: на `dev` действует версия из PR #109, ветку `hotfix/o21-tenant-field-leaks-live` можно закрывать после сверки живого образа | S |

## Что сделано хорошо

Это не формальная вежливость: ядро изоляции здесь сделано лучше, чем в большинстве мультитенантных Medusa-сборок.

- **Тенант никогда не берётся из запроса.** `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/tenants/tenant-scope.ts:38-63`
  выводит тенанта из `req.auth_context.actor_id` через `tenant_admin`, а `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/store/tenant/resolve-tenant.ts:17-32`
  — из `req.publishable_key_context.sales_channel_ids`. Тело и query только СУЖАЮТ набор (`scopeIdFilter`, строки 157-166).
- **Две ловушки мультитенантности закрыты осознанно.** `id: undefined` в фильтре Medusa — это отсутствие фильтра, поэтому пустое пересечение
  отдаётся как `emptyPage`, а не как запрос без фильтра (`tenant-scope.ts:11-19`, `:172-176`). Чужой id даёт `NOT_FOUND`, а не `NOT_ALLOWED`,
  так что ответ не подтверждает существование чужой строки (`:178-191`).
- **Маршруты, которых ещё нет, отвечают пустой страницей, а не незаскоупленным списком.** `/tenants/returns`, `/tenants/claims`,
  `/tenants/exchanges`, `/tenants/order-edits` (например `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/tenants/returns/route.ts:21`)
  возвращают `count: 0` «по построению, а не фильтром, который может быть неверным» — это правильный выбор.
- **IDOR по заказам на витрине закрыт, и закрыт правильно.** Medusa 2.19 не аутентифицирует `GET /store/orders/:id` вовсе (в её собственном
  коде на этом месте стоит TODO), и на этом деплое это означало чтение любого заказа любого магазина по чужому publishable key — это было
  измерено на стенде 2026-09-15. `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/store/order-access.ts:24-44`
  ставит три правила по порядку: канал продаж ключа, затем `order.customer_id`, затем одноразовый токен заказа, и любой отказ отвечает
  ОДИНАКОВЫМ 404, чтобы ответ не работал как оракул существования заказа. Токен — HMAC-SHA256 со сравнением через `crypto.timingSafeEqual`
  (`apps/backend/src/store-order-access/token.ts:31`, `:42`). Guard-ы разведены по пяти матчерам в `apps/backend/src/api/middlewares.ts:1459-1487`.
- **Платежи: карточные данные не касаются наших серверов.** Единственный провайдер — Robokassa с редиректом
  (`apps/backend/src/modules/payment-robokassa/`), область PCI DSS 4.0 сводится к SAQ A. Вебхук
  `/Users/ivanprotsko/upready/projects/upready-store/apps/backend/src/api/robokassa/result/route.ts` сделан по учебнику: подпись проверяется
  (`:82`), магазин берётся ИЗ СЕССИИ, а не из запроса (`:78`), сумма и номер счёта сверяются с сохранёнными (`:85-87`), повтор подтверждённого
  счёта идемпотентен (`:89-105`), провал завершения корзины отдаёт 500, чтобы Robokassa повторила (`:114-121`).
- **XSS-синки закрыты.** Тенантский markdown экранируется и не идёт через `dangerouslySetInnerHTML`
  (`apps/storefront/src/modules/content/components/markdown-content/index.tsx:9`), а JSON-LD экранирует `<`
  (`apps/storefront/src/modules/common/components/json-ld/index.tsx:15`).
- **Открытый редирект закрыт правильно**, включая протокол-относительный `//evil.com`:
  `/Users/ivanprotsko/upready/projects/upready-store/apps/storefront/src/lib/util/yandex-auth.ts:85-88`.
- **Загрузки проверяются по типу И по расширению**, потому что статику отдаёт имя файла, а не заявленный MIME
  (`apps/backend/src/tenant-files/upload-policy.ts:54-75`), и SVG отсеивается по скриптам и обработчикам событий (`:37-50`).
- **Токен панели не лежит в localStorage.** `__AUTH_TYPE__` жёстко `"session"`, ключ JWT-хранилища пустой
  (`apps/tenant-panel/vite.config.mts:39-40`), в `localStorage` только тема, состояние навигации и язык. CSRF при cookie-аутентификации
  снимается `sameSite: "lax"` (`apps/backend/medusa-config.ts:164`), а панель ходит через свой же origin.
- **Секретов в git нет.** Отслеживаются только пять `.env.template`/`.env.example`; `.gitignore:37-41` и `deploy/.gitignore:1-3` покрывают
  `deploy/stands/*.env` и `deploy/mt/*.env`. Реальные env-файлы живого хоста лежат в рабочей копии, но не в индексе.
- **SQL-инъекций нет.** Все восемь `knex.raw`/`pg.raw` (например `apps/backend/src/api/tenants/customers/helpers.ts:97`) либо константны,
  либо используют позиционные параметры `?`. SSRF с URL из запроса не найдено.
- **Telegram-вебхук отказывает в закрытую** при незаданном секрете, с объяснением почему
  (`apps/backend/src/api/telegram/link/route.ts:47-56`) — ровно тот шаблон, которого не хватает в A-09.

## Не покрыто

- **`apps/backend/src/api/middlewares.ts` прочитан выборочно** (145 матчеров, 1496 строк): разобраны секции аутентификации, field-guard и
  матчеры `/tenants`, `/store`, `/auth`. Полная сверка «у каждого пишущего маршрута есть zod-валидатор и нет mass assignment» по всем 181
  маршруту не сделана — на это нужен отдельный проход. Выборка из шести валидаторов показала `z.strictObject`, то есть лишние поля отвергаются.
- **`apps/backend/src/api/store/order-access.ts` прочитан на треть** (80 из 272 строк): разобраны модель угрозы, извлечение id и токена и
  способ сравнения. Сами реализации `ensureOrderAccess`, `scopeOrderListToShop` и `guardOrderTransferRequest` не дочитаны, как и
  `cart-scope.ts` (97 строк). Заявленные правила выглядят верно, но построчной проверки их исполнения нет.
- **Воркфлоу `createTenantWorkflow`** не прочитан, поэтому A-10 помечена предположением в части подтверждения адреса.
- **Ротация и хранение секретов интеграций** (`tenant_integration_secret`, `INTEGRATION_ENCRYPTION_KEY`) не аудированы: видно, что ключи
  магазинов шифруются плагином, но схема шифрования не проверена.
- **Динамических проверок не было вовсе**: ни одного запроса к живому стенду, ни одной попытки эксплуатации. Все выводы — из чтения кода,
  плюс один `pnpm audit`. A-01 не проверена запросом к живой статике; вывод построен на коде маршрута, коде провайдера файлов и описании
  монтирования `static/` в самом репозитории.
- **`apps/bot/**` и `.github/workflows/**`** из области A посмотрены только через поиск секретов; отдельного разбора прав workflow-ов и
  прав бота нет. CI/CD глубже — область D.
