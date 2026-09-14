# Онбординг после оплаты — спека (6.2, 6.2.1)

Автор: worker W4, ночь платформы 11→12.09.2026 (`feat/mt-platform`). Это СПЕКА, не код: ничего из
описанного здесь не реализуется этой ночью. Основа — брифа B1 (`docs/multitenancy/2026-09-11-night-2-platform-brief.md`),
контракт `docs/multitenancy/admin-tenants-api-contract.md`, код `createTenantWorkflow`, и живая
документация polar.sh / tribute.tg (fetch 2026-09-11, источники — §8; **никаких фактов о внешних
сервисах из памяти модели**, 17a). Базовый домен платформы — `upready.dev`, технический поддомен
тенанта — `<handle>.upready.dev` (правка владельца, применена по всему документу).

## 1. Цепочка

```mermaid
sequenceDiagram
    actor Buyer as Покупатель
    participant Site as upready.dev
    participant Provider as polar.sh / tribute.tg
    participant Hook as backend: POST /webhooks/{polar,tribute}
    participant Platform as platform-модуль (account, purchase, onboarding_token)
    participant Notify as Email / Telegram-бот
    participant Wizard as tenant-panel: /onboarding/:token
    participant Workflow as createTenantWorkflow
    participant Panel as tenant-panel (авто-вход)

    Buyer->>Site: открывает upready.dev, выбирает тариф
    Site->>Provider: переход на checkout (Polar Checkout Link / Tribute product link)
    Buyer->>Provider: оплачивает
    Provider-->>Buyer: редирект на success_url (Polar) ИЛИ ничего (Tribute — платёж внутри Telegram)
    Provider->>Hook: webhook: order.paid / newDigitalProduct / newSubscription (не trial)
    Hook->>Hook: проверка подписи (webhook-signature HMAC-SHA256 / trbt-signature HMAC-SHA256)
    Hook->>Platform: идемпотентно по provider_event_id: find-or-create account, create purchase(status=paid)
    Platform->>Platform: create onboarding_token (случайные 32 байта, хранится хэш, TTL)
    Platform->>Notify: письмо (Polar) или сообщение бота (Tribute) со ссылкой /onboarding/:token
    Buyer->>Wizard: переходит по ссылке (email или Telegram)
    Wizard->>Wizard: шаг 1 (название+handle) → шаг 2 (контакты) → шаг 3 (валюта/регион/язык) → пароль
    Wizard->>Workflow: createTenantWorkflow(name, handle, admin{email,password}, authIdentityId)
    Workflow-->>Wizard: tenant + sales_channel + api_key + склад + первый админ
    Wizard->>Platform: onboarding_token.used_at = now; link account↔tenant
    Wizard->>Panel: авто-вход (та же сессия/токен, что POST /auth/tenant/emailpass выдал бы)
```

Пронумерованный ход событий:

1. Покупатель на `upready.dev` выбирает тариф или товар (страница тарифов; в эту ночь сайт не
   трогаем, но контракт для неё — §4).
2. Переход к оплате: Polar Checkout Link (долгоживущий URL организации) или Tribute product
   link/webLink (открывается внутри Telegram). Выбор способа оплаты живёт на стороне upready.dev.
3. Оплата проходит на стороне провайдера. Polar может отредиректить браузер на `success_url` с
   `checkout_id={CHECKOUT_ID}`; Tribute редиректа не документирует — платёж целиком внутри Telegram
   (источник 6, §4 ниже разводит эти два случая явно).
4. Провайдер шлёт вебхук (`order.paid` для Polar; `newDigitalProduct` / `newSubscription` /
   `renewedSubscription` с `type != "trial"` для Tribute) на `POST /webhooks/polar` или
   `POST /webhooks/tribute`.
5. Хендлер проверяет подпись, идемпотентность по `provider_event_id`, находит/создаёт `account`,
   создаёт `purchase` со статусом `paid`.
