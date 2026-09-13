# Telegram Mini App для магазина: замеры, схема автосоздания, решение по пулу

**Задача:** t-2026-09-13-04, ветка `feature/telegram-miniapp` от `dev`, сессия-исполнитель 2026-09-13 20:48–22:00 WITA.
**Первоисточники Telegram прочитаны 2026-09-13** (ссылки в §2). Все числа §3 — замеры этой сессии или
замеры соседних треков с указанием документа; ни одно не взято из памяти.

## 1. Решение

**Пул заранее созданных магазинов не нужен.** Всё, что создаётся в рантайме, укладывается в секунды
(§3): засев магазина 1,1 с, публикация хоста ≤5 с после wildcard-сертификата, настройка Mini App на
боте владельца ≈0,3 с (пять вызовов Bot API с сервера). Единственный шаг, который требует человека —
создание бота в BotFather — пул не убирает: бот не создаётся по API вообще (§2.1), а передача бота
другому пользователю — ручное действие в BotFather, возможное только после того, как получатель сам
написал боту (§2.4). Значит «магазин из пула меняет владельца» работает для записи тенанта у нас, но
бот из пула навсегда остаётся на аккаунте платформы — это ровно то же самое, что один платформенный
бот, только в N экземплярах и с ручным созданием каждого.

**Схема — два уровня, оба без ожидания:**

| Уровень | Кто и когда | Что получает магазин | Ручных шагов | Ожидание |
|---|---|---|---|---|
| 0. Платформенный бот (все тарифы, с бесплатного) | один раз: платформа создаёт `@<platform>_bot` и включает у него Main Mini App | ссылку `https://t.me/<platform_bot>?startapp=<handle>` — вычисляется в момент создания магазина (`platformLaunchUrl`, `apps/backend/src/telegram/mini-app.ts`) | 0 на магазин | 0 мс (строка), плюс сам магазин ≈6 с (§3.4) |
| 1. Свой бот владельца (платные тарифы) | владелец: `/newbot` в BotFather (1–2 мин), вставляет токен в панель | кнопку меню «Магазин» в чате бота, имя, описание, команды; ссылку `https://t.me/<его_bot>` | 1 (задан Telegram), Main Mini App / прямая ссылка — по желанию владельца в BotFather | ≈0,3 с на 5 вызовов Bot API (§3.2) |

Регенерация seed под сферу и категорию торговли — ценная идея сама по себе, но её место в мастере,
а не в пуле: трек `feat/abstract-datasets` уже делает это при инициализации (`POST /tenants/seed`,
1138 мс на 10 товаров и 7 категорий, документ
`worktrees/upready-store/feat/abstract-datasets/artifacts/docs/2026-09-12-abstract-dataset/README.md`).

## 2. Факты платформы Telegram (первоисточники)

2.1 **Бот создаётся только через BotFather.** «Use the `/newbot` command to create a new bot.
@BotFather will ask you for a name and username, then generate an authentication token for your new
bot.» — https://core.telegram.org/bots/features#botfather. Bot API (https://core.telegram.org/bots/api,
версия 10.3 от 24 августа 2026) метода создания бота не содержит.

2.2 **Mini App = бот + HTTPS-адрес.** `WebAppInfo.url`: «An HTTPS URL of the Web App to be opened when
the button is pressed» — https://core.telegram.org/bots/api#webappinfo. Кнопка меню ставится по API:
«To customize the button for all users, use @BotFather (the /setmenubutton command or Bot Settings >
Menu Button)… or the setChatMenuButton method in the Bot API» —
https://core.telegram.org/bots/webapps (Launching Mini Apps from the Menu Button). Это единственная
поверхность запуска, которую можно включить БЕЗ BotFather, — на ней и стоит уровень 1.

