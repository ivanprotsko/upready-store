# t08-order-notifications — письмо покупателю и Telegram владельцу

Когда оформлен заказ, о нём узнают двое: покупатель — письмом, владелец магазина — сообщением
в Telegram. До этой ветки не происходило ни того, ни другого: на МТ-хосте не было переменных SMTP,
ссылки в письмах строились из `STOREFRONT_URL` (домен ДВИЖКА, не витрины магазина), а владельцу
не уходило ничего вовсе.

## Что изменилось

**Бэкенд (`apps/backend`)**

| Файл | Что делает |
|---|---|
| `src/modules/tenant/models/tenant-notification-settings.ts` + `migrations/Migration20260915045704.ts` | одна строка на магазин: имя отправителя, reply-to, привязанный чат Telegram, одноразовый код привязки, последняя доставка каждого канала |
| `src/tenant-notifications/storefront-origin.ts` | адрес ВИТРИНЫ магазина по заказу; `STOREFRONT_URL` остался фолбэком и отдаёт только схему и порт |
| `src/tenant-notifications/shop.ts` | кто владелец заказа — через САЛЕС-КАНАЛ (см. «Найденный по дороге дефект») |
| `src/tenant-notifications/{telegram,link-code,owner-messages,order-message,delivery-status}.ts` | клиент Bot API, одноразовые коды, текст сообщения владельцу (ru/en), запись статуса доставки |
| `src/emails/lib/shop.tsx` + все шаблоны + `lib/notify.ts` | письмо рендерится в контексте КОНКРЕТНОГО магазина: ссылки, имя в шапке, адрес в подвале |
| `src/subscribers/*-email.ts` | все письма о заказе переведены на общий путь (было: четыре своих копии логики) |
| `src/subscribers/order-placed-telegram.ts` | сообщение владельцу по тому же событию `order.placed` |
| `src/modules/smtp-notification/services/smtp.ts` | имя отправителя и `Reply-To` — из магазина; адрес `From` остаётся платформенным |
| `src/api/tenants/notification-settings/**` | экран панели: чтение, сохранение, выпуск кода, «Проверить», «Отключить» |
| `src/api/telegram/link/route.ts` | единственный вызов бота внутрь бэкенда, под общим секретом |

**Бот (`apps/bot`)** — `src/link.ts`: `/start lk_<код>` уходит на бэкенд, ответ печатается владельцу.
Опрос `getUpdates` остался у бота, бэкенд только шлёт — Telegram отдаёт опрос ОДНОМУ потребителю на токен.

**Панель (`apps/tenant-panel`)** — экран «Уведомления» (`/settings/notifications`): имя отправителя,
адрес для ответа, подключение Telegram, кнопка «Проверить», состояние последней доставки по каждому каналу.

**Деплой** — `deploy/mt/shipshift.env.example` и `deploy/compose.mt.yml`: имена переменных SMTP_*,
TELEGRAM_BOT_TOKEN, TELEGRAM_LINK_SECRET, PANEL_PUBLIC_URL. Значений в репозитории нет — они живут
только в `shipshift.env` на хосте.

## Найденный по дороге дефект (его нашла приёмка, не чтение кода)

Первый прогон seam-теста показал: письмо ушло со ссылкой `http://localhost:8061/account/orders`,
то есть на ДВИЖОК, а не на магазин. Причина — гонка: связь «заказ → тенант» пишет СОСЕДНИЙ
подписчик того же события `order.placed`, и читать её в момент отправки письма нельзя. Теперь владелец
определяется по САЛЕС-КАНАЛУ заказа (той же дорогой, что `linkOrderToTenantStep`) — он принадлежит
магазину с момента его создания. Проигрыш в этой гонке был БЕЗМОЛВНЫМ: письмо уходило исправным,
просто со ссылками на чужой сайт.

## Как это измерено (локальный стенд, 2026-09-15)

Стенд: БД `upready_store_t08` (копия `upready_store_mt` + `medusa db:migrate`), бэкенд `:9061`,
витрина `:8061`, панель `:5191`, приёмники SMTP `:2587` и Bot API `:9598`, ЖИВОЙ процесс бота
`apps/bot` против приёмника (другой токен и другой адрес API — боевого бота это не касается).

### 1. Владелец подключил Telegram через настоящий процесс бота

Панель выпустила код, Telegram доставил его боту как `/start`, бот отдал код бэкенду:

```
### 4. Привязка чата владельца acme через живой процесс бота
{ "deep_link": "https://t.me/upreadystore_bot?start=lk_lK54yk7WPotSLPAc" }

лог бота:
{"event":"link.outcome","update_id":6,"chat_id":51632224,"status":"linked"}
{"event":"link.reply.ok","chat_id":51632224,"message_id":5006}

ответ владельцу в чат:
Готово: заказы магазина «Acme» будут приходить сюда.
Чтобы отключить уведомления, откройте в панели «Уведомления» и нажмите «Отключить».
```

Экран панели в состоянии «подключено» —
`file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-order-notifications/artifacts/docs/t08-order-notifications/panel-notifications-acme-1280x900.png`
(и `…-390x844.png` — телефон).

### 2. Письмо покупателю ведёт на ВИТРИНУ магазина

Заказ №18 в магазине acme; письмо снято приёмником SMTP и раскодировано (base64 + quoted-printable):

```
ENVELOPE from: <orders@upready.test> to: <buyer@acme.test>
From: Магазин Акме <orders@upready.test>
Reply-To: hello@acme.test
Subject: Заказ №18 создан

Ссылки в письме:
  http://acme.localhost:8061/account/orders
  http://acme.localhost:8061/order/order_01M2GXH15HTJ5H7HK8Q6PJFDTD/confirmed
```

Ни одной ссылки на `http://localhost:8061` (движок) в письме нет. Адреса живые:

```
http://acme.localhost:8061/               -> 200
http://acme.localhost:8061/account/orders -> 200
```

Лог бэкенда той же отправки:

```
info: [order-placed-email] Sent to buyer@acme.test for order order_01M2GXH15HTJ5H7HK8Q6PJFDTD
      (locale: ru, shop: ten_01M25V2XV2F7T1ZGDYR4GMQHRH, links: http://acme.localhost:8061)
```

### 3. Сообщение владельцу

```
chat_id: 51632224
Новый заказ №18
Магазин: Acme

Состав заказа:
• Acme shirt (live) / Acme shirt (live) — 2 шт — 20,00 €

Способ доставки: Acme courier
Доставка: 10,00 €
Итого: 30,00 €

Покупатель: Оксана Черкашина
Телефон: +7 900 123-45-67
Почта: buyer@acme.test
Адрес: 101000, AD, Москва, ул. Ленина, 1

Открыть заказ в панели: http://localhost:5191/orders/order_01M2GXH15HTJ5H7HK8Q6PJFDTD
```

### 4. Второй магазин ничего не получил

У globex свой привязанный чат (`-100555000111`). По заказу acme:

```
всего sendMessage про заказ №18: 1 | чаты: 51632224
```

и экран владельца globex: «Отправок пока не было» —
`file:///Users/ivanprotsko/upready/worktrees/b29f7dd2-d35c-442d-9636-3c55da1eccf7/feat/day16-order-notifications/artifacts/docs/t08-order-notifications/panel-notifications-globex-1280x900.png`

### 5. Почта не настроена — заказ всё равно оформляется, а провал видно

Бэкенд перезапущен БЕЗ `SMTP_*`:

```
✔ Server is ready on port: 9061 – 5474ms
complete: 200 order order_01M2GXRF21VGXZZJ9JPYNZNWQA display_id: 19

error: [order-placed-email] Failed to send the letter for order order_01M2GXRF21VGXZZJ9JPYNZNWQA
       to buyer-nosmtp@acme.test: Could not find a notification provider for channel: email …

панель владельца:
  email:    { configured: false, last: { status: "failed", order: "19",
              error: "Could not find a notification provider for channel: email …" } }
  telegram: { status: "ok", order: "19" }
```

### 6. Живой бот цел

Читающий вызов боевого Bot API (никому ничего не отправляет):

```
{"ok": true, "result": {"id": 8710049173, "username": "upreadystore_bot", "first_name": "Создание магазина"}}
```

Контейнер `upreadystore-bot` не перезапускался, код на хост не выкладывался.

Сырьё приёмки: `telegram-capture.jsonl` и `mail-capture.jsonl` рядом с этим файлом.

## Стык с t06 (язык магазина)

Ветка смержена с `dev`, куда вошли пер-тенантные настройки языка (`tenant_locale_settings`).
Сообщение владельцу теперь пишется на языке МАГАЗИНА (`default_locale`), а `STOREFRONT_DEFAULT_LOCALE`
деплоя остался фолбэком. Конфликты слияния (три файла, все вида «сосед добавил соседа»)
разрешены сохранением обеих сторон: у тенанта теперь и `locale_settings`, и `notification_settings`,
в панели — и `/settings/locale`, и `/settings/notifications`.

## Проверки

Результат по ФАЙЛУ целиком, а не по своим строкам:

```
cd apps/backend && npx medusa lint            → rc=0, 0 errors, 18 warnings (все — довесок @medusajs
                                                 no-service-mutations-in-api-route на давних маршрутах,
                                                 в том числе пришедших с dev)
cd apps/backend && npx tsc --noEmit            → rc=0
cd apps/backend && pnpm test:unit              → Tests: 1 failed, 95 passed, 96 total (после мержа dev)
    из них своя сюита: src/tenant-notifications → Tests: 16 passed, 16 total (Test Suites: 1 passed)
    единственный красный файл — src/migration-scripts/__tests__/profile-data.unit.spec.ts, он ПАДАЛ
    и до этой ветки: тот же тест на dev в основном чекауте даёт «Tests: 1 failed, 14 passed, 15 total»
    (лишний ключ productOptions в наборе переводов профиля; к t08 отношения не имеет)
cd apps/backend && DB_HOST=localhost DB_PORT=5433 PORT=9199 pnpm test:integration:http -- tenants-notifications
                                               → Test Suites: 1 passed, Tests: 9 passed, 9 total
cd apps/tenant-panel && pnpm typecheck         → rc=0
cd apps/tenant-panel && pnpm lint              → rc=0, 0 errors, 23 warnings (все давние)
cd apps/bot && pnpm typecheck                  → rc=0
cd apps/bot && pnpm test                       → tests 21, pass 21, fail 0
```

Seam-тест `integration-tests/http/tenants-notifications.spec.ts` не мокает ничего в `src`: рядом
лежит `sinks.ts` — минимальный SMTP-сервер и подставной Bot API, оба говорят на настоящем протоколе.
Он доказывает девять вещей, включая изоляцию двух магазинов, одноразовость кода, отказ при неверном
секрете и то, что письмо СОДЕРЖИТ адрес витрины магазина (читается после раскодирования MIME —
на сырых байтах ссылка разорвана мягким переносом quoted-printable и не значит ничего).

## Чего НЕ сделано и почему

1. **Сообщение реальному человеку в Telegram не отправлялось.** Отправка в живой чат — операция
   наружу, её гейт (правило 17b) требует OK Ивана именно на ЭТУ отправку, а Иван спит. Боевой Bot API
   проверен читающим вызовом (`getMe`, п. 6), путь отправки — против приёмника, говорящего на том же
   протоколе, и через живой процесс бота. **Что нужно от Ивана:** одна строка «шли тестовое в мой чат»
   — и сквозная проверка на боевом боте займёт минуту.
2. **Бот на хост не выкачен** (задача это запрещает): пока в `/opt/upready-store-bot/.env` нет
   `UPREADY_BACKEND_URL` и `TELEGRAM_LINK_SECRET`, живой бот на `/start lk_…` ответит «привязка пока
   не настроена». Порядок выкатки — `apps/bot/DEPLOY.md`, раздел «Привязка магазина к чату».
3. **Письма о РЕГИСТРАЦИИ и СБРОСЕ ПАРОЛЯ остались на глобальном адресе.** В их событиях нет заказа,
   а покупатель не несёт на себе метки магазина (`apps/storefront/src/lib/data/customer.ts` кладёт в
   метаданные только локаль). Чинится отдельной задачей: проставлять handle магазина при регистрации.
   Все письма О ЗАКАЗЕ (создан, оплачен, собран, отправлен, доставлен, отменён, завершён, передача
   заказа) — на адресе магазина.
4. **Адрес `From` владелец не задаёт** — только имя отправителя и `Reply-To`. Это осознанный предел:
   один почтовый аккаунт платформы шлёт за все магазины, а чужой домен в `From` отклоняют SPF и DMARC.
5. **Своего бота на магазин нет** — вопрос `q-tg-tenant-token-store` намеренно не открывался.
6. **На живой хост ничего не деплоилось.**

## Как принять за 10 минут

1. Поднять стенд: БД-копия + `medusa db:migrate`, бэкенд `:9061` (с `SMTP_*` на приёмник или без них),
   витрина `:8061`, панель `:5191` — команды в этом отчёте выше.
2. Панель → «Уведомления»: задать имя отправителя, нажать «Подключить Telegram» — появится ссылка вида
   `https://t.me/upreadystore_bot?start=lk_…`.
3. Оформить заказ в магазине и посмотреть на экран «Уведомления»: по обоим каналам должна стоять
   строка «Последняя отправка: …, заказ N — доставлено».
4. Быстрее всего то же самое проверяет seam-сюита одной командой:
   `cd apps/backend && DB_HOST=localhost DB_PORT=5433 PORT=9199 pnpm test:integration:http -- tenants-notifications`