6. Хендлер создаёт `onboarding_token`, привязанный к `purchase`, и отправляет ссылку получателю —
   письмом (email есть всегда, включая Polar-путь) или сообщением бота (обязательно для Tribute, т.к.
   redirect недоступен).
7. Покупатель открывает `/onboarding/:token` в `apps/tenant-panel` (PublicLayout, без сайдбара —
   как `routes/login`), проходит три шага мастера (§5), задаёт пароль.
8. Мастер на финише вызывает тот же `createTenantWorkflow`, что и `POST /admin/tenants` (контракт,
   §6), с `authIdentityId` от только что зарегистрированной emailpass-идентичности.
9. `onboarding_token.used_at` проставляется, `account` линкуется к новому `tenant`, покупатель
   автоматически входит в `apps/tenant-panel` (тот же токен, что выдал бы `POST /auth/tenant/emailpass`).

## 2. Модель `platform` (новый модуль Medusa `src/modules/platform`, НЕ этой ночью)

Отдельный модуль, а не расширение `modules/tenant` — граница ночи (админ-контракт §3c бриф-документа):
`tenant` ничего не знает о деньгах, `platform` ничего не знает о складе/канале. Связь `account` ↔
`tenant` — модульный линк (`src/links/account-tenant.ts`, по образцу `tenant-sales-channel.ts`), не
колонка: один `account` может обзавестись 0..N тенантами со временем (не только в момент покупки —
Fork №2 решает, сколько тенантов даёт один `purchase`).

### `account`

| Поле | Тип | Примечание |
|---|---|---|
| `id` | `model.id({ prefix: "acc" })` | PK |
| `email` | `text`, nullable | обязателен для Polar-пути; может отсутствовать у чисто Telegram-покупателя, пока Fork №1 не решён |
| `telegram_id` | `text`, nullable, unique когда не null | обязателен для Tribute-пути |
| `name` | `text`, nullable | из checkout (Polar `customer_name`) или из Telegram-профиля |
| `created_at` / `updated_at` | timestamps | стандартные Medusa-поля модели |

### `purchase`

| Поле | Тип | Примечание |
|---|---|---|
| `id` | `model.id({ prefix: "pur" })` | PK |
| `account_id` | `text` (FK через связь `belongsTo`) | владелец покупки |
| `provider` | `enum: polar \| tribute \| manual` | `manual` — Fork №4 (ручная покупка из админки) |
| `provider_event_id` | `text`, **UNIQUE** | идемпотентность вебхука: id события у провайдера (Polar: id объекта `order`/`subscription` события, не id самого webhook-запроса — ретрай шлёт то же событие повторно; Tribute: `purchase_id` из payload, источник 5) |
| `provider_customer_id` | `text`, nullable | Polar: `customer.id`; Tribute: `telegram_id` покупателя (нет отдельного customer id в документации, источник 6) |
| `plan` | `text` | slug тарифа/продукта на стороне платформы, НЕ id продукта у провайдера напрямую (провайдер может переименовать/удалить продукт; маппинг `provider_product_id → plan` — конфиг платформы, не хранится здесь) |
| `status` | `enum: paid \| refunded \| expired` | `expired` — Fork №2 (срок действия тарифа) может его проставлять фоновой задачей, не вебхуком |
| `paid_at` | timestamp, nullable | из payload события |
| `amount` | `integer` | минорные единицы (центы/копейки — как у обоих провайдеров) |
| `currency` | `text` | ISO-код из payload |
| `raw_payload` | `json` | весь тело вебхука как пришло — для отладки и повторной обработки без нового вызова провайдера |
| `created_at` / `updated_at` | timestamps | |