2.3 **Main Mini App и прямая ссылка — настройки BotFather.** «A bot's main Mini App can also be opened
in the current chat by direct link in the format `https://t.me/botusername?startapp`»; путь:
«@BotFather via /mybots > Select Bot > Bot Settings > Configure Mini App > Enable Mini App»
(https://core.telegram.org/bots/webapps, Launching the Main Mini App; Bot API 7.8, 31 июля 2024).
Прямая ссылка приложения: `https://t.me/botusername/appname?startapp=command` (там же, Direct Link
Mini Apps). Параметр: «If a non-empty startapp parameter is included in the link, it will be passed to
the Mini App in the start_param field and in the GET parameter tgWebAppStartParam» — поэтому вход
`/mini` на витрине разбирает `tgWebAppStartParam` на сервере и делает редирект без клиентского кода.

2.4 **Передача бота — вручную и с условием.** «You can transfer ownership of your bot to another user.
To do this, send /mybots, select your bot, then transfer ownership. You can only transfer a bot to users
who have interacted with it at least once.» — https://core.telegram.org/bots/features#botfather.

2.5 **Скрипт `telegram-web-app.js`** читает параметры запуска из фрагмента URL (`tgWebAppData`,
`tgWebAppPlatform`, `tgWebAppThemeParams`, …) и хранит их в `sessionStorage` под
`__telegram__initParams` (проверено на самом скрипте, `?63`, 116 510 байт, 2026-09-13) — поэтому
страница, открытая полной навигацией внутри того же webview, всё ещё знает, что она в Telegram.
Фрагмент переживает редирект: Location без фрагмента наследует фрагмент исходного запроса (RFC 9110
§10.2.2); проверено в симуляции — `#tgWebAppData=…` дошёл до страницы товара через два редиректа.

2.6 **Чего в документации нет** (и что я не утверждаю): лимита ботов на аккаунт, возможности сменить
username бота, лимитов на `setMyName`. Проверяется в BotFather при создании.

## 3. Замеры

| # | Что | Как | Значение |
|---|---|---|---|
| 3.1 | RTT до api.telegram.org с сервера Contabo (84.46.251.149), `getMe` с заведомо плохим токеном (401 — сам ответ мгновенный) | 3 вызова curl | **59 / 258 / 60 мс** (connect 13 мс, TLS 45 мс) |
| 3.1b | То же с ноутбука (Бали) | 3 вызова | 628 / 599 / 598 мс — для сравнения; сервер в 10 раз ближе |
| 3.2 | Provisioning через бэкенд: `POST /admin/telegram-mini-app` → 5 вызовов Bot API (`getMe`, `setChatMenuButton`, `getMyName`, `getMyShortDescription`, `setMyCommands`; `setMyName`/`setMyShortDescription` пропущены как совпадающие) против мока `mock-bot-api.mjs` | 5 прогонов, `measure-provision.mjs` | медиана **12,3 мс** внутри бэкенда, 24 мс с клиента — сеть до Telegram исключена; с реальным Telegram ожидание ≈ 5 × 60 мс ≈ **0,3 с**, при выбросах как в 3.1 — до 1,3 с |
| 3.3 | Засев магазина `POST /tenants/seed` (трек abstract-datasets, 2026-09-12, локально) | из README трека | **1138 мс**: 10 товаров, 7 категорий, 2 коллекции |
| 3.4 | Публикация хоста `<handle>.shipshift.dev` | до wildcard: 70 с (2026-09-11, комментарий в `api/demo/onboarding/route.ts`); после wildcard `*.shipshift.dev` и `INGRESS_SYNC_INTERVAL` 5 с (2026-09-12, `tenant-tls-wildcard.md`) | остаточное окно **≤5 с** («роутера ещё нет», 404 по валидному TLS) |
| 3.5 | Открытие каталога живого стенда `https://ferrite.upready.dev/ru/store` в мобильном Chromium (профиль iPhone 13, headless, с ноутбука) | 3 прогона, `live-open-timing.mjs` | TTFB 0,93–1,02 с, **FCP 1,27–1,38 с**, DOMContentLoaded 1,53–1,65 с, load 2,1–4,4 с; 12 ссылок на товары |
| 3.5b | Тот же каталог с сервера (curl `acme.shipshift.dev/ru/store`) | 1 | ttfb 0,22 с, total 0,39 с |
| 3.6 | Симулированный webview: `/mini?tgWebAppStartParam=product_chino-pants` → страница товара, локальный dev-стенд Next (тёплый компилятор) | `tg-webview-check.mjs` | 5,2 с — dev-режим, к проду не относится; в прод-сборке редирект не рендерит ничего |

**Итог «от инициализации до первого открытия в Telegram»** (сумма замеров, не прогноз):
seed 1,1 с + хост ≤5 с + Mini App 0 с (уровень 0) или ≈0,3 с (уровень 1) + первая отрисовка ≈1,3 с
= **≈3–8 с**. Пул сэкономил бы не больше ~6 с и стоил бы: N простаивающих тенантов, движок
регенерации, процедура смены владельца (auth identity, sales channel, publishable key, домен), и всё
равно ни одного бота владельцу. Обратный порог: пул имел бы смысл, если бы инициализация стоила
минуты (например, генерация картинок набора на лету: один рендер `nano-banana-pro` — 48,6 с и $0,30 по
README трека abstract) — но набор уже предрендерен и засевается ссылками, поэтому этой минуты нет.

## 4. Что сделано в ветке (dev-база, один магазин)

Бэкенд `apps/backend/src/telegram/`: `bot-api.ts` (клиент с таймингом каждого вызова,
`TELEGRAM_API_BASE_URL` для мока), `mini-app.ts` (чистые построители ссылок и кнопки меню, валидация
username/startapp/HTTPS), `provision.ts` (getMe → setChatMenuButton → профиль только при
расхождении → команды; `resetMiniApp`), `store-record.ts` (`store.metadata.telegramMiniApp`, токен
вырезается из ответов). Роуты: `GET/POST/DELETE /admin/telegram-mini-app`,
`GET /store/telegram-mini-app`. Тесты: 12 unit (jest), `medusa lint` и `tsc` чистые.

Витрина: вход `/[locale]/mini` (серверный редирект по `tgWebAppStartParam`: каталог / товар /
категория / коллекция / корзина), `MiniAppBridge` в корневом layout (грузит `telegram-web-app.js`
ТОЛЬКО когда страницу открыл Telegram; `ready`, `expand`, `disableVerticalSwipes`, `data-tg` на
`<html>`, цветовая схема Telegram на оси `data-mode`, нативная кнопка «назад» скрыта на каталоге и
ведёт по истории на остальных страницах). Тесты: 3 vitest, `tsc` и `next lint` чистые.

Проверка в симулированном webview (`tg-webview-check.mjs`, официальный скрипт Telegram + заглушка
клиента `TelegramWebviewProxy`): **15/15 PASS** — редирект на товар, фрагмент цел, `web_app_ready` /
`web_app_expand` / `web_app_setup_back_button` отправлены, опция выбрана, товар добавлен, кука
`_medusa_cart_id` в сессии, корзина показывает 1 строку, каталог из бара — 11 карточек, обычный браузер
не грузит скрипт Telegram. Кадры `shots-simulated/*.png` — **симуляция, не Telegram**.

## 5. Автосоздание в мастере `/start` (ветки MT, интеграция в одну строку)

Мастер живёт на `feat/abstract-datasets` / `feat/mt-storefront-wave2`
(`apps/storefront/src/app/api/demo/onboarding/route.ts`, шаги 1–5), в `dev` его нет, а ветки задач
не сливаются друг в друга (s8). Поэтому здесь — контракт, а не правка чужой ветки:

1. **Уровень 0.** После шага 2 (`POST /tenants`) ответ мастера получает
   `telegram.launch_url = platformLaunchUrl({ platformBot: process.env.TELEGRAM_PLATFORM_BOT, storeHandle: handle })`
   (импорт из `apps/backend/src/telegram/mini-app.ts` на стороне бэкенда — в ответ `POST /tenants`,
   либо та же чистая функция в роуте мастера). Экран завершения показывает ссылку и QR. Нужно один раз:
   бот платформы в BotFather, Main Mini App включён с URL `https://<platform host>/tg`; страница `/tg` на
   платформенном хосте читает `tgWebAppStartParam=<handle>` и делает 302 на
   `https://<handle>.<base>/mini` (фрагмент наследуется, §2.5). Время: 0 мс.
2. **Уровень 1.** В панели тенанта страница «Telegram»: поле токена → `POST /tenants/telegram-mini-app`
   (та же `provisionMiniApp`, запись на тенанте, токен шифровать) → ссылки и тайминги на экран.
3. Время «инициализация → первое открытие» замеряется на проде тем же `measure-provision.mjs`
   (уровень 1) и `live-open-timing.mjs` (открытие) — скрипты в `artifacts/docs/2026-09-13-telegram-miniapp/`.

## 6. Что нужно от Ивана, чтобы закрыть приёмку в реальном Telegram

Токена бота для upready-store в `.env.keys` нет (есть чужие: `SUPERDUPERTESTING_TELEGRAM_API_KEY` —
тестовый бот воронки svgnoon, `RIZZLAB_BOT_TOKEN`, боты chrxnasdmds); ни одна запись не разрешает
создавать бота от имени сессии, поэтому бота я не создавал. Шаги (≈3 минуты):

1. В Telegram открыть @BotFather → `/newbot` → имя `Upready Store` → username `upready_store_bot`
   (или свободный вариант, обязательно на `bot`) → скопировать токен.
2. Записать в `~/upready/.env.keys`:
   `# upready-store: бот платформы для Telegram Mini App (t-2026-09-13-04), создан <дата>`
   `UPREADY_STORE_TELEGRAM_BOT_TOKEN=<токен>`
3. (По желанию, для ссылки `t.me/<bot>?startapp`) `/mybots` → бот → Bot Settings → Configure Mini App →
   Enable Mini App → URL `https://ferrite.upready.dev/mini`.
4. Дальше сессия: убирает `TELEGRAM_API_BASE_URL` из `apps/backend/.env`, запускает
   `node artifacts/docs/2026-09-13-telegram-miniapp/measure-provision.mjs http://localhost:9042 <токен> https://ferrite.upready.dev 3`
   (реальные тайминги в §3.2), и Иван открывает бота на телефоне → кнопка меню «Магазин» → каталог →
   скриншот в `artifacts/docs/2026-09-13-telegram-miniapp/`.

Оговорка: живой стенд ferrite собран из волны 1 без `/mini` и без моста — до деплоя этой ветки кнопка
меню может указывать на `https://ferrite.upready.dev/ru/store`: каталог откроется, но без нативной
кнопки «назад». Полная приёмка — после слияния в `dev` и передеплоя стенда (21c: деплой по команде).

## 7. Риски и ограничения

- **Токен в `store.metadata` открытым текстом** (админ видит; в ответах API вырезан). На модели
  тенанта — шифровать; здесь оставлено как есть, чтобы не тащить модуль с миграцией под один магазин.
- **Web Telegram (web.telegram.org) открывает Mini App в iframe.** Заголовков `X-Frame-Options` /
  `frame-ancestors` витрина не шлёт (проверено: `next.config.js` ставит только Cache-Control на
  `/flags/*`) — встраивание разрешено. Но кука корзины `_medusa_cart_id` — `SameSite=Lax`
  (`src/lib/data/cookies.ts`): в стороннем iframe она не отправится, корзина в web-клиенте не
  сохранится между страницами. Мобильные клиенты (нативный webview, first-party) — без этой проблемы;
  симуляция §4 это и показала. Лечение — `sameSite: "none"` для куки корзины ценой CSRF-позиции
  (chrxnasdmds так и сделал для JWT); решать при первом реальном запросе из web-клиента.
- **Цветовая схема Telegram переопределяет сохранённый режим посетителя** внутри Telegram — намеренно:
  приложение должно совпадать с чатом; в браузере ничего не меняется.
- **Лимиты BotFather** (число ботов на аккаунт, смена username, частота `setMyName`) документацией не
  описаны (§2.6); с реальным токеном ещё не замерено.
- **Один платформенный бот на все магазины (уровень 0):** кнопка меню у него одна на всех
  (`setChatMenuButton` без `chat_id` — глобальная; с `chat_id` — на чат), поверхность «магазин внутри
  Telegram» — это ссылка `?startapp=<handle>`; уведомления покупателю от платформенного бота
  выглядят как от платформы, а не от магазина. Это и есть аргумент за уровень 1 в платных тарифах.
- **Тайминги 3.2 против мока** — цена бэкенда, а не Telegram; сетевая часть взята из 3.1. Реальный
  прогон — §6 шаг 4.

## 8. Открытые вопросы Ивану

1. Username платформенного бота (`upready_store_bot`?) — создаёт Иван, §6.
2. Можно ли для скриншота приёмки временно поставить кнопку меню у `@superdupertesting_bot` (только
   `setChatMenuButton`, без смены имени)? Он создан для приёмки svgnoon, поэтому без разрешения не трогаю.
3. Куда писать токен тенанта на ветках MT — колонка на тенанте с шифрованием или `metadata`?

Скрипты и кадры: `artifacts/docs/2026-09-13-telegram-miniapp/` (`mock-bot-api.mjs`,
`measure-provision.mjs`, `tg-webview-check.mjs`, `shots-simulated/`, журнал мока
`mock-bot-api.calls.jsonl`).
