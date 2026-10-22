# t-2026-10-20-24 — голосовой чат владельца, этап 1: отчёт

Линия opus-t24-boat, ветка `feat/t24-voice-chat`, папка
[t24-voice-chat/](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t24-voice-chat). Сделано 20.10.2026.

## Итог

Упрощённый голосовой чат владельца работает отдельным приложением
[owner-voice/](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t24-voice-chat/apps/owner-voice).
Владелец держит кнопку и говорит. ElevenLabs распознаёт речь, модель отвечает через шесть
инструментов только для чтения, ElevenLabs озвучивает ответ, а экран показывает текст и карточку со ссылкой.
Данные идут из cherkashino.com через его HTTP API, к базе данных подключения нет.

Ключей на машине сборки нет, поэтому ElevenLabs, модель и данные панели магазина проверены на фикстурах и на замоканном `fetch`.
Каталог и цены cherkashino.com проверены вживую: Store API ключа не требует.

## Решения (записаны через decide.mjs)

1. Где живёт: новое приложение `apps/owner-voice` без runtime-зависимостей, а не маршрут `apps/tenant-panel`.
   Это самое маленькое, что может показать стенд: один процесс Node без сборки, без логина панели и без бандла Vite.
   Устроено так же, как `apps/bot`: Node 22.18+ исполняет `.ts` напрямую.
2. Модель: Anthropic Messages API, по умолчанию `claude-sonnet-5-5` (`ANTHROPIC_MODEL`), за интерфейсом
   `ModelProvider` ([types.ts](/Users/ivanprotsko/upready/worktrees/upready-store/feat/t24-voice-chat/apps/owner-voice/src/model/types.ts)).
   Российская модель для RU-магазина добавляется одним файлом рядом с `anthropic.ts`.
   Без ключа отвечает роутер по ключевым словам (`rules.ts`). Это не языковая модель, а заглушка для стенда и тестов.
3. Доступ к данным владельца: API панели `/tenants/*` под логином магазина из env, только GET.
   Платформенный ключ `/admin` не используется: токен `/tenants` видит один магазин, а логину с ролью `manager` недоступны настройки и сотрудники.
   Клиент отказывает в любом пути вне `/store/` и `/tenants/` и в любом методе, кроме GET, ещё до запроса.
   Единственный POST — сам логин.

## Инструменты и карта команд

В карте admin-actions из chrxnasdmds 121 команда: 29 на чтение и 92 на запись.

| Инструмент | Запрос к магазину | Перенесено из карты |
|---|---|---|
| `find_products` | `GET /store/products`, цены региона страны `SHOP_COUNTRY` | `products.list`, `products.get` |
| `product_stock` | `GET /tenants/inventory-items`: на складе, в резерве, можно продать | `inventory.list` |
| `sales_summary` | `GET /tenants/analytics/summary`: выручку, заказы, средний чек, отмены, сравнение и лидеров считает сервер | `orders.list` (суммы берутся из маршрута сводки движка) |
| `recent_orders` | `GET /tenants/orders`, поля покупателя не запрашиваются | `orders.list` |
| `product_reviews` | `GET /tenants/reviews`, имя автора отбрасывается | строки в карте нет, это маршрут движка |
| `open_product` | `GET /store/products`, затем ссылка на панель и витрину | `products.get` |

Оставлено на этап 2 — 25 команд на чтение: `orders.get`, `orders.changes`, `orders.line_items`,
`orders.preview`, `orders.shipping_options`, `orders.export`, `orders.warehouse_split`, `returns.list`,
`exchanges.list`, `claims.list`, `payments.list`, `payments.providers`, `draft_orders.list`, `products.export`,
`reservations.list`, `customers.list` и `customers.groups_of` (персональные данные, нужно решение),
`promotions.list`, `promotions.rule_options`, `price_lists.list`, `home_banners.list`, `home_banners.get`,
`payment_methods.list`, `warehouse_shipments.list`, `ai_images.list`.
Все 92 команды на запись тоже оставлены на этап 2: 67 обратимых, 15 разрушающих, 8 денежных и 2 через платный API.
Панель Shift+Cmd+K и «чат владельца» из chrxnasdmds в этот этап не входили.

## Что изменено, по файлам

Пути ниже даны от корня ветки, папка указана в начале отчёта.

- `apps/owner-voice/src/config.ts`: все настройки из env. Статус показывает, какая часть живая, а какая на фикстурах; ключей в статусе нет.
- `apps/owner-voice/src/shop/api.ts`: клиент Store API (publishable key из открытого `/storefront/by-host`) и API панели
  (логин, Bearer, повторный логин на 401). Только GET.