JSON Schema `purchase` (для валидации при записи, не для API-ответа — `raw_payload` в схему не
включён намеренно, это сырьё):

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "purchase",
  "type": "object",
  "required": ["id", "account_id", "provider", "provider_event_id", "plan", "status", "amount", "currency"],
  "properties": {
    "id": { "type": "string", "pattern": "^pur_" },
    "account_id": { "type": "string", "pattern": "^acc_" },
    "provider": { "type": "string", "enum": ["polar", "tribute", "manual"] },
    "provider_event_id": { "type": "string" },
    "provider_customer_id": { "type": ["string", "null"] },
    "plan": { "type": "string" },
    "status": { "type": "string", "enum": ["paid", "refunded", "expired"] },
    "paid_at": { "type": ["string", "null"], "format": "date-time" },
    "amount": { "type": "integer", "minimum": 0 },
    "currency": { "type": "string", "minLength": 3, "maxLength": 3 },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" }
  }
}
```

### `onboarding_token`

| Поле | Тип | Примечание |
|---|---|---|
| `id` | `model.id({ prefix: "obt" })` | PK |
| `purchase_id` | `text` (FK через `belongsTo`) | одна покупка может породить несколько токенов (перевыпуск при истечении — см. §4) |
| `token` | `text`, unique | случайные 32 байта, **хранится хэш** (sha256), не сырое значение — сырое значение уходит только в ссылку и никогда не пишется в БД в открытом виде (тот же принцип, что у auth-токенов) |
| `expires_at` | timestamp | решение о длительности — §4 |
| `used_at` | timestamp, nullable | проставляется мастером на финише; повторный визит по использованному токену → страница «уже использовано» |

Связь `account` ↔ `tenant`: модульный линк 1:N, `src/links/account-tenant.ts`
(`{ platform: { account_id } } ↔ { tenant: { tenant_id } }`), записывается мастером в том же шаге, что
и `onboarding_token.used_at`.

## 3. Вебхуки `POST /webhooks/polar`, `POST /webhooks/tribute`

Оба маршрута публичные (без admin/tenant middleware — провайдер не аутентифицирован как пользователь
платформы), защита — только проверкой подписи. Тело читается как raw bytes ДО парсинга JSON (подпись
считается по сырому телу у обоих провайдеров).

### Проверка подписи

- **Polar** (источник 1): заголовок `webhook-signature`, HMAC-SHA256. Секреты, выпущенные с
  2026-09-08, следуют спецификации Standard Webhooks (секрет `whsec_…` передаётся библиотеке как есть);
  более старые секреты — собственная схема Polar HMAC (секрет нужно предварительно base64-закодировать
  перед тем же кодом проверки). Точная конструкция подписываемой строки не была дословно
  воспроизведена фетчем — перед кодом сверить с SDK Polar (`@polar-sh/sdk`, если появится в
  `node_modules`) или со спекой Standard Webhooks, а не угадывать (19d/17a).
- **Tribute** (источник 5): заголовок `trbt-signature`, HMAC-SHA256 от тела запроса, ключ — API-ключ
  платформы у Tribute. Точная конструкция (сырые байты тела vs канонизированная строка) не
  воспроизведена дословно документацией — сверить с `https://tribute.tg/api/v1/openapi/en` при кодинге.

### Идемпотентность и ретраи

- Уникальный индекс на `purchase.provider_event_id`. Обработка вебхука — вставка `purchase`; конфликт
  уникальности → это тот же ивент, обработанный ранее (провайдер ретраит), отвечаем `200` без побочных
  эффектов (не пересоздаём `onboarding_token`, не шлём письмо повторно).
- Polar ретраит до 10 раз с экспоненциальной задержкой, таймаут ответа 10с (рекомендация уложиться в
  2с), после 10 подряд неуспешных попыток эндпоинт отключается автоматически — обработчик обязан
  отвечать быстро (создание `purchase`/`onboarding_token` — синхронно и дёшево, отправка письма/Telegram
  — можно вынести в фон, чтобы не рисковать таймаутом).
- Tribute ретраит по расписанию 5м/15м/30м/1ч/2ч/4ч/8ч/8ч (~24ч, 8 попыток).

### Что создаёт хендлер и в каком порядке

1. Проверить подпись → `401` при несовпадении (без создания записей).
2. Распарсить событие, отфильтровать не-«оплачено» события: `checkout.updated` без статуса success
   (Polar), `newSubscription{type:"trial"}` (Tribute) → `200` без побочных эффектов (это не покупка).
3. `find_or_create account`: Polar — по `customer.email`; Tribute — по `telegram_id` из payload
   (см. Fork №1 — это решение временное, пока Иван не выбрал модель идентичности).
4. `INSERT purchase` (конфликт по `provider_event_id` → идемпотентный `200`, см. выше).
5. `INSERT onboarding_token` с новым `token`/`expires_at`.
6. Отправить ссылку: Polar → email на `account.email`; Tribute → сообщение ботом в `telegram_id`
   (Tribute не даёт браузерного редиректа — источник 6; ссылка обязана дойти через Telegram, иначе
   покупатель с Tribute не получит её вообще).

### Отказные пути

- **Неизвестный план** (`plan`/id продукта провайдера не смэплен на тариф платформы): `purchase`
  всё равно создаётся (деньги реальны), но `plan` пишется как `"unknown:<provider_product_id>"` и
  событие уходит в ops-алерт (лог + канал уведомлений оператора, вне рамок этой спеки) — `onboarding_token`
  НЕ создаётся автоматически, регистрация тенанта в этом случае идёт вручную через Fork №4 (ручная
  покупка/выдача) после того, как оператор разберётся с маппингом.
- **Refund / cancel** (`digitalProductRefund`, `cancelledSubscription`, Polar `order.refunded` —
  не подтверждено дословно фетчем, но симметрично `order.paid` по устройству API): `purchase.status =
  refunded` по `provider_event_id`/`purchase_id` из payload. Что делать с уже созданным тенантом —
  зависит от Fork №3 (hard/soft delete и retention); эта спека не решает это сама, только фиксирует
  связь `purchase → tenant` через `account`, по которой оператор находит нужный тенант.
- **Дубликат email/telegram_id с уже существующим `account`**: не ошибка — ровно случай «1 клиент,
  много покупок» из брифа; новый `purchase` привязывается к найденному `account`. Ошибкой это становится
  только если один и тот же человек приходит один раз через Polar (email `a@b.com`) и один раз через
  Tribute (`telegram_id`) — тогда без Fork №1 система заведёт ДВА разных `account` на одного человека;
  это следствие, а не что-то, что вебхук может починить сам.

## 4. Ссылка и страница «оплата прошла» — контракт для upready.dev

upready.dev не трогаем этой ночью; ниже — то, что должна уметь его будущая страница тарифов/успеха,
чтобы онбординг работал.

- **Формат ссылки на мастер**: `https://upready.dev/onboarding/:token` — редиректится (по 200/302,
  решает сайт) на `https://panel.upready.dev/onboarding/:token` или на прямой путь `tenant-panel`, если
  панель обслуживается с самого `upready.dev` по другому базовому пути; технической разницы для этой
  спеки нет, важно, что `:token` — сырое (не хэшированное) значение из `onboarding_token.token`.
- **Редирект vs ссылка**: у Polar браузер может сразу попасть на `success_url` с
  `checkout_id={CHECKOUT_ID}` (источник 3) — но в этот момент вебхук ещё мог не долететь (гонка:
  редирект — синхронный ответ Stripe/Polar пользователю, вебхук — асинхронная серверная нотификация).
  Значит страница `success_url` НЕ должна сама показывать токен по `checkout_id`: она показывает
  «оплата принята, письмо со ссылкой уже идёт» и не пытается угадать `onboarding_token` раньше, чем он
  создан. Единственный канал, гарантированно несущий реальный `token`, — письмо (Polar) или сообщение
  бота (Tribute), оба отправляются ПОСЛЕ вебхука, п. 5 выше. У Tribute браузерного редиректа нет вовсе
  (источник 6) — там для покупателя вообще нет страницы «оплата прошла» на upready.dev, только сообщение
  в Telegram.