- `apps/owner-voice/src/shop/fixtures.ts`: `fetch`, который отвечает из `fixtures/shop/*.json` по тем же URL.
- `apps/owner-voice/src/tools.ts`: шесть инструментов выше.
- `apps/owner-voice/src/model/types.ts`, `anthropic.ts`, `rules.ts`: интерфейс провайдера, Anthropic и роутер без модели.
  Просьбу что-то изменить роутер отклоняет: «Я только читаю данные магазина».
- `apps/owner-voice/src/agent.ts`: один ход — вопрос, вызовы инструментов, короткий ответ для озвучки. Не больше 4 раундов.
- `apps/owner-voice/src/elevenlabs.ts`: STT (`scribe_v1`) и TTS (`eleven_flash_v2_5`), перенесены из chrxnasdmds
  `apps/storefront/src/lib/agent/elevenlabs.ts`, без SDK.
- `apps/owner-voice/src/voice.ts`: живой голос ElevenLabs или фикстуры. Распознавание на фикстурах — таблица по sha256 записи, озвучка — тон-заглушка.
- `apps/owner-voice/src/app.ts`, `src/server.ts`, `src/page.html`: сборка частей, HTTP-стенд и страница.
  Пузыри как в owner-chat chrxnasdmds: ассистент — текст на фоне, владелец — белая «пилюля».
  Как только задан логин магазина, `ELEVENLABS_API_KEY` или `ANTHROPIC_API_KEY`, сервер без `STAND_PASSWORD` не стартует.
  Логин открывает продажи магазина, а ключи тратят платные кредиты (правка по ревью лида).
- `apps/owner-voice/scripts/fixture-run.ts`: прогон от начала до конца без ключей и без сети.
- `apps/owner-voice/fixtures/`: записи Store API cherkashino.com от 20.10.2026 (publishable key заменён).
  Файлы `tenants-*.json` собраны по коду маршрутов, а не записаны: логина магазина на машине сборки нет, и каждый файл говорит об этом в поле `_fixture`.
  Два `.wav` — сгенерированные тоны, а не голос.
- `apps/owner-voice/Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md`: стенд и RUNBOOK.
- `pnpm-lock.yaml`: только блок importer `apps/owner-voice` с теми же версиями `@types/node` и `typescript`, что у `apps/bot`.
  `pnpm install --lockfile-only` заодно поднял `@gorgo/medusa-integration` (`latest`) с 0.2.4 до 0.2.8. Это изменение я откатил, оно к задаче не относится.

## Тесты

`node --test src/*.test.ts src/**/*.test.ts` в `apps/owner-voice`: 34 теста, все проходят.
`tsc --noEmit` проходит чисто, `node scripts/check-file-length.mjs` — тоже.

```
ℹ tests 34
ℹ pass 34
ℹ fail 0
```

- Инструменты (`src/tools.test.ts`, HTTP замокан): URL и параметры каждого запроса, суммы и статусы по-русски.
  Отзывы проверены на отсутствие имени автора, заказы — на то, что поля покупателя не запрашиваются.
- Клиент магазина (`src/shop/api.test.ts`, `fetch` замокан): ключ из by-host, регион по стране, повторный логин на 401, только GET.
- STT и TTS (`src/elevenlabs.test.ts`, `fetch` замокан): multipart, заголовки, тело запроса, ошибки.
- Модель (`src/model/model.test.ts`): перевод разговора в блоки Anthropic, разбор `tool_use` на замоканном `fetch`, маршруты роутера.
- От начала до конца на фикстурах (`src/e2e.test.ts`): аудиофайл на входе — текст ответа и аудио на выходе.
  Плюс HTTP-стенд с паролем: страница, статус, голосовой ход. Названия тестов говорят, что это фикстуры.

## Прогон на фикстурах

`node scripts/fixture-run.ts` из `apps/owner-voice`:

```json
{
  "config": { "shop": "cherkashino.com", "storeApi": "fixture", "ownerApi": "fixture", "voice": "fixture",
              "model": "rules (no model key, keyword router)" },
  "input": "/Users/ivanprotsko/upready/worktrees/upready-store/feat/t24-voice-chat/apps/owner-voice/fixtures/voice/question-sales-week.wav",
  "transcript": "Сколько мы продали за неделю?",
  "calls": [{ "name": "sales_summary", "input": { "period": "7d" } }],
  "reply": "Продажи за 7 дней:\nВыручка: 1 284 $ (+16% к прошлому периоду)\nЗаказов: 23 (+10% к прошлому периоду)\nСредний чек: 55,83 $\nОтменено: 1 на 30 $\nЛидеры: Очищение печени (3 шт.), Каштан капсулы от варикоза 60 шт (9 шт.), Тройчатка плюс (8 шт.)",
  "audioOut": { "file": "/tmp/owner-voice-reply.wav", "bytes": 38444, "contentType": "audio/wav" }
}
```

Цифры продаж здесь из собранной фикстуры, а не из магазина.

## Живая проверка каталога cherkashino.com

Store API работает без ключа, Store API живой, остальное на фикстурах:

```
Сколько стоит тройчатка? → Нашлось 1: | Тройчатка плюс — 15 $ https://panel.cherkashino.com/products/prod_01M2GRC9BG5GJG7CV5X0WKMNNC 1752ms
Открой карточку мумиё → Открываю «Мумиё алтайское очищенное натуральное 100%». … https://panel.cherkashino.com/products/prod_01M2GRDZBZST9G3BPQD3BG5H8D 426ms
Найди товар печени → Нашлось 1: | Очищение печени — 199 $ https://panel.cherkashino.com/products/prod_01M2GRCGSCKDNQ4SCAPEVBCCN9 249ms
```

Движок cherkashino.com — это INTL-инстанс на `shipshift.dev`. Он сам отдаёт магазин и его publishable key по `GET /storefront/by-host?host=cherkashino.com`.
Цены показаны в USD, потому что регион России на этом инстансе в долларах.

## Что нужно стенду

- Node 22.18+ или Docker. Порт 5470. Запуск: `docker compose up -d --build` в `apps/owner-voice`.
  Для `env_file` с `required: false` нужен Docker Compose 2.24+.
- HTTPS перед стендом, иначе браузер не откроет микрофон (кроме `localhost`).
- В `.env`, всё необязательно:
  - `ELEVENLABS_API_KEY` (и `ELEVENLABS_VOICE_ID`, если не клон голоса Оксаны);
  - `ANTHROPIC_API_KEY`;
  - `SHOP_LOGIN_EMAIL` и `SHOP_LOGIN_PASSWORD` — вход в панель cherkashino.com с ролью `manager`;
  - `STAND_PASSWORD` — обязателен, как только задан логин или любой из двух ключей.
- Остальное по умолчанию уже указывает на cherkashino.com. Таблица переменных — в `apps/owner-voice/README.md`.

## Пробелы и пропущенные шаги

- `ui-task.mjs pack` (первая команда брифа) не запущен: на boat его нет, в `staff/tools` только decide, worker-signal, line-next и gh-poll.
  `run-queue.mjs` здесь тоже нет. Тесты и проверку типов я запускал напрямую через `nice -n 10`: это лёгкие прогоны меньше чем на секунду.
- Чтение `/tenants/*` вживую не проверено, потому что логина магазина нет. Форма ответов взята из кода маршрутов в `apps/backend/src/api/tenants`.
  Одно предположение не проверено: что `/tenants/inventory-items` отдаёт `stocked_quantity` и `reserved_quantity` по запросу `fields`.
  Эти поля есть в Admin-форме inventory item Medusa.
- Живые ElevenLabs и Anthropic не вызывались, ключей нет. Проверено на замоканном `fetch`.
- `docker build` не запускался, и в CI (`pr-checks.yml`) нет шага для `apps/owner-voice`.
- 12 открытых пометок брифа относятся к прототипу заказов t-2026-10-13-21. Лид отметил, что они не связаны с этой задачей, и я их не трогал.

## Источники

- chrxnasdmds, ветка `feature/voice-widget-revive` (коммит 296b3e3), клон только для чтения в scratchpad:
  `apps/storefront/src/lib/agent/elevenlabs.ts`, `apps/storefront/src/app/api/agent/voice/stt/route.ts`,
  `packages/admin-actions/src/admin-actions-map.json`, `packages/agent-core/src/tools/get-sales-summary.ts`, `admin-query.ts`.
- upready-store: `apps/backend/src/api/tenants/{permissions.ts,tenant-scope.ts,analytics/summary/route.ts,orders/route.ts,inventory-items/route.ts,reviews/*}`,
  `apps/backend/src/api/storefront/by-host/route.ts`, `deploy/instances/intl.json`, `deploy/mt/shipshift.env.example`, `apps/bot`.