- **TTL токена**: решение (не входит в обязательные развилки, беру рекомендацией) — **7 дней**,
  одноразовый (`used_at`). Истёкший неиспользованный токен можно перевыпустить вручную из ops (новый
  `onboarding_token` на ту же `purchase`) без повторной оплаты.
- **Страница при использованном/истёкшем токене**: мастер (`tenant-panel`) отвечает, не сайт —
  `GET /onboarding/:token` до первого шага проверяет `used_at`/`expires_at` и вместо формы показывает:
  «эта ссылка уже использована, войдите в панель» (с ссылкой на `/login`) для `used_at`, и «ссылка
  истекла, напишите в поддержку» (с mailto/telegram поддержки) для `expires_at` в прошлом.

## 5. Мастер `/onboarding/:token` в `apps/tenant-panel` (PublicLayout)

Новый маршрут верхнего уровня рядом с `routes/login` (тот же паттерн: `PublicLayout`, без
`ProtectedRoute`/`MainLayout`/сайдбара — см. `apps/tenant-panel/src/app.tsx`,
`components/layout/public-layout.tsx`). Три шага + финиш:

| Поле | Предзаполнено из | Показ/скрыт | Правится позже в панели |
|---|---|---|---|
| Название магазина | `purchase.plan` → дефолтное имя тарифа, либо `account.name` | показан, шаг 1 | нет прямого route в этой волне панели (не строился) |
| Handle | slug из названия магазина / локальной части email (`account.email` до `@`) | показан, шаг 1 | **нет** — иммутабелен через API и в мастере (контракт §3: «immutable through this API tonight»; правило берём и для мастера, `src/api/tenants/validators.ts` regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 3–63 симв.) |
| Email администратора | `account.email` (Tribute-путь без email — поле пустое, покупатель вводит вручную; см. Fork №1) | показан, шаг 2 | нет (смена — только `POST /admin/tenants/:id/admins/:adminId`, админский, не self-service) |
| Пароль | новое значение, вводит покупатель | показан, шаг 2 (или отдельный финальный экран) | нет self-service смены пароля в этой волне панели |
| Валюта | дефолт тарифа (`plan`) | показан, шаг 3 | да, позже в настройках магазина (вне рамок этой ночи — раздел настроек не построен) |
| Регион | дефолт тарифа | показан, шаг 3 | да, позже |
| Язык | дефолт тарифа / язык браузера как fallback | показан, шаг 3 | да, позже |
| Склад | провижнится автоматически (`provisionTenantWarehouseWorkflow` внутри `createTenantWorkflow`) | **скрыт** | да, позже (не в этой волне) |
| Опции доставки | провижнятся автоматически (два стандартных, из того же workflow) | **скрыт** | да, позже |
| Publishable API key | создаётся автоматически | **скрыт** | ключ виден тенант-админу через `GET /tenants/me` уже сегодня; в мастере не показываем |

Финиш мастера: `createTenantWorkflow({ name, handle, admin: { email, first_name?, last_name? },
authIdentityId })` — тот же вызов, что делает `POST /admin/tenants` (контракт §3). `authIdentityId`
получается тем же способом, что и в `POST /tenants` сегодня: `POST /auth/tenant/emailpass/register`
с введённым email+паролем ДО вызова workflow, затем сам workflow с готовым `authIdentityId`. После
успеха: `onboarding_token.used_at = now`, линк `account ↔ tenant`, авто-вход — тот же токен/сессия,
что выдаёт `POST /auth/tenant/emailpass` (мастер логинится тем же email+паролем сразу после регистрации,
без отдельного экрана логина).

## 6. Что уже есть и что переиспользуется

- `createTenantWorkflow` (`apps/backend/src/workflows/tenant/create-tenant/index.ts`) — канал, ключ,
  склад, первый админ; мастер вызывает его без изменений.
- Регистрация пароля админским способом — `authModuleService.register("emailpass", …)`, как в
  `POST /admin/tenants` (контракт §3) и как сегодняшний `POST /tenants` уже делает через
  `/auth/tenant/emailpass/register`.
- `POST /auth/tenant/emailpass` — вход тенант-админа; мастер использует его же для авто-входа на
  финише, отдельного «онбординг-логина» не изобретаем.
- `src/api/tenants/validators.ts` (`PostTenantCreateSchema`) — источник правила handle; мастер
  использует ТУ ЖЕ регулярку на клиенте для мгновенной валидации, сервер всё равно перепроверяет тем же
  валидатором на вызове workflow.
- PublicLayout + структура `routes/login` (`apps/tenant-panel/src`) — образец для нового маршрута
  `/onboarding/:token`, без нового приложения.

## 7. Развилки для Ивана

1. **Идентичность аккаунта: email vs telegram_id vs оба.**
   Сейчас `account` в этой спеке допускает оба поля nullable и заводит запись по тому, что прислал
   конкретный провайдер (email для Polar, telegram_id для Tribute) — без явного решения один человек,
   купивший через оба канала, получит два разных `account`.
   Варианты: (a) email — обязательное поле идентичности, Tribute-покупатель обязан ввести email в
   мастере до создания тенанта (Telegram даёт только имя/номер для DM, не для идентичности); (b)
   telegram_id — обязателен, email опционален; (c) оба поля есть, но связывание по совпадению
   выполняется вручную оператором при обращении клиента (без автосклейки).
   Рекомендация: **(a)** — email как обязательный идентификатор, потому что он единственный канал,
   общий обоим провайдерам (Tribute тоже может слать email внутри Telegram-сообщения, если попросить
   его у покупателя в первом шаге мастера), а вход в панель уже устроен по email
   (`POST /auth/tenant/emailpass`) — второй идентификатор входа не потребуется.

2. **Что даёт тариф: 1 магазин / N магазинов / срок действия, продление.**
   Модель `purchase` не решает, порождает ли она ровно один `tenant` или лимит/бессрочность. Варианты:
   (a) 1 `purchase` = 1 `tenant`, без ограничения по времени (простейшее, соответствует «1 клиент может
   иметь много покупок» из брифа буквально — вторая покупка = второй магазин); (b) `purchase.plan`
   несёт лимит N тенантов и покупатель выбирает, к какому применить онбординг-токен; (c) подписочная
   модель — `purchase` даёт доступ на срок, магазин архивируется (Fork №3) при не-продлении.
   Рекомендация: **(a)** на старте — самая простая связь `purchase → onboarding_token → tenant` 1:1:1,
   не требует UI выбора «к какому магазину применить покупку»; (c) добавляется позже как надстройка над
   `purchase.status = expired` без изменения модели.

3. **Hard vs soft delete тенанта и срок хранения после удаления.**
   `deleteTenantWorkflow` этой ночью делает только soft delete (A3/A1 брифа). Варианты: (a) soft
   навсегда, purge — только вручную по явному запросу владельца данных; (b) soft + автоматический hard
   purge (файлы + строки) через фиксированный срок (30/60/90 дней); (c) hard delete сразу опционален
   флагом `purge_files` (уже есть в контракте §3) — но постоянного расписания purge нет.
   Рекомендация: **(b)**, 30 дней — совпадает с retention пер-тенантного бэкапа из B3
   (`docs/multitenancy/backup-spec.md`, если уже написан другим воркером: ночной `exportTenantWorkflow`
   с retention 30 дней даёт ровно то окно, за которое воостановление ещё возможно из бэкапа даже после
   purge).

4. **Ручная «покупка» из админки (без оплаты — для тестов и рассрочки).**
   `purchase.provider = "manual"` уже заложен в модель (§2), но кто и как её создаёт — не решено.
   Варианты: (a) новый admin-эндпоинт `POST /admin/purchases` (оператор вводит email/telegram, план,
   сумму 0 или частичную — «рассрочка» из брифа) с `provider_event_id` = сгенерированный платформой id;
   (b) переиспользовать `POST /admin/tenants` как есть (уже сегодня заводит тенант без всякой
   `purchase`) и не заводить `purchase` вовсе для ручных тенантов; (c) гибрид — `POST /admin/tenants`
   опционально принимает `purchase: { plan, amount }`, создающий связанную ручную `purchase` тем же
   вызовом.
   Рекомендация: **(c)** — не плодит два разных пути создания тенанта (админский и «покупка без
   оплаты» остаются одним и тем же вызовом), при этом ручные покупки видны в той же таблице `purchase`,
   что и настоящие — статистика и рассрочка (несколько ручных `purchase` с разными `amount` на один
   `account`) не требуют отдельной модели.

5. **Канал доставки ссылки для Tribute-покупателей — форс со стороны документации, не выбор дизайна.**
   Источник 6 подтверждает: у Tribute нет браузерного редиректа после оплаты (платёж целиком внутри
   Telegram) и нет параметра для передачи внутреннего id покупателя при чекауте. Значит ссылка на
   `/onboarding/:token` физически может дойти до Tribute-покупателя только сообщением от бота в тот же
   Telegram-чат, где прошла оплата. Варианты: (a) свой Telegram-бот platform шлёт DM с ссылкой сразу
   после вебхука (нужен бот-токен и `telegram_id` из payload — оба есть, источник 5); (b) сама Tribute
   присылает покупателю единственное подтверждение оплаты, а ссылку на онбординг платформа добавляет в
   описание товара как «после оплаты напишите нам email в бот» — то есть просит покупателя ВРУЧНУЮ
   инициировать диалог; (c) email — тоже собирается на шаге чекаута, если Tribute это позволяет (не
   подтверждено фетчем, источник 6 явно отмечает «no field for external/platform customer id»).
   Рекомендация: **(a)** — единственный вариант без ручного шага покупателя; требует завести
   Telegram-бота платформы (вне рамок этой ночи, отдельная задача), это единственная новая
   инфраструктура, которую B1 подразумевает, но не называет явно.

## 8. Источники

Все файлы — `artifacts/research/2026-09-11-onboarding-payments/`, fetch 2026-09-11 (время — UTC):

1. `source-1-polar-webhooks-delivery.md` — https://polar.sh/docs/integrate/webhooks/delivery (редирект
   с `docs.polar.sh`), 2026-09-11T00:45:00Z
2. `source-2-polar-webhooks-events.md` — https://polar.sh/docs/integrate/webhooks/events (редирект),
   2026-09-11T00:45:30Z
3. `source-3-polar-checkout-links.md` — https://polar.sh/docs/features/checkout/links (редирект),
   2026-09-11T00:46:00Z
4. `source-4-polar-sandbox.md` — https://polar.sh/docs/integrate/sandbox (редирект), 2026-09-11T00:46:20Z
5. `source-5-tribute-webhooks.md` — https://wiki.tribute.tg/for-content-creators/api-documentation/webhooks,
   2026-09-11T00:49:00Z
6. `source-6-tribute-api-overview.md` — https://wiki.tribute.tg/for-content-creators/api-documentation
   и `.../api-documentation/products`, 2026-09-11T00:49:20Z

Не удалось получить дословный JSON-пейлоад события (`order.paid`, Polar) и точную конструкцию подписи
у обоих провайдеров — инструмент фетча возвращает суммаризацию страницы, не сырой markdown/OpenAPI;
зафиксировано как TODO прямо в текстах source-2 и source-5, а не додумано.
